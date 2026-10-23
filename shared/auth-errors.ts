const googleMessages = {
  google_cancelled: 'Google ile giriş iptal edildi. Yeniden deneyebilir veya e-posta adresinle giriş yapabilirsin.',
  google_failed: 'Google ile giriş tamamlanamadı. Lütfen yeniden dene.',
  google_account_link_required: 'Bu e-posta adresiyle zaten bir hesabın var. E-posta adresin ve şifrenle giriş yap.',
  google_state_invalid: 'Google giriş bağlantısının süresi dolmuş veya oturum değişmiş. Yeniden giriş yap.',
  google_unavailable: 'Google ile giriş şu anda kullanılamıyor. E-posta adresin ve şifrenle devam edebilirsin.',
} as const

/** Query parameters select a fixed message; provider responses are never displayed. */
export function googleAuthErrorMessage(code: unknown): string {
  return typeof code === 'string' && Object.hasOwn(googleMessages, code)
    ? googleMessages[code as keyof typeof googleMessages]
    : ''
}
