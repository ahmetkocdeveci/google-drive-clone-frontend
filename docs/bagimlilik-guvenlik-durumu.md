# Bağımlılık güvenlik durumu

24 Ekim 2026: geliştirme bağımlılıkları dahil **`pnpm audit` sonucu 0 bildirim**. `node-forge` artık çözümlenen bağımlılık ağacında ve lockfile paket envanterinde bulunmaz. Bu anlık tarama bütün olası güvenlik hatalarının yokluğu garantisi değildir.

## Node-forge nasıl kaldırıldı?

Bağımlılık yolu `nuxt → @nuxt/nitro-server → nitropack → listhen → node-forge@1.4.0` idi. [Resmî bildirime](https://github.com/advisories/GHSA-86w9-cpqp-85rv) göre yayımlanmış güvenli forge sürümü hâlâ yoktur. Bu nedenle bir kriptografi yaması uydurulmadı veya audit sonucu bastırılmadı.

Listhen'in kullanılmayan otomatik geliştirme sertifikası üretimi sürüme bağlı yerel yamayla kaldırıldı. PEM/PFX ile açıkça verilen sertifikalar Node'un native TLS desteğini kullanır. Sertifikasız HTTPS isteği HTTP'ye düşmez; açık hatayla durur. Tüm ESM/CommonJS/CLI forge yüklemeleri kaldırıldı. Aynı exact sürüme ait pnpm override yalnız bu kullanılmayan bağımlılık kenarını kaldırır.

Yama, uygulama dosyası ve hash'iyle kaynak depoda tutulur; `node_modules` elle düzenlenerek geçici bir çözüm yapılmaz. Frozen install aynı yamayı tekrar uygular. Ayrıntılar ve bakım koşulları: [listhen yaması](../patches/README.md).

## Sürekli kontrol

- `tests/listener.test.mjs`: 12 gerçek HTTP/TLS davranış testi; ESM/CommonJS, PEM/PFX, otomatik sertifika reddi ve hatalı parola senaryoları. Teste özel anahtarlar geçici dizinde oluşturulur ve silinir.
- `check:dependencies`: önce üretim runtime sınırını kontrol eder, sonra tüm bağımlılıkları audit eder. **İstisna listesi yoktur.** Önceden izin verilen forge bildirimi de testi başarısız kılar. Eksik/bozuk rapor veya registry hatası başarı sayılmaz.
- `check:runtime`: üretim `.output/server` manifestlerini ve symlink sınırlarını denetler; yasak build araçları runtime'a girerse durur. Docker yalnız `.output` taşır.
- Pages dağıtımı statik Nuxt dosyaları ve bağımsız Web API gateway Function'ıdır. Canlı TLS Cloudflare/Northflank'tadır; yerel geliştirme HTTP'si yalnız loopback'tedir.

Önceki Undici bildirimleri `8.12.3`, serialize-javascript bildirimi `7.1.3` güncellemeleriyle giderildi. Lockfile korunur. Listhen/Nitro yükseltmesi sırasında bu yerel yama yeniden değerlendirilmeli; uyumlu resmî çözüm geldiğinde yama ve override birlikte kaldırılıp bütün CI kontrolleri tekrarlanmalıdır.
