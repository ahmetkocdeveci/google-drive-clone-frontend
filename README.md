# Ortak Drive · Frontend

Birden fazla çalışma alanında dosya ve klasör paylaşmayı sağlayan Nuxt uygulaması. Her alanda Owner, Editor veya Viewer üyeliğiyle çalışılır. Ayrı Express API'si rol ve çalışma alanı sınırlarını her istekte uygular.

## Bağlantılar

| Kaynak | Adres |
| --- | --- |
| Canlı uygulama | [ahmet-drive.pages.dev](https://ahmet-drive.pages.dev) |
| Canlı API | [Northflank API](https://p01--google-drive-clone-backend--d7y2sxv84npc.code.run) |
| API hazırlık kontrolü | [/health/ready](https://p01--google-drive-clone-backend--d7y2sxv84npc.code.run/health/ready) |
| Frontend deposu | [google-drive-clone-frontend](https://github.com/ahmetkocdeveci/google-drive-clone-frontend) |
| Backend deposu | [google-drive-clone-backend](https://github.com/ahmetkocdeveci/google-drive-clone-backend) |
| Otomatik kontroller | [Frontend checks](https://github.com/ahmetkocdeveci/google-drive-clone-frontend/actions/workflows/ci.yml) |

Depolar özeldir; kaynak koduna erişim için depo yetkisi gerekir. Korumalı API yollarını doğrudan açmak `403 EDGE_REQUIRED` döndürür; uygulama aynı origin `/api/v1` gateway'ini kullanır.

## Özellikler ve roller

- E-posta/parola ve Google ile giriş, kayıt, doğrulama, parola sıfırlama ve hesap güvenliği.
- Alan oluşturma/seçme; e-posta davetleri, üyeler, roller ve sahiplik devri.
- İç içe klasörler, breadcrumb, klasör yükleme, sürükle/bırak ve ZIP indirme.
- Dosya yükleme/indirme, arama, filtre, sıralama, liste/kart görünümü ve son kullanılanlar.
- Ad değiştirme, taşıma, çoklu silme; gerçek parent konumu ve **Klasöre git**.
- Görsel ve çok sayfalı PDF önizleme; Owner için sayfalı işlem geçmişi.
- Mobil gezinme, klavye ile pencereler ve yükleniyor/boş/hata durumları.

| Yetki | Owner | Editor | Viewer |
| --- | :---: | :---: | :---: |
| Görüntüleme, önizleme ve indirme | ✓ | ✓ | ✓ |
| Dosya/klasör oluşturma, değiştirme ve silme | ✓ | ✓ | — |
| Üye, davet, rol ve alan ayarları | ✓ | — | — |
| İşlem geçmişi ve sahiplik devri | ✓ | — | — |

Dosya içeriğini uygulama içinde düzenleme kapsam dışıdır. Word/PowerPoint özgün biçimiyle indirilir; Office önizlemesi sunulmaz. SVG/HTML içeriği uygulama içinde çalıştırılmaz.

## Yerel kurulum

Node.js **24.19.0**, pnpm **11.25.0** kullanılır. API için Docker gerekir. Depoları kardeş dizinler olarak klonlayıp önce [backend kurulumunu](https://github.com/ahmetkocdeveci/google-drive-clone-backend#yerel-kurulum) tamamlayın.

```sh
git clone https://github.com/ahmetkocdeveci/google-drive-clone-frontend.git
cd google-drive-clone-frontend
pnpm install --frozen-lockfile
```

`.env.example` dosyasını, mevcut ayarların üzerine yazmadan `.env` olarak kopyalayın:

```dotenv
NUXT_PUBLIC_DATA_MODE=http
NUXT_PUBLIC_API_BASE=http://127.0.0.1:4100/api/v1
```

`pnpm dev` ile frontend `http://127.0.0.1:4179` adresinde açılır. API `4100` portundadır. Kayıt sonrası doğrulama e-postasını `http://127.0.0.1:8025` Mailpit kutusunda açın. Google girişi yalnız backend'de yapılandırıldığında görünür. Origin ayarlarında `localhost` ile `127.0.0.1` adreslerini karıştırmayın.

### Açık demo modu

`NUXT_PUBLIC_DATA_MODE=demo` yalnız arayüz denemesi içindir. Örnek giriş: `ahmet@example.com` / `Demo1234!`. Veriler ve yüklenen baytlar sekmenin belleğinde tutulur, yenilemede sıfırlanır. Gerçek Google/SMTP, kalıcı veri veya güvenli tenant sınırı sağlamaz. HTTP hatasında sessizce demo moduna geçilmez.

## Test ve kod düzeni

```sh
pnpm format:check
pnpm test
pnpm typecheck
pnpm test:e2e:types
pnpm build
pnpm check:dependencies
pnpm build:pages
```

`format:check`, Vue/TypeScript/CSS ve testlerin ortak Prettier biçimini denetler; `pnpm format` düzenler. Birim testleri HTTP adaptörü, oturum yarışları, rol/alan değişimi, klasör aktarımı, PDF ve gateway'i kapsar. `test:e2e:types` yalnız tarayıcı test kaynaklarının tip kontrolüdür.

Gerçek tarayıcı testleri CI'daki **browser** işindedir. İş backend `main` dalını salt okunur deploy key ile kardeş dizine alır; kendi MongoDB/Mailpit ve geçici DB/deposuyla Chromium'u başlatır. Tarayıcıdan önce backend'in iki gerçek frontend HTTP adapter entegrasyon testi de bu ortamda çalışır. Canlı kullanıcı verisi, Google hesabı veya gerçek alıcılara SMTP kullanılmaz. Rapor ve hata ekran görüntüleri Actions artifact'ında 7 gün tutulur; trace/video kapalıdır. Backend değiştiğinde iş `workflow_dispatch` ile yeniden çalıştırılabilir. Fork PR'larında özel backend erişimi olmadığı için browser işi atlanır.

Yetkili, ayrı bir yerel test ortamında:

1. Normal geliştirme sunucularının `4100/4179` portlarını boşaltın.
2. Backend'de `docker compose up -d` ve `node scripts/e2e-server.mjs --isolated-test-server` çalıştırın.
3. Frontend'de `pnpm exec playwright install chromium` çalıştırın.
4. `E2E_TEST_ENVIRONMENT=1` ayarlayıp `pnpm test:e2e` çalıştırın. PowerShell: `$env:E2E_TEST_ENVIRONMENT='1'`.
5. Rapor `playwright-report/` altındadır. Test API'si normal kapanışta kendi geçici DB/deposunu temizler.

Senaryolar kayıt/doğrulama, parola sıfırlama, Viewer daveti, UI/API rol ve tenant reddi, iç içe klasör aktarımı, gerçek baytlarla indirme, görsel/PDF, klavye, dar mobil ekran ve axe WCAG A/AA taramalarını içerir. axe taraması tam erişilebilirlik sertifikası değildir. Google sağlayıcısıyla canlı giriş ayrıca manuel kabul gerektirir.

## Canlı yayın

Frontend **Cloudflare Pages**, API ve private MongoDB **Northflank**, dosyalar **Cloudflare R2** üzerindedir. Bilgisayarın açık kalması gerekmez.

| Pages ayarı | Değer |
| --- | --- |
| Production branch | `main` |
| Framework preset | None / özel build |
| Build command | `pnpm build:pages` |
| Build output directory | `.pages-output/public` |
| Root directory | Repo kökü |
| Node / pnpm | `NODE_VERSION=24.19.0`, `PNPM_VERSION=11.25.0` |

Function: `PUBLIC_APP_ORIGIN=https://ahmet-drive.pages.dev`, `UPSTREAM_API_ORIGIN=<Northflank HTTPS origin>` ve backend ile aynı `EDGE_PROXY_TOKEN` **Secret**. Bu değerler tarayıcı paketine konmaz. `/api/*` Function'a, diğer yollar statik SPA'ya gider; API yanıtları cache'lenmez. Google callback'i `https://ahmet-drive.pages.dev/api/v1/auth/google/callback` adresidir. [Pages rehberi](docs/cloudflare-pages.md).

`pnpm build` Node sunucusu için `.output` üretir; `pnpm preview` yerelde açar. `generate` / `preview:static` yalnız statik arayüzdür, tek başına API sağlamaz. Pages üretimi ayrı `.nuxt-pages` / `.pages-output` dizinlerini kullanır.

## Mimari

```text
app/components/    Dosya alanı, pencereler ve önizleme
app/composables/   Oturum, alan ve bildirim durumu
app/layouts/       Giriş, alan seçimi ve alan düzeni
app/middleware/    Giriş ve üyelik yönlendirmeleri
app/pages/         Uygulama ekranları
app/services/      DriveApi, HTTP ve bellek içi demo adaptörleri
shared/            DTO tipleri ve yetki matrisi
functions/api/     Cloudflare Pages gateway
tests/             Birim ve tarayıcı senaryoları
```

Başlıca yollar: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`, `/workspaces`, `/workspaces/:wid/files`, `/workspaces/:wid/members`, `/workspaces/:wid/activity`, `/workspaces/:wid/settings`, `/invitations/accept`.

HTTP adaptörü [API sözleşmesini](docs/api-contract.md) kullanır. Alan/hesap değişiminde istekler iptal edilir, eski sonuçlar kapsam kontrolüyle reddedilir. Sekmeye dönüşte güncel üyelik okunur; yetki kaybında içerik ve yönetim kontrolleri kapatılır. UI kontrolü backend yetkilendirmesinin yerine geçmez.

Oturum, CSRF ve davet tokenları localStorage/sessionStorage'a yazılmaz. Bağlantı tokenları fragmentten alınıp URL'den temizlenir. Google dönüşündeki davet backend'de şifreli ve session/state'e bağlı korunur; kullanıcı dönüşte ayrıca kabul eder. Genel çıkış bekleyen bağlantı durumunu temizler.

## Sınırlar ve bağımlılıklar

Nuxt **4.6.2**, Vue **3.5.44**, Vue Router **5.4.0**, TypeScript **6.0.3** ve PDF.js **6.4.299** sabitlenmiştir. Lockfile korunur; TypeScript 6 mevcut Vue tip araçlarıyla uyumludur.

- PDF, iframe yerine PDF.js canvas'ına çizilir; çok sayfa, worker/font/CMap/WASM dağıtıma dahildir. Parolalı/bozuk PDF için indirme sunulur. Metin seçme/arama katmanı yoktur.
- Dosya **25 MiB**, alan **5 GiB**, yol **64 seviye**, klasör aktarımı **10.000 öğe**. Dosya seçicisi boş klasörleri bildirmez; destekleyen sürükle/bırak API'si aktarır.
- Aktarım atomik değildir; hata/iptal öncesi tamamlanan öğeler kalır. Tekrar yükleme yeni kök oluşturur. Büyük ZIP'in son indirmesi tarayıcı belleğine bağlıdır.
- 24 Ekim taramasında `node-forge@1.4.0` için **1 high, henüz yamasız araç zinciri uyarısı** kalmıştır. Paket üretim runtime'ından dışlanır. `check:dependencies`, runtime sınırını kontrol edip yalnız bu bildirimin tam derleme yoluna izin verir; yeni bildirim/farklı yol/yayımlanan yama kontrolü durdurur. Bu sıfır açık anlamına gelmez. [Güvenlik kaydı](docs/bagimlilik-guvenlik-durumu.md).

[Teslim kontrolü](docs/release-checklist.md)
