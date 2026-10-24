export default defineNuxtRouteMiddleware(async (to) => {
  const drive = useDrive()
  await drive.initialize()
  if (!to.path.startsWith('/workspaces') && to.path !== '/account') return
  if (!drive.user.value) return navigateTo({ path: '/login', query: { returnTo: to.fullPath } })
  if (!drive.user.value.emailVerified)
    return navigateTo({ path: '/verify-email', query: { returnTo: to.fullPath } })
})
