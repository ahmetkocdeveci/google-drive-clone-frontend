export type DataMode = 'demo' | 'http'

/** Demo data is opt-in; an absent or mistyped deploy setting must not impersonate a signed-in account. */
export function resolveDataMode(value: unknown): DataMode {
  if (value === undefined || value === null || value === '') return 'http'
  if (value === 'http' || value === 'demo') return value
  throw new Error('NUXT_PUBLIC_DATA_MODE yalnızca http veya demo olabilir.')
}
