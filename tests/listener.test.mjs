import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { get } from 'node:https'
import { tmpdir } from 'node:os'
import path from 'node:path'

const nuxtRequire = createRequire(import.meta.resolve('nuxt'))
const nitroRequire = createRequire(nuxtRequire.resolve('@nuxt/nitro-server'))
const listenerRequire = createRequire(nitroRequire.resolve('nitropack/package.json'))
const commonjsEntry = listenerRequire.resolve('listhen')
const esmEntry = path.join(path.dirname(commonjsEntry), 'index.mjs')
const modules = [
  ['ESM', (await import(pathToFileURL(esmEntry).href)).listen],
  ['CommonJS', listenerRequire('listhen').listen],
]
const options = { hostname: '127.0.0.1', port: 0, isTest: true, showURL: false, autoClose: false }
let directory, keyFile, certFile, pfxFile, key, cert

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'drive-listener-test-'))
  keyFile = path.join(directory, 'key.pem')
  certFile = path.join(directory, 'cert.pem')
  pfxFile = path.join(directory, 'fixture.pfx')
  const windowsOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe'
  const openssl =
    process.env.OPENSSL_BIN ||
    (process.platform === 'win32' && existsSync(windowsOpenSsl) ? windowsOpenSsl : 'openssl')
  for (const args of [
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyFile,
      '-out',
      certFile,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ],
    [
      'pkcs12',
      '-export',
      '-inkey',
      keyFile,
      '-in',
      certFile,
      '-out',
      pfxFile,
      '-passout',
      'pass:listener-test',
    ],
  ]) {
    const result = spawnSync(openssl, args, { stdio: 'ignore', windowsHide: true })
    assert.equal(
      result.status,
      0,
      'OpenSSL must be available to generate temporary test-only credentials',
    )
  }
  key = await readFile(keyFile, 'utf8')
  cert = await readFile(certFile, 'utf8')
})
after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

async function readTrustedTls(listener) {
  return new Promise((resolve, reject) => {
    const request = get(
      {
        hostname: '127.0.0.1',
        port: listener.server.address().port,
        ca: cert,
        rejectUnauthorized: true,
      },
      (response) => {
        let text = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => {
          text += chunk
        })
        response.on('end', () => resolve(text))
        response.on('error', reject)
      },
    )
    request.setTimeout(5000, () => request.destroy(new Error('TLS fixture request timed out')))
    request.on('error', reject)
  })
}

for (const [format, listen] of modules) {
  test(`${format}: HTTP listener works without node-forge`, async () => {
    const listener = await listen((_request, response) => response.end('native-http'), options)
    try {
      const port = listener.server.address().port
      const response = await fetch(`http://127.0.0.1:${port}`, {
        signal: AbortSignal.timeout(5000),
      })
      assert.equal(await response.text(), 'native-http')
    } finally {
      await listener.close()
    }
  })
  test(`${format}: automatic certificates fail closed`, async () => {
    await assert.rejects(
      listen(() => assert.fail('HTTP fallback must not run'), { ...options, https: true }),
      { code: 'ERR_LISTENER_CERTIFICATE_REQUIRED' },
    )
  })
  for (const mode of ['PEM files', 'inline PEM', 'PFX']) {
    test(`${format}: supplied ${mode} uses trusted native TLS`, async () => {
      const https =
        mode === 'PFX'
          ? { pfx: pfxFile, passphrase: 'listener-test' }
          : mode === 'inline PEM'
            ? { key, cert }
            : { key: keyFile, cert: certFile }
      const listener = await listen((_request, response) => response.end('native-tls'), {
        ...options,
        https,
      })
      try {
        assert.equal(await readTrustedTls(listener), 'native-tls')
      } finally {
        await listener.close()
      }
    })
  }
  test(`${format}: a wrong PFX password never falls back to HTTP`, async () => {
    await assert.rejects(
      listen(() => assert.fail('HTTP fallback must not run'), {
        ...options,
        https: { pfx: pfxFile, passphrase: 'incorrect' },
      }),
    )
  })
}
