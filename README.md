# Ortak Drive — Nuxt frontend

Drive benzeri arayüz, workspace bazlı roller ve dosya yönetimi için bağımsız Nuxt projesi. Eşlik eden API: [google-drive-clone-backend](https://github.com/ahmetkocdeveci/google-drive-clone-backend). İki depoyu aynı üst dizine klonlayarak birlikte çalıştırabilirsiniz.

## Çalıştırma

Node.js **24.16 veya üzeri** ve pnpm kullanılır.

```powershell
cd google-drive-clone-frontend
pnpm install
Copy-Item .env.example .env # yalnız .env henüz yoksa
pnpm dev
```

Yerel adres: `http://127.0.0.1:4179`. Gerçek API için [backend kurulumunu](https://github.com/ahmetkocdeveci/google-drive-clone-backend) da çalıştır.

Owner çalışma alanı menüsündeki **İşlem geçmişi**, `/workspaces/:wid/activity` sayfasıdır. Gerçek API olaylarını en yeniden başlayarak yükler; daha eski kayıtlar, yenileme, boş/hata ve erişim kaybı durumlarını kapsar. Demo geçmişi yalnız o sekmede yapılan gerçek demo işlemlerinden oluşur; örnek geçmiş uydurulmaz.

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm generate
pnpm preview:static
```

## Tarayıcı kabul testleri

`tests/e2e` kayıt/e-posta doğrulama, parola kurtarma, Owner→Viewer daveti, UI ve doğrudan API rol/tenant kontrolleri, klavye ile dialog, gerçek upload/download, dar mobil gezinme ve axe WCAG A/AA taramalarını içerir. `pnpm test:e2e:types` bu kaynakların tip denetimidir; tarayıcı açmaz. Browser testleri bu çalışma ortamında önceki URL güvenlik politikası engeli nedeniyle **çalıştırılmadı**; görsel/erişilebilirlik kabulü tamamlanmış sayılmaz.

Yetkili yerel/CI test ortamında:

1. Backend dizininde `docker compose up -d` ile MongoDB/Mailpit'i başlat.
2. Backend dizininde `node scripts/e2e-server.mjs --isolated-test-server` çalıştır. Bu komut4100 portunda yeni ve geçici test DB/deposu açar; normal API4100'ü önce durdur. Gerçek Google/SMTP dış servislerine bağlanmaz.
3. Bu frontend dizininde `pnpm exec playwright install chromium` kurulumunu yap. `E2E_TEST_ENVIRONMENT=1` ortam değişkenini ayarla, sonra `pnpm test:e2e`. Playwright4179 frontend sunucusunu HTTP test API'sine bağlayarak açar; geliştirme frontend'i çalışıyorsa kapatıp test sunucusunun kendi ayarlarıyla açılmasına izin ver.
4. Sonuç raporu `playwright-report/`; backend test sunucusunu durdurunca kendisine ait geçici DB/depo temizlenir. Başarısız zorla sonlandırmalarda geçici test DB'sini ayrıca incele.

E2E hesap oluşturma yalnız loopback ortamında ve açık test bayrağıyla çalışır. Testler sentetik adresleri Mailpit'ten okur; gerçek e-posta alıcısına mesaj göndermez. Bu depodaki `.github/workflows/ci.yml` unit/tip/derleme/runtime ve Docker kontrollerini çalıştırır. Tarayıcı E2E ayrı, yetkili test ortamında yukarıdaki adımlarla yürütülmelidir.

`build`, Nuxt üretim çıktısını üretir. `generate`, statik SPA çıktısını `.output/public` klasörüne yazar. Ardından `preview:static`, çıktıyı `http://127.0.0.1:4179` adresinde sunar. Bu script backend değildir; `/api` isteklerine açık backend-bağlı-değil hatası döndürür. Statik host bilinmeyen uygulama yollarını `index.html` dosyasına yönlendirmelidir; API yollarını bu fallback'e yönlendirmeyin. Giriş ve davet sayfalarını doğrudan açma bununla çalışır. `pnpm preview`, `build` sonrasında Nuxt üretim sunucusunu yerelde açar.

Sürümler: Nuxt 4.6.1, Vue 3.5.44, Vue Router 5.4.0. Vue tip denetleyicisinin TypeScript 7 ile uyumsuzluğu nedeniyle desteklenen TypeScript 6.0.3 sabitlendi. pnpm lockfile ve `pnpm-workspace.yaml` saklanmalıdır; yalnız esbuild kurulum script'ine izin verilir.

## Ekranlar

| Yol | Ekran |
| --- | --- |
| `/login` | E-posta/şifre ve Google giriş başlangıcı |
| `/register` | Kayıt ve form doğrulama |
| `/verify-email` | E-posta doğrulama |
| `/forgot-password` | Genel yanıtla şifre yenileme bağlantısı isteme |
| `/reset-password#token=...` | Tek kullanımlık bağlantıyla yeni şifre belirleme |
| `/account` | Hesap güvenliği ve açık Google hesabı bağlama |
| `/workspaces` | Alan seçme ve oluşturma |
| `/workspaces/:wid/files` | Dosyalar, klasörler, arama, filtre, sıralama, liste/kart |
| `/workspaces/:wid/files?folder=:id` | Alt klasör ve breadcrumb |
| `/workspaces/:wid/files?recent=1` | Son kullanılanlar |
| `/workspaces/:wid/members` | Üyeler, roller, sahiplik devri ve davetler |
| `/workspaces/:wid/settings` | Ad/açıklama/renk ve alan silme |
| `/invitations/accept#token=...` | Davet inceleme ve açık kabul |

Owner yönetim ve içerik işlemlerine, Editor içerik işlemlerine, Viewer görüntüleme/indirmeye erişir. Roller workspace üyeliğine aittir. İçerik oluşturma, ad değiştirme, taşıma, çoklu silme, yükleme, indirme, klasör ZIP'i ve görsel/PDF önizlemesi bulunur. Rastgele HTML/SVG uygulama içinde render edilmez. Yükleniyor/hata/boş durumları, klavye erişimi ve mobil gezinme hazırlanmıştır.

PDF önizleme PDF.js ile canvas'a çizilir; tarayıcının iframe PDF eklentisini gerektirmez. Önceki/sonraki sayfa kontrolleri vardır. Worker, CMap, font ve WASM kaynakları derlemeye dahil edilir. Yalnız yetkili API isteğiyle alınan aynı origin blob'u işlenir; PDF içindeki script, form ve linkler çalıştırılmaz. Parolalı veya bozuk PDF için indirme seçeneği sunulur. Canvas önizlemesinde metin seçme/arama katmanı henüz bulunmaz; özgün dosya indirilebilir. PDF testlerinde Node ortamının opsiyonel `@napi-rs/canvas` bağımlılığı kullanılır.

Taşıma penceresi hedef klasörleri konum konum açar; aynı adlı klasörler üst yollarıyla ayırt edilir. Taşınan klasörün içine girilemez. Klasör yolu API ile aynı 64 seviye sınırına uyar. Sayfa kapanınca liste, önizleme, indirme, taşıma ve yükleme istekleri iptal edilir; sunucuda tamamlanmış işlemler iptalle geri alınmaz.

Çalışma alanları, üyeler, davet geçmişi, dosyalar ve taşıma hedefleri cursor ile sayfalanır. “Daha fazla” düğmeleri sonraki sayfaları getirir; 500 dosya sınırında liste kesilmez. Veri veya yetki değişikliği eski cursor'u geçersiz kıldığında listeyi yenileme seçeneği gösterilir. Son Owner kontrolü backend'in tam üye sayımını kullanır.

Klasör ZIP'i arka planda hazırlanır. Durum kartında hazırlanan dosya sayısı, iptal ve yeniden deneme bulunur; hazırlama sırasında dosyalarla çalışmaya devam edilebilir. Hazır arşiv authenticated API üzerinden indirilir. Hazırlama takibinin zaman aşımı vardır; tamamlanmamış işler istemci iptalinde de sunucuda iptal edilmeye çalışılır.

## Demo ve gerçek API

`.env.example` gerçek API bağlantısını seçer. Dosyayı `.env` olarak kopyala:

```dotenv
NUXT_PUBLIC_DATA_MODE=http
NUXT_PUBLIC_API_BASE=http://127.0.0.1:4100/api/v1
```

`http` modu için backend4100 ve frontend4179 birlikte çalışır. Uygulamada kayıt ol; doğrulama mesajını `http://127.0.0.1:8025` yerel test kutusunda aç. Süresi dolmuş bağlantı doğrulama ekranından yeniden istenebilir. Google ve gerçek SMTP/S3 ayarlarının durumu backend README'de açıklanır.

Görsel demo için `NUXT_PUBLIC_DATA_MODE=demo` açıkça seçilebilir. `.env` olmadan da varsayılan gerçek HTTP API'dir (`/api/v1`); üretimde bu yol backend'e yönlendirilmelidir. Geçersiz bir mod uygulamayı hata ile durdurur; örnek hesaba sessizce geçilmez. Demo tarayıcıdaki JavaScript belleğinde çalışır. Başlangıçta Ahmet hesabının oturumu açıktır. Üç örnek alan Owner, Editor ve Viewer rollerini gösterir. Çıkış yapıp tekrar girmek için `ahmet@example.com` / `Demo1234!` kullanılır. Bu örnek parola gerçek API hesabı değildir.

Demo kaydı ve e-posta doğrulaması simülasyondur; gerçek e-posta/Google OAuth işlemi yapılmaz. Demo doğrulama düğmesi yalnız demo modunda görünür. `/invitations/accept` sayfasında örnek davet denenebilir.

Yüklenen dosyanın gerçek baytları **bu sekmenin belleğinde** tutulur ve indirilebilir; demo limiti dosya başına 25 MB'dir. Sayfa yenilenince tüm demo değişiklikleri sıfırlanır. Kalıcı depolama, güvenli hesap/parola sistemi veya gerçek tenant sınırı sağladığı iddia edilmez.

HTTP servis adapter'ı [API sözleşmesini](docs/api-contract.md) uygulayan kardeş backend'e bağlanır. Gerçek API hataları gösterilir; HTTP modu başarısız olursa demo verisine sessiz geçilmez. CSRF anahtarı geçersizse backend'in işlemden önce döndürdüğü açık hatadan sonra yalnız bir kez yenilenip tekrar denenir; ağ hatalarında yazma işlemi otomatik tekrarlanmaz.

## Mimari ve güven sınırı

```text
app/components/    Ortak pencereler, dosya alanı, önizleme
app/composables/   Session/workspace durumu, bildirimler
app/layouts/       Auth, alan seçimi ve workspace yerleşimi
app/middleware/    Giriş/e-posta ve workspace route kontrolleri
app/pages/         Nuxt sayfaları
app/plugins/       Demo veya HTTP servis seçimi
app/services/      DriveApi, demo ve gerçek HTTP adapter'ları
shared/            DTO tipleri ve yetki matrisi
tests/             Domain ve HTTP adapter testleri
```

UI kontrolleri backend yetkilendirmesinin yerine geçmez. HTTP backend her istekte session, güncel üyelik, permission ve kaynak workspace sınırını uygulamalıdır. Frontend workspace değişiminde içerik durumunu temizler, liste isteklerini iptal eder ve geç gelen sonuçları kapsam kontrolüyle reddeder.

Session/CSRF token'ları localStorage veya sessionStorage'a yazılmaz. Cookie oturumları backend tarafından HttpOnly/Secure/SameSite olarak ayarlanmalıdır. Davet ve doğrulama token'ları fragmentten okunup URL'den kaldırılır, yalnız bellekte tutulur. Tam sayfa Google girişi belleği yeniler; davetle giriş yapan kullanıcı davet bağlantısını tekrar açmalıdır. Backend OAuth state akışı ayrıca ele alınmalıdır.

Davet ve doğrulama ekranlarındaki “Başka hesapla giriş yap” düğmesi bekleyen bağlantıyı bellekte tutarak hesabı değiştirir. Genel çıkış düğmesi bekleyen bağlantıları da temizler. Yeni bir doğrulama tokenı açıldıysa, mevcut hesabın daha önce doğrulanmış olması bu bağlantıyı doğrulanmış saymaz; token API'de açıkça doğrulanır.

Sekmeye geri dönüldüğünde oturum bir kez yenilenir. Böylece e-posta başka sekmede doğrulanmışsa eski sekmedeki davet bağlantısı bellekte kalır ve doğrulama durumu güncellenir. Başka bir sekmede hesap değişmişse önceki workspace ve içerik durumu temizlenir; gecikmiş yanıtlar yeni oturumu değiştiremez. Arka planda periyodik sorgu yapılmaz.

Şifre yenileme talebi hesabın varlığını açıklamaz. Bağlantı fragmentten okunur ve yalnız bellekte tutulur; başarı tüm eski oturumları kapatıp yeni şifreyle giriş ister. Şifreler tarayıcı depolamasına yazılmaz. Hesap güvenliği sayfasındaki Google bağlama işlemi açık onay ve şifreli hesaplarda mevcut şifre ister; e-posta eşleşmesi hesapları kendiliğinden birleştirmez.

MongoDB, API güvenliği, audit, worker ve SMTP backend'de uygulanır. Yerel uygulama gerçek Atlas/R2, Google OAuth ve Gmail SMTP ile yapılandırıldı. Kullanıcı PDF yükleme/önizleme/indirme, workspace ayrımı, davet, Viewer/Editor ve üyelik iptali kontrollerini; ayrıca kendi Gmail adresine test mesajı teslimatını doğruladı. Çevrimiçi deployment henüz yapılmadı. [Mimari tasarım](docs/google-drive-multi-tenant-mimari.md).

Referanslar: [Nuxt static deployment](https://github.com/nuxt/nuxt/blob/main/docs/1.getting-started/16.deployment.md), [pnpm ayarları](https://pnpm.io/settings).

Üretim Docker imajı yalnız `.output` taşır. `pnpm check:runtime` (önce `pnpm build`) bilinen iki sorunlu araç zinciri paketinin runtime'a girmesini engeller; CI ve Docker derlemesine bağlıdır. 21 Ekim kaynak taramasında `node-forge` ve `braces` için iki high bildirim kaydedildi; güncel durum yeni taramayla doğrulanmalıdır. [Güvenlik durumu ve resmi kaynaklar](docs/bagimlilik-guvenlik-durumu.md).


## Klasör yükleme ve dosyanın konumu

Owner ve Editor, Dosyalar ekranındaki **Klasör yükle** düğmesinden yerel klasör seçebilir. Alt klasörler ve dosyalar seçili konumda yeniden oluşturulur. Klasörü sürükleyip bırakmak da desteklenir; entry API'sini destekleyen tarayıcılar boş dizinleri de aktarır. Directory dosya seçicisi boş dizinleri bildirmez.

Sınırlar:10000 toplam öğe, hedef yol dahil64 seviye, dosya başına25 MiB; workspace kotası API tarafından korunur. Aktarım atomik değildir: hata/iptalde tamamlanan öğeler kalır. Tekrar yükleme yeni bir kök klasör oluşturur; otomatik birleştirme yapılmaz.

Dosya ayrıntılarındaki **Bulunduğu klasör**, gerçek parent yolunu gösterir. **Klasöre git** arama/son kullanılanlardan da doğru konumu açar. Eski hesap/workspace'e ait geç gelen konum sonuçları yayınlanmaz.

22 Ekim son kontrolleri: PDF renderer dahil68 frontend testi, Nuxt tip, E2E kaynak tip, üretim derlemesi ve runtime paket kontrolü geçti. Daha önce nested upload/Viewer reddi dahil2 gerçek API/MongoDB entegrasyon testi geçti. Kullanıcı yerel PDF, workspace ve rol kontrollerini manuel tamamladı; otomatik tarayıcı/erişilebilirlik senaryoları bu ortamda çalıştırılmadı.
