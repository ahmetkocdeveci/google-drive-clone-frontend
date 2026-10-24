import { createMockDriveApi } from '~/services/mock-drive-api'
import { createHttpDriveApi } from '~/services/http-drive-api'
import { resolveDataMode } from '../../shared/runtime-config'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const mode = resolveDataMode(config.public.dataMode)
  const driveApi =
    mode === 'http'
      ? createHttpDriveApi({ baseUrl: String(config.public.apiBase) })
      : createMockDriveApi()
  return { provide: { driveApi } }
})
