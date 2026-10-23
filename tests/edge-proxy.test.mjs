import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiProxy } from '../functions/api/[[path]].js'

const env = { PUBLIC_APP_ORIGIN: 'https://app.example.com', UPSTREAM_API_ORIGIN: 'https://api.example.com', EDGE_PROXY_TOKEN: 'a'.repeat(64) }
function context(path = '/api/v1/auth/me', options = {}, settings = env) {
  return { env: settings, request: new Request(env.PUBLIC_APP_ORIGIN + path, { ...options, headers: { 'CF-Connecting-IP': '203.0.113.8', ...options.headers } }) }
}

test('gateway forwards only approved headers to fixed upstream and preserves stream, cookie and Range', async () => {
  let called = 0
  const proxy = createApiProxy(async (url, init) => {
    called++
    assert.equal(url, 'https://api.example.com/api/v1/workspaces/one/nodes/file/content?download=1')
    assert.equal(init.redirect, 'manual')
    assert.equal(init.headers.get('Cookie'), '__Host-drive-session=one; __Host-drive-session=two')
    assert.equal(init.headers.get('X-Drive-Edge-Token'), env.EDGE_PROXY_TOKEN)
    assert.equal(init.headers.get('X-Drive-Client-IP'), '203.0.113.8')
    assert.equal(init.headers.get('Range'), 'bytes=3-7')
    for (const name of ['authorization', 'forwarded', 'x-forwarded-for', 'host', 'cf-connecting-ip', 'x-unrelated']) assert.equal(init.headers.get(name), null)
    const headers = new Headers({ 'Content-Range': 'bytes 3-7/20', 'Content-Disposition': 'attachment; filename="a.pdf"', 'Cache-Control': 'public, max-age=999' })
    headers.append('Set-Cookie', '__Host-drive-session=new; Path=/; Secure; HttpOnly; SameSite=Lax')
    headers.append('Set-Cookie', '__Host-drive-session=; Path=/; Secure; Max-Age=0')
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([3, 4, 5, 6, 7])); controller.close() } }), { status: 206, headers })
  })
  const result = await proxy(context('/api/v1/workspaces/one/nodes/file/content?download=1', { headers: { Cookie: 'tracking=secret; __Host-drive-session=one; __Host-drive-session=two', Authorization: 'Bearer private', 'X-Drive-Edge-Token': 'forged', 'X-Drive-Client-IP': '198.51.100.9', 'X-Forwarded-For': '198.51.100.10', Forwarded: 'for=evil', Host: 'evil.example', Range: 'bytes=3-7', 'X-Unrelated': 'private' } }))
  assert.equal(called, 1)
  assert.equal(result.status, 206)
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [3, 4, 5, 6, 7])
  assert.equal(result.headers.getSetCookie().length, 2)
  assert.equal(result.headers.get('Content-Range'), 'bytes 3-7/20')
  assert.match(result.headers.get('Cache-Control'), /no-store/)
  assert.equal(result.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store')
})

test('Google redirect stays a redirect without sending the edge key to the provider', async () => {
  let calls = 0
  const proxy = createApiProxy(async (_url, init) => {
    calls++
    assert.equal(init.redirect, 'manual')
    return new Response(null, { status: 303, headers: { Location: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque' } })
  })
  const response = await proxy(context('/api/v1/auth/google/callback?code=opaque&state=opaque'))
  assert.equal(calls, 1)
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('Location'), 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque')
  assert.ok(!(await response.text()).includes(env.EDGE_PROXY_TOKEN))
})

test('gateway preserves POST body, Origin, CSRF and request cancellation without adding a missing Origin', async () => {
  const controller = new AbortController()
  const request = context('/api/v1/auth/google/start', { method: 'POST', signal: controller.signal, headers: { Origin: env.PUBLIC_APP_ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' }, body: '{"returnTo":"/invitations/accept"}' })
  const proxy = createApiProxy(async (_url, init) => {
    assert.equal(init.headers.get('Origin'), env.PUBLIC_APP_ORIGIN)
    assert.equal(init.headers.get('X-CSRF-Token'), 'csrf')
    assert.equal(await new Response(init.body).text(), '{"returnTo":"/invitations/accept"}')
    controller.abort()
    assert.equal(init.signal.aborted, true)
    return Response.json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth' })
  })
  assert.equal((await proxy(request)).status, 200)
  const missingOrigin = createApiProxy(async (_url, init) => { assert.equal(init.headers.get('Origin'), null); return new Response(null, { status: 403 }) })
  assert.equal((await missingOrigin(context('/api/v1/auth/logout', { method: 'POST' }))).status, 403)
})

test('preview hosts, foreign Origin, non-API paths and invalid configuration fail before upstream fetch', async () => {
  let called = 0
  const proxy = createApiProxy(async () => { called++; return new Response('unexpected') })
  const preview = context()
  preview.request = new Request('https://preview.app.example.com/api/v1/auth/me', { headers: { 'CF-Connecting-IP': '203.0.113.8' } })
  assert.equal((await proxy(preview)).status, 403)
  assert.equal((await proxy(context(undefined, { headers: { Origin: 'https://other.example.com' } }))).status, 403)
  for (const path of ['/ops/status', '/metrics', '/health', '/api/v2/anything']) assert.equal((await proxy(context(path))).status, 404)
  assert.equal((await proxy(context(undefined, { headers: { 'CF-Connecting-IP': '' } }))).status, 403)
  for (const settings of [{}, { ...env, EDGE_PROXY_TOKEN: '' }, { ...env, UPSTREAM_API_ORIGIN: env.PUBLIC_APP_ORIGIN }, { ...env, UPSTREAM_API_ORIGIN: 'http://api.example.com' }, { ...env, UPSTREAM_API_ORIGIN: 'https://api.example.com/path' }]) assert.equal((await proxy(context(undefined, {}, settings))).status, 503)
  assert.equal(called, 0)
})

test('HEAD keeps its empty body and network failure never discloses upstream details or secrets', async () => {
  const head = createApiProxy(async (_url, init) => { assert.equal(init.body, undefined); return new Response(null, { headers: { 'Content-Length': '10' } }) })
  const response = await head(context(undefined, { method: 'HEAD' }))
  assert.equal(response.body, null)
  assert.equal(response.headers.get('Content-Length'), '10')
  const failed = createApiProxy(async () => { throw new Error('secret ' + env.EDGE_PROXY_TOKEN + env.UPSTREAM_API_ORIGIN) })
  const error = await failed(context())
  assert.equal(error.status, 503)
  assert.deepEqual(await error.json(), { error: { code: 'API_UNAVAILABLE', message: 'Sunucuya ulaşılamadı. Lütfen yeniden dene.' } })
})
