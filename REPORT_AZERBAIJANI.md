# Hilal Bilet Sistemi — istehsala hazırlıq hesabatı

Tarix: 2026-11-04. Bu mərhələ texniki tapşırığın 5–7-ci bölmələri (testlər, CI,
sənədləşmə, "hazırdır" meyarları, hesabat forması) əsasında aparılıb.
Tapşırığın 1–4-cü bölmələri repozitoriyada yoxdur və istifadə olunmayıb.
Əvvəlki hesabat (Milestone 4) köhnəlmişdi; tarixçə git-də saxlanılır.

## Görülən işlər

* **Satış və filial təcrid olunması.** Satıcı yalnız öz filialında satır,
  ödəniş qəbul edir və alıcını qeydiyyata alır; başqa filialın satışlarını
  görmür. Bütün yoxlamalar serverdə aparılır.
* **Tutum və dublikatlar.** Sessiyanın tutumu və "bir namizəd — bir sessiyada bir
  aktiv bilet" qaydası verilənlər bazasının özündə (trigger və unikal indeks)
  qorunur. Eyni anda yüzlərlə satış cəhdi belə artıq bilet yaratmır.
* **QR kodun saxtalaşdırılmaması.** Biletin QR kodu HMAC-SHA256 ilə imzalanır;
  dəyişdirilmiş və ya uydurulmuş kod rədd edilir.
* **Girişdə yoxlama.** "Girişdə yoxlama" ekranı: hər bilet yalnız bir dəfə
  qəbul olunur, ikinci skan rədd edilir.
* **Günün bağlanması.** Filial rəhbəri günü bağlayır; həmin günün satışları,
  ödənişləri və ləğvləri dondurulur (verilənlər bazası səviyyəsində). İmtahan
  günü girişdə qəbul işləməyə davam edir.
* **Nəticələrin dərci.** Yoxlama növbəsi boş olmadan nəticə dərc edilmir;
  dərc olunmamış nəticə heç kimə göstərilmir. İctimai `/results` səhifəsi
  bilet kodu (və ya QR) + namizəd nömrəsi tələb edir, IP üzrə dəqiqədə 10
  sorğu ilə məhdudlaşır və səhv məlumatda həmişə eyni cavab verir.
* **OMR.** Tamamilə boş vərəq yoxlama növbəsinə göndərilir; OMR ekranları
  istehsalda da açıqdır (əvvəl test bayrağı ilə gizlədilmişdi).
* **İlk administrator** `.env` faylından bir dəfə yaradılır.
* **Təhlükəsiz standartlar.** İstehsalda gizli açarlar məcburidir, nümunə
  dəyərlərlə sistem işə düşmür; Swagger istehsalda bağlıdır; xaricə yalnız
  proksi (avtomatik HTTPS) açıqdır.
* **Ehtiyat nüsxə və bərpa** skriptləri və bərpa təlimi.
* **CI/CD**: GitHub Actions boru kəməri və deploy şablonu.
* **Sənədlər**: README, DEPLOYMENT, OPERATIONS, OMR, API və dörd rol üzrə
  Azərbaycan dilində təlimatlar (`docs/guides/`).

## Yoxlamaların nəticələri

| Yoxlama | Nəticə |
| --- | --- |
| Tip yoxlaması, lint, build | uğurlu (exit 0) |
| API unit testləri | 113 / 113 |
| API e2e testləri (ayrıca test bazası) | 82 / 82 |
| Web testləri | 39 / 39 |
| OMR testləri (təmiz, bulanıq, fırlanmış, iki işarəli, boş vərəq) | 20 / 20 |
| Yük testi: 600 sorğu, 50 yer | düz 50 bilet, dublikat yoxdur |
| Playwright brauzer ssenarisi + əlçatanlıq (axe) | 24 / 24 |
| Təmiz klondan istehsal profili | 7 xidmət sağlam |
| Ehtiyat nüsxə → bərpa təlimi | məlumatlar eynidir |
| Asılılıqların auditi (istehsal) | zəiflik yoxdur |

## Hazırlıq meyarları

16 meyardan 15-i **PASS**, 1-i **PARTIAL**: CI faylı hazırdır, lakin GitHub-da
hələ işə salınmayıb (kod GitHub-a göndərilməyib). Ətraflı sübutlar:
`docs/IMPLEMENTATION_STATUS.md`.

## Riskler və məhdudiyyətlər

* OMR test vərəqləri sintetikdir; ilk real imtahandan əvvəl hər filialın
  printer/skaner nümunələri ilə yoxlanmalıdır.
* Redis istifadə olunmur; OMR emalı növbəsiz, sinxron işləyir.
* Hesabatlar hələlik ümumi statistika və günün yekunu ilə məhdudlaşır.
* Bir NAT ünvanı arxasındakı ofislər sorğu limitini bölüşür.

## Real serverdə əl ilə görüləcək işlər

1. DNS qeydi (məs. `bilet.example.az`) və `.env`-də `SITE_ADDRESS`,
   `PUBLIC_URL` — sertifikat avtomatik alınır.
2. `./scripts/generate-secrets.sh .env`, `.env`-in parol menecerində surəti.
3. İlk administratorla giriş, sonra `BOOTSTRAP_ADMIN_PASSWORD`-un silinməsi.
4. Hər filialda bilet çapı və cavab vərəqinin (100 % A4) sınaq çapı.
5. Real skan nümunələri ilə OMR yoxlaması.
6. Gündəlik ehtiyat nüsxənin serverdən kənara köçürülməsi, rüblük bərpa təlimi.
7. GitHub-da `production` mühitinin gizli açarları (deploy şablonu üçün).
