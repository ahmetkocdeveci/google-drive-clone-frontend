const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const requestHeaders = [
  'accept',
  'accept-language',
  'content-type',
  'origin',
  'x-csrf-token',
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
]

function origin(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password)
    throw new Error('Invalid deployment origin')
  return url.origin
}
function failure(status, code, message) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
  )
}

export function createApiProxy(fetchUpstream = globalThis.fetch) {
  return async function proxy({ request, env }) {
    let publicOrigin, upstreamOrigin
    try {
      publicOrigin = origin(env.PUBLIC_APP_ORIGIN)
      upstreamOrigin = origin(env.UPSTREAM_API_ORIGIN)
      if (publicOrigin === upstreamOrigin || !/^[a-f0-9]{64}$/i.test(env.EDGE_PROXY_TOKEN || ''))
        throw new Error('Invalid gateway configuration')
    } catch {
      return failure(503, 'GATEWAY_NOT_CONFIGURED', 'Yayın bağlantısı henüz hazır değil.')
    }
    const url = new URL(request.url)
    if (url.origin !== publicOrigin)
      return failure(403, 'ORIGIN_FORBIDDEN', 'Bu kaynaktan istek kabul edilmiyor.')
    if (!/^\/api\/v1(?:\/|$)/.test(url.pathname))
      return failure(404, 'NOT_FOUND', 'Kaynak bulunamadı.')
    if (!methods.has(request.method))
      return failure(405, 'METHOD_NOT_ALLOWED', 'Bu işlem desteklenmiyor.')
    const suppliedOrigin = request.headers.get('Origin')
    if (suppliedOrigin && suppliedOrigin !== publicOrigin)
      return failure(403, 'ORIGIN_FORBIDDEN', 'Bu kaynaktan istek kabul edilmiyor.')
    const clientIp = request.headers.get('CF-Connecting-IP')
    if (!clientIp || clientIp.length > 45 || /[\s,%]/.test(clientIp))
      return failure(403, 'CLIENT_IP_REQUIRED', 'İstek doğrulanamadı.')
    const headers = new Headers()
    for (const name of requestHeaders) {
      const value = request.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
    const cookie = request.headers
      .get('Cookie')
      ?.split(';')
      .map((value) => value.trim())
      .filter((value) => value.startsWith('__Host-drive-session='))
      .join('; ')
    if (cookie) headers.set('Cookie', cookie)
    headers.set('X-Drive-Edge-Token', env.EDGE_PROXY_TOKEN)
    headers.set('X-Drive-Client-IP', clientIp)
    const target = new URL(upstreamOrigin)
    target.pathname = url.pathname
    target.search = url.search
    try {
      const result = await fetchUpstream(target.href, {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: request.signal,
        ...(!['GET', 'HEAD'].includes(request.method)
          ? { body: request.body, duplex: 'half' }
          : {}),
      })
      const responseHeaders = new Headers(result.headers)
      responseHeaders.set('Cache-Control', 'private, no-store')
      responseHeaders.set('CDN-Cache-Control', 'no-store')
      responseHeaders.set('Cloudflare-CDN-Cache-Control', 'no-store')
      responseHeaders.set('Referrer-Policy', 'no-referrer')
      responseHeaders.delete('Server')
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders,
      })
    } catch {
      return failure(503, 'API_UNAVAILABLE', 'Sunucuya ulaşılamadı. Lütfen yeniden dene.')
    }
  }
}

export const onRequest = createApiProxy()
