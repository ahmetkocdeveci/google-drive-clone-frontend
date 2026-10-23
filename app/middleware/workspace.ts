export default defineNuxtRouteMiddleware(async to => {
  const drive = useDrive()
  const id = String(to.params.wid || '')
  try {
    const workspace = await drive.activateWorkspace(id)
    if (to.path.endsWith('/members') && !workspace.capabilities.includes('members:read')) return navigateTo(`/workspaces/${encodeURIComponent(id)}/files`)
    if (to.path.endsWith('/settings') && !workspace.capabilities.includes('workspace:update')) return navigateTo(`/workspaces/${encodeURIComponent(id)}/files`)
    if (to.path.endsWith('/activity') && !workspace.capabilities.includes('audit:read')) return navigateTo(`/workspaces/${encodeURIComponent(id)}/files`)
  } catch (error) {
    drive.currentWorkspace.value = null
    throw createError({ statusCode: (error as { status?: number }).status || 503, statusMessage: 'Çalışma alanı açılamadı', message: error instanceof Error ? error.message : 'Bu alana erişimin olmayabilir.' })
  }
})
