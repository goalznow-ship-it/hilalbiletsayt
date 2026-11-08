# Hilal Bilet — production buraxılış planı

Plan icra edilməyib. Push və canlı deployment üçün ayrıca, konkret release təsdiqi tələb olunur.

## Mövcud sistemi qorumaq

- Canlı layihə `hilalbiletsayt`, repository Compose default-u `hilal`-dır. Mövcud PostgreSQL/RustFS/Redis volume-ları, `.env` və admin hesabı saxlanmalıdır.
- `down -v`, `--remove-orphans`, DB reset, destructive SQL və force push istifadə edilməməlidir.
- API/worker-də mount görünmür. Köhnə OMR faylları container filesystem-də və ya RustFS-də ola bilər. Yeri və eksport üsulu təsdiqlənmədən konteyneri yenidən yaratma. Yeni OMR volume-u köhnə faylları avtomatik import etmir.

## Backup və staging

1. PostgreSQL logical backup, rollar, RustFS obyektləri və OMR orijinalları uyğun bərpa nöqtəsi ilə ayrıca saxlancda qorunsun.
2. `.env` və image digest-ləri məhdud girişli saxlancda saxlanılsın; secret-lər terminala çap edilməsin.
3. Backup canlı volume-a bağlanmayan ayrıca PostgreSQL 16 staging bazasında bərpa edilsin; sıra sayları və bilet/OMR nümunələri müqayisə olunsun.
4. Disk həcmi və ayrıca diskdə backup təsdiqlənsin. Audit zamanı root disk dəfələrlə dolub.
5. `.env.example` merge konflikti mövcud lokal variantları qoruyaraq həll edilsin; secret olmaması yoxlanılsın.
6. Review olunmuş release image-ləri kifayət qədər diskli CI/ayrı hostda dəyişməz tag/digest ilə qurulsun. Ayrı project adı, env, port və volume-larla API/web/worker birlikdə sınaqdan keçirilsin.

## Miqrasiyalar

- Restore edilmiş staging bazasının `_prisma_migrations` tarixçəsini kodla müqayisə et.
- AZN/qəpik vahidini real nümunələrlə yoxla; qiymət miqrasiyasını əl ilə ikinci dəfə icra etmə.
- Partial unique index-dən əvvəl köhnə aktiv namizəd/sessiya dublikatlarını araşdır. Məlumatı avtomatik silmə, migration tarixçəsini səbəbsiz dəyişmə.
- Yeni `20261107000000_question_metadata` nullable sütunlar və indeks əlavə edir; böyük cədvəldə lock müddətini ölç.
- Yalnız review olunmuş `prisma migrate deploy` axınını istifadə et. `migrate dev/reset`, force-reset və DROP/TRUNCATE production üçün nəzərdə tutulmur.

## Funksional qəbul

- PUBLISHED, qiymətli imtahan və Bakı vaxtı ilə açılan sessiya mobil ictimai səhifədə görünməlidir.
- Rezervasiya, kassa cash/POS qeydi, çap/PDF, payment, bir dəfə QR giriş və audit birlikdə keçməlidir.
- Real cihaz vərəqləri ilə OMR scan/review/score/publish və qorunan public lookup yoxlanmalıdır.
- Digər filialın bilet, gəlir, əməkdaş təyinatı və OMR nəticəsi görünməməlidir.
- Refund/day-closure qaydaları və müddətsiz pending rezervasiya siyasəti qəbul edilməli və ya ayrıca tamamlanmalıdır. Bağlı günün trigger-i bypass edilməməlidir.
- Provider/SMTP hazır olmayanda funksiyalar qeyri-aktiv və açıq izahlı qalmalıdır; saxta PAID və ya göndərilmiş email göstərilməməlidir.
- Frozen install, Prisma validate/generate, lint, typecheck, unit/API/worker/browser və paralel satış testləri release image-lərində çalışdırılmalıdır.

## Təsdiqdən sonrakı canlı keçid

- Təsdiqə image digest-ləri, staging nəticələri, backup/restore sübutu və rollback addımları daxil olsun.
- Mövcud Compose-a uyğun override və açıq project adı istifadə edilsin. Repository Compose faylı birbaşa canlı konfiqurasiyanın əvəzi sayılmasın.
- PostgreSQL/RustFS/Redis konteynerləri və volume-ları tətbiq buraxılışında yenidən yaradılmasın.
- Mövcud `postgres:16-alpine` image digest-i saxlanılsın. Repository `16.6-alpine` tag-inə kor-koranə keçid edilməsin.
- Lokal audit `.next` qovluğu production-a köçürülməsin: audit API ünvanı `127.0.0.1:3301`, Docker web build ünvanı `api:3001`-dir.
- Qısa maintenance pəncərəsi, son backup və uyğun migration-dan sonra yalnız razılaşdırılmış tətbiq servisləri dəyişdirilsin. TLS, proxy, health, rate limiting və OMR volume icazələri təsdiqlənsin.

## Rollback və müşahidə

- Əvvəlki image digest-ləri saxlanılsın; additive schema ilə geri uyğunluq staging-də yoxlanılsın. Rollback üçün sütun silinməsin.
- Məlumat uyğunsuzluğunda yazmalar dayandırılsın və review olunmuş restore planı tətbiq olunsun. Yeni əməliyyatları itirən avtomatik DB rollback edilməsin.
- 5xx, QR/login rəddləri, tutum konfliktləri, OMR review/failed növbəsi, disk və audit log artımı izlənilsin.
- Kassa məbləği və nəticə sayı qəbul nümunələri ilə müqayisə edilsin. Secret rotasiyası və mövcud admin şifrəsinin dəyişməsi bu release-in hissəsi deyil.
