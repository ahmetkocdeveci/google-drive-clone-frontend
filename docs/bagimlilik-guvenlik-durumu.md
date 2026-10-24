# Bağımlılık güvenlik durumu

Son inceleme: **24 Ekim 2026**. Bu kayıt o tarihteki taramadır; sonraki açıkların yokluğu garantisi değildir.

## Uygulanan güncellemeler

Nuxt 4.6.2 korunarak lockfile'daki uyumlu `undici` ve `serialize-javascript` yamaları güncellendi. Önceki 2 high / 2 moderate / 1 low taraması **1 high / 0 moderate / 0 low / 0 critical** seviyesine indi. Backend'in ayrı üretim bağımlılığı taramasında bulgu yoktur.

| Bildirim | Durum |
| --- | --- |
| [Undici: GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) | Lockfile'da yamalı uyumlu sürüme geçildi |
| [Undici: GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685) | Lockfile'da yamalı uyumlu sürüme geçildi |
| [Undici: GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472) | Lockfile'da yamalı uyumlu sürüme geçildi |
| [Serialize-javascript: GHSA-m5mm-p8h7-m29v](https://github.com/advisories/GHSA-m5mm-p8h7-m29v) | Lockfile'da yamalı uyumlu sürüme geçildi |
| [Node-forge: GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | High; 1.4.0 etkilenmiş, audit'te yayımlanmış yama yok |

## Sınırlı ve görünür istisna

Kalan paket tam olarak şu araç zinciri yolundadır:

```text
nuxt → @nuxt/nitro-server → nitropack → listhen → node-forge@1.4.0
```

Nuxt kaynak bağımlılığı olduğu için build/dev araçları da `pnpm audit --prod` raporuna girer. Paket dependency sınıfı değiştirilerek gizlenmez. Kriptografi koduna yerel yama veya uyumluluğu belirsiz override uygulanmaz. Geliştirme sunucusu loopback üzerinde tutulur; güvenilmeyen kodun derlemede çalıştırılmaması gerekir.

Üretim Docker imajı yalnız `.output` taşır. `check:runtime`, gerçek `.output/server` manifestlerini, bağımlılıklarını ve symlink sınırlarını denetler; `node-forge` veya `braces` bulursa durur. Pages dağıtımı statik dosyalar ve Web API'leri kullanan bağımsız gateway Function'dan oluşur.

`pnpm check:dependencies` önce runtime kontrolünü çalıştırır, ardından gerçek audit yanıtını inceler. Yalnız yukarıdaki bildirimin, **1.4.0 sürümünün ve tam bağımlılık yolunun** henüz yamasız durumuna izin verir; bunu terminale açıkça yazar. Başka bildirim/yol/sürüm, eksik rapor veya yayımlanmış yama denetimi başarısız kılar. Bu davranış ayrı testlerle doğrulanır. Ağ/registry hatası başarılı tarama sayılmaz.

Bu istisna paketin güvenli olduğu anlamına gelmez; erişilebilir üretim yüzeyinden çıkarılmasıyla sınırlandırılır. Uyumlu resmi yama geldiğinde lockfile güncellenip istisna kaldırılmalı; test, tip, Node/Pages/Docker derlemeleri ve tarayıcı CI'ı tekrar geçmelidir.
