# Cloudflare Pages pilot kurulumu

Frontend statik Nuxt SPA olarak derlenir; kökteki `functions/api/[[path]].js` yalnız `/api/v1` isteklerini sabit Northflank backend'ine stream ile aktarır. Google redirect'i takip etmez; Location ve Set-Cookie yanıtlarını tarayıcıya döndürür. Cookie, Origin, CSRF ve Range taşınır; rastgele Authorization/forwarded/özel başlıklar aktarılmaz. API yanıtları cache'lenmez.

## Pages proje ayarları

| Alan | Değer |
| --- | --- |
| GitHub repository | `google-drive-clone-frontend` private repo |
| Production branch | `main` |
| Framework preset | None / özel build |
| Build command | `pnpm build:pages` |
| Build output directory | `.pages-output/public` |
| Root directory | Repo kökü |
| Build Node sürümü | `NODE_VERSION=24.19.0` |
| Build pnpm sürümü | `PNPM_VERSION=11.25.0` |

`build:pages`, ayrı `.nuxt-pages` ve `.pages-output` klasörleri kullanır; standart Node sunucusunun `.output` çıktısını değiştirmez. HTTP modu ve `/api/v1` build sırasında açıkça seçilir. PDF CMap/font/WASM ve worker dosyaları dağıtıma girer. Top-level404 kaldırılır; Pages gerçek statik dosyaları sunar, bilinmeyen SPA yollarında index'e döner. `/api/*` Function rotası olarak işlenir.

## Production Function ayarları

- `PUBLIC_APP_ORIGIN`: kendi projenizin tam HTTPS adresi, sonunda slash yok.
- `UPSTREAM_API_ORIGIN`: Northflank'ın tam HTTPS adresi, path yok.
- `EDGE_PROXY_TOKEN`: backend ile aynı rastgele64-hex anahtar; **Secret** olarak saklanır.

Bu üç değer Nuxt public runtime config'e eklenmez; tarayıcı paketine girmez. Kullanıcı farklı preview host'u üzerinden Production API'ye gidemez; Function exact public origin'i doğrular. Preview ortamına Production sırlarını aktarmayın. Eksik/yanlış ayarda Function503 döner; sahte/eksik Cloudflare istemci IP'si reddedilir. Secret değiştirilirse iki taraf birlikte güncellenmelidir.

Pages Functions günlük kotası için dashboard'da **Fail closed** seçin. Sadece API rotaları Function çağırır; statik varlıklar `_routes.json` ile dışında kalır. `/ops`, `/metrics` ve backend health yolları proxy edilmez. Fonksiyon mevcut oturum/CSRF/rol/tenant kontrolünün yerine geçmez.

Backend'deki `scripts/prepare-northflank.mjs`, gerekli ayarları Git dışındaki aktarım dosyalarına hazırlayabilir; [backend rehberi](https://github.com/ahmetkocdeveci/google-drive-clone-backend/blob/main/docs/cloudflare-northflank.md). Gerçek değerleri sohbete veya screenshot'a koymayın.

Bu dosya yayın kaydı değildir. Yerel83 frontend testi, mock upstream gateway kontrolleri, tip ve statik artifact kontrolü canlı Cloudflare/Northflank kabulünün yerine geçmez. Son adımlar: uygulama adresinin size ait olduğunu doğrulama, Google callback, R2 CORS, Atlas ağ erişimi, SMTP verify ve gerçek HTTPS kullanıcı akışları.

Kaynaklar: [Functions rotaları ve fail closed](https://developers.cloudflare.com/pages/functions/routing/), [SPA davranışı](https://developers.cloudflare.com/pages/configuration/serving-pages/), [Git entegrasyonu](https://developers.cloudflare.com/pages/get-started/git-integration/).
