# Listhen TLS yaması

`listhen@1.10.1.patch`, Nuxt → Nitro → listhen zincirindeki `node-forge` ihtiyacını kaldırır. Resmî `node-forge` sürümü hâlâ [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) bildiriminden etkilenir; bu yama onun kriptografi kodunu değiştirmez veya bildirimi gizlemez.

## Değişiklik

- Listhen'in otomatik geliştirme sertifikası üretimi kaldırılır; `https: true` sertifikasız kullanımda `ERR_LISTENER_CERTIFICATE_REQUIRED` ile durur.
- PEM key/cert dosyaları veya inline PEM ile HTTPS korunur. PFX dosyası `node:https` üzerinden Node'un yerleşik TLS/OpenSSL uygulamasına verilir; JavaScript PKCS#12 ayrıştırıcısı kullanılmaz.
- ESM/CommonJS girişleri ve CLI içindeki tüm forge import/require'ları kaldırılır.
- `pnpm-workspace.yaml` yalnız `listhen@1.10.1>node-forge` bağımlılığını kaldırır. `patchedDependencies`, yama dosyasını lockfile hash'iyle bağlar. Frozen install yamayı tekrar uygular; uygulama hatası atlanmaz.
- Üretim HTTPS'i Cloudflare/Northflank tarafından sağlanır; Nuxt geliştirme komutu loopback HTTP kullanır. Canlı TLS kapatılmaz.

## Kontrol ve bakım

`tests/listener.test.mjs` ESM ve CommonJS için HTTP, otomatik sertifika reddi, PEM dosya/inline, parola korumalı PFX ve hatalı PFX parolasında HTTP'ye düşmeme davranışlarını gerçek bağlantıyla denetler. Test anahtarları OpenSSL ile yeni geçici dizinde üretilip silinir; depoya özel anahtar konmaz. Windows'ta Git ile gelen OpenSSL veya `OPENSSL_BIN`, Linux CI'da `openssl` kullanılır.

`pnpm audit` geliştirme bağımlılıkları dahil temiz olmalıdır. `check:dependencies` hiçbir bildirim için istisna tanımaz; registry/rapor hatasında durur. `pnpm why node-forge` sonuç üretmemelidir.

Listhen/Nitro yükseltirken yama yeniden gözden geçirilmelidir. Forge kullanmayan uyumlu resmî sürüm geldiğinde yerel yama ve removal override birlikte kaldırılıp unit/tip/Node/Pages/Docker/Playwright kontrolleri tekrarlanmalıdır. Bu dosya ayrı bir listhen fork'u veya upstream tarafından yayımlanmış düzeltme iddiası değildir.

Yöntem: [pnpm patch](https://pnpm.io/cli/patch), [kullanılmayan bağımlılığı kaldırma](https://pnpm.io/settings/dependency-resolution#overrides).
