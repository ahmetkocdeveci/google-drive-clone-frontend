# Teslim kontrolü

Kontrol tarihi: **24 Ekim 2026**. Yayın adresleri, kurulum ve komutlar [README](../README.md) içindedir.

| Alan | Kanıt |
| --- | --- |
| Nuxt ve ayrı API | Bağımsız repo/yayın; HTTP adaptörü, gerçek backend/MongoDB entegrasyonu |
| Hesap ve oturum | Kayıt/doğrulama/parola sıfırlama tarayıcı senaryoları; Google canlı manuel kabulü |
| Roller ve tenant sınırı | UI kontrolleri ile doğrudan API reddi birlikte test edilir; canlı Viewer/Editor/üye çıkarma kabulü |
| Dosya/klasör | İç içe directory picker, gerçek indirme baytları, parent konumu, görsel/PDF senaryoları; canlı iç içe ZIP kabulü |
| Kullanılabilirlik | Klavye odağı/Escape, Pixel 7 dar ekran ve axe A/AA taramaları; canlı telefon kabulü |
| Güvenlik | Gateway/oturum yarış testleri, bağımlılık taraması ve üretim runtime sınırı |
| Bakım | Ortak Prettier biçimi, sabit sürümler, frozen lockfile, Node/Pages/Docker CI |

`verify` işi birim/tip/biçim/derleme kontrolleridir. `browser` işi gerçek API/MongoDB/Mailpit ile ayrı GitHub runner'ında Playwright çalıştırır. Backend salt okunur deploy key ile alınır; tested SHA loglanır. Rapor Actions artifact'ındadır. Son durum [Frontend checks](https://github.com/ahmetkocdeveci/google-drive-clone-frontend/actions/workflows/ci.yml) üzerinden doğrulanır; yalnız test kaynağının bulunması çalıştırma kanıtı değildir.

Canlı manuel kabul; Google giriş/davet dönüşü, PDF yükleme/önizleme/indirme, alan ayrımı, Viewer/Editor, üyelik kaldırılınca erişim kaybı, telefon üzerinden erişim, iç içe klasör/ZIP, arama/taşıma/konuma gitme ve Owner geçmişini kapsar.

## Açık sınırlar

- `node-forge` kullanılmayan otomatik geliştirme sertifikası üretimi kaldırılarak bağımlılık ağacından çıkarıldı; tüm audit temizdir, istisna yoktur. Yerel HTTPS açık PEM/PFX ister. Sürüme bağlı listhen yaması yükseltmelerde bakım gerektirir. [Güvenlik kaydı](bagimlilik-guvenlik-durumu.md).
- SVG/HTML çalıştırılmaz; Office önizlemesi ve dosya içeriği düzenleme sunulmaz. PDF'de metin seçme/arama katmanı yoktur.
- Directory picker boş klasörleri bildirmez; destekleyen drop-entry akışı bunları aktarır. Aktarım atomik değildir. Büyük ZIP indirmesi cihaz belleğine bağlıdır.
- axe taraması bütün ekranlar ve yardımcı teknolojiler için erişilebilirlik garantisi değildir. Canlı Google sağlayıcısı CI'da taklit edilmez; API testleri kontrollü provider yanıtlarını, manuel kabul gerçek hesabı kapsar.
- Repo daveti ve kişisel ders/notlar depo sahibinin sorumluluğundadır.
