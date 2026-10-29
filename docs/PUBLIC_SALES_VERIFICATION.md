# Hilal Bilet — satış və yoxlama hesabatı

Yoxlama tarixi: 2026-10-29. Mühit: lokal production build, Chromium və ayrıca PostgreSQL 18 test bazası.

## Valideyn üçün işləyən axın

- Əsas ünvan `/` ictimai imtahan kataloqudur. Admin hesabı tələb edilmir.
- Dərc edilmiş, qiyməti təyin olunmuş, gələcək tarixli açıq və boş yeri olan sessiyalar göstərilir.
- Namizədin adı, valideynin Azərbaycan mobil nömrəsi, sessiya və ödəniş filialı ilə real sifariş yaradılır.
- Backend qiyməti imtahandan götürür. `3575` qəpik brauzerdə `35.75 AZN` göstərildi və bazada həmin tam ədəd saxlanıldı.
- Sifariş namizədi və bileti tranzaksiyada yaradır. Sorğu açarı, namizəd təkrarı və sessiyanın son yeri üçün paralel sorğular yoxlanıldı.
- `/orders/[token]` şəxsi bilet səhifəsidir. Yeniləmə, QR keçidi, çap və PDF işləyir.
- `/tickets/verify` və `/tickets/verify/[token]` ictimai yoxlamadır. Cavab tam ad, telefon, e-poçt, şəxsi bilet keçidi və audit məlumatlarını açıqlamır.
- “İdarəetmə paneli” `/login` səhifəsinə aparır. Real login, dashboard, bilet siyahısı, istifadəçilər, hesabat və ödəniş təsdiqi yoxlanıldı.

Brauzer sınağının ünvanı `http://127.0.0.1:3187/` idi. Müvəqqəti web/API serverləri sınaqdan sonra dayandırılıb. Normal development ünvanı mövcud Next.js portundan asılıdır; əsas marşrut həmişə `/` qalır.

## Ödəniş və səlahiyyətlər

Onlayn ödəniş provayderi yoxdur. Sifariş `PENDING`, `CASH` və boş `paymentDate` ilə yaranır. Valideyn filial kassasında ödəniş etməli olduğunu görür. Səlahiyyətli SUPER_ADMIN, CENTRAL_ADMIN və ya uyğun BRANCH_MANAGER ödənişi təsdiqlədikdə status `PAID` olur; tarix və audit serverdə yazılır. Təkrar təsdiq ikinci audit yaratmır. Ödənişi gözlənilən pullu bilet istifadə edilmiş kimi işarələnmir.

`/api/api/user` və `/api/api/ticket` problemi request helper-də təkrarlanan prefiksin normallaşdırılması, düzgün `/users` və `/ticket` route-ları, səhifələnmiş cavabların düzgün oxunması ilə həll edildi. Sessiya yeniləmədə silinirdi; ilkin bərpa tamamlanana qədər storage yazılması dayandırıldı.

Filial dəyişiklikləri real POST/PATCH əməliyyatlarıdır; mərkəzi admin icazəsi tələb edir. Filial menecerlərinin filial və istifadəçi siyahıları məhdudlaşdırılır. Rol təyinatında rol adı əvəzinə həqiqi rol UUID-si istifadə olunur. İcazəsiz istifadəçi, filial və ödəniş dəyişiklikləri rədd edilir.

## Faktiki nəticələr

| Yoxlama | Nəticə |
| --- | --- |
| `pnpm build` | API və web keçdi |
| `pnpm typecheck` | API, web və shared keçdi |
| `pnpm lint` | 0 xəta, 14 xəbərdarlıq |
| API unit | 8 faylda 60 test keçdi |
| API e2e, real PostgreSQL | 5 faylda 69 test keçdi |
| Web request/auth/money/public-sales | 12 + 14 + 6 + 4 = 36 test keçdi |
| Prisma validate və generate | Keçdi |
| Prisma migrate status, lokal baza | 13 miqrasiya; gözləyən miqrasiya yoxdur |
| Real alış brauzeri | Keçdi; səhifə və gözlənilməz console xətası yoxdur |
| Admin UI brauzeri | Keçdi; bu ayrıca testdə API cavabları fixture ilə verilir |
| A4 PDF | 1 səhifə, təxminən 595 × 842 pt; bilet kodu PDF mətnindədir |
| `git diff --check` | Keçdi |

İcra zamanı `pnpm` PATH-də olmadığından `/tmp/hilal-sales/bin/pnpm` Corepack wrapper-i istifadə edildi. Wrapper `corepack pnpm --config.verify-deps-before-run=false` çağırır; layihə dependency-ləri dəyişdirilmədi.

Real brauzer testi API cavabını sifariş bazaya yazıldıqdan sonra qəsdən itirir. Formadakı məlumatların qalması və eyni açarla təkrar sorğunun əvvəlki bileti qaytarması yoxlanılır. Testdə bu gözlənilən `net::ERR_FAILED` console qeydi ayrıca istisna edilir.

Mobil/planşet/desktop ölçüləri: ictimai səhifə və bilet üçün 375/768/1280 px; admin filial səhifəsi üçün əlavə 1728 px. Filial cədvəlinin daşması scroll konteynerinin yerləşdirilməsi ilə düzəldildi.

QR SVG-nin görünməsi, QR üçün qurulan yoxlama keçidi və həmin tokenin real API cavabı yoxlanıldı. QR şəklinin ayrıca dekoderlə oxunması, fiziki telefon kamerası və kağız printer sınağı aparılmadı.

Sınaq mənbələri:

- `apps/api/test/public-sales.e2e-spec.ts`
- `apps/api/test/ticket-purchase.e2e-spec.ts`
- `apps/api/src/question/question.dto.unit.spec.ts`
- `apps/web/tests/public-browser.py`
- `apps/web/tests/browser.py`
- `apps/web/tests/{request,auth,money,public-sales}.test.mjs`

Lokal sübutlar `/tmp/hilal-sales/` altındadır: `build.log`, `typecheck.log`, `lint.log`, `unit.log`, `e2e.log`, `browser.log`, `browser-result.json`, `ticket-a4.pdf`, `public-375.png`, `receipt-375.png`. Admin şəkilləri `/tmp/hilal-ui-screenshots/` altındadır. `/tmp` müvəqqətidir; testlər həmin nəticələri yenidən yarada bilir.

## Baza və miqrasiyalar

Yalnız ayrıca yaradılan `127.0.0.1:55439/hilal_sales_test` bazasında işlənildi. Test fixture-ləri sintetikdir. İstehsalat bazasına qoşulma və miqrasiya tətbiqi edilmədi. E2e testlərin təmizləmələri yalnız bu ayrıca test bazasında icra edildi.

- Mövcud `20261025223000_price_unit_qepik` saxlanıldı; ikinci qiymət miqrasiyası yaradılmadı.
- `20261026000000_public_purchase` sifariş açarı, hash və şəxsi bilet tokenini əlavə edir.
- Davam edilən anda artıq commit edilməmiş `Question` modeli və kodu vardı. Əskik importlar, mövcud olmayan `@Default` dekoratorları və `Exam.questions` əlaqəsi build-i bloklayırdı. Bunlar mövcud işi silmədən düzəldildi.
- Yeni `20261029000000_questions` həmin mövcud model üçün yalnız cədvəl, indeks və xarici açar əlavə edir. Lokal bazada tətbiq edildi. `QuestionController` AppModule-a qoşulmayıb; sual idarəetməsi istifadəyə verilmiş funksiya deyil.

## Qalan işlər və istifadəyə vermə sərhədi

- OMR, imtahan nəticələrinin emalı və ümumi sistem ayarları hazır deyil. İşləməyən saxta ekranlar əvəzinə vəziyyət açıq göstərilir. Satış hesabatı real biletlərdən işləyir.
- Production deploy, production migration və real ödəniş provayderi inteqrasiyası edilmədi. Lokal sınaq production buraxılışı demək deyil.
- Reverse proxy arxasında `API_TRUSTED_PROXIES` real proxy ünvanlarına uyğun qurulmalıdır. `.env.example` lokal Next proxy üçün `loopback` göstərir. Ümumi `trust proxy=true` istifadə edilmir. Yanlış konfiqurasiyada istifadəçilər eyni rate limit-i paylaşa bilər.
- İctimai limitlər DB-də saxlanır: IP üzrə alış üçün dəqiqədə 10, oxuma üçün 120 sorğu. `PublicRate` audit qeydlərinin retention işi hələ qurulmayıb.
- Ödənilməmiş aktiv biletlər yer tutur; avtomatik müddət bitməsi mövcud biznes qaydalarında müəyyən edilməyib və əlavə edilmədi. Səlahiyyətli ləğv yeri azad edir.
- Biletin şəxsi keçidini itirən valideyn üçün SMS/e-poçt bərpası yoxdur. Mövcud həll keçidi saxlamaq və filialla əlaqə saxlamaqdır.
- Yüklənmə testi, Safari/Firefox, fiziki QR skanı və real çap cihazı yoxlanmadı.

## Git və fayllar

2026-10-29 davamının başlanğıcında HEAD artıq `aadb49d feat: implement public ticket sales flow` idi (2026-10-26 11:20:35 -0400). Bu davam zamanı commit və push edilmədi. Başlanğıcdakı commit edilməmiş Question işi qorundu. Build cache faylı davamın əvvəlindəki məzmununa qaytarıldı; əvvəlki dirty statusu saxlanıldı.

Bu davamda düzəldilən və əlavə edilən fayllar:

- `apps/api/prisma/schema.prisma`: yalnız mövcud Question üçün əks əlaqə əlavə edildi.
- `apps/api/src/question/question.controller.ts`: əskik importlar tamamlandı.
- `apps/api/src/question/question.dto.ts`: import və standart dəyər xətaları düzəldildi.
- `apps/api/src/question/question.dto.unit.spec.ts`: 2 DTO testi əlavə edildi.
- `apps/api/prisma/migrations/20261029000000_questions/migration.sql`: əlavəedici model miqrasiyası.
- `docs/PUBLIC_SALES_VERIFICATION.md`: bu hesabat.

Mövcud `question.service.ts` bu davamda dəyişdirilmədi. Aşağıdakı manifest əvvəlki satış işinin commit-də olan bütün fayllarını göstərir.

### Mövcud satış commit-inin fayl manifesti

- `.env.example`
- `DESIGN.md`
- `apps/api/prisma/migrations/20261026000000_public_purchase/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/scripts/public-browser-fixture.mjs`
- `apps/api/src/auth/controllers/auth.controller.ts`
- `apps/api/src/branch/branch.controller.ts`
- `apps/api/src/branch/branch.dto.ts`
- `apps/api/src/branch/branch.service.ts`
- `apps/api/src/dto/create-user.dto.ts`
- `apps/api/src/examination/examination.controller.ts`
- `apps/api/src/examination/examination.dto.ts`
- `apps/api/src/examination/examination.service.ts`
- `apps/api/src/examination/examination.service.unit.spec.ts`
- `apps/api/src/examination/examination.session.service.ts`
- `apps/api/src/examination/examination.session.service.unit.spec.ts`
- `apps/api/src/main.ts`
- `apps/api/src/public-sales/public-rate.guard.ts`
- `apps/api/src/public-sales/public-sales.controller.ts`
- `apps/api/src/public-sales/public-sales.dto.ts`
- `apps/api/src/public-sales/public-sales.service.ts`
- `apps/api/src/ticket/ticket-query.dto.ts`
- `apps/api/src/ticket/ticket.controller.ts`
- `apps/api/src/ticket/ticket.module.ts`
- `apps/api/src/ticket/ticket.service.ts`
- `apps/api/src/user/user.controller.ts`
- `apps/api/src/user/user.service.ts`
- `apps/api/test/public-sales.e2e-spec.ts`
- `apps/api/test/ticket-purchase.e2e-spec.ts`
- `apps/web/next.config.ts`
- `apps/web/src/app/dashboard/branches/page.tsx`
- `apps/web/src/app/dashboard/exams/page.tsx`
- `apps/web/src/app/dashboard/reports/page.tsx`
- `apps/web/src/app/dashboard/results/page.tsx`
- `apps/web/src/app/dashboard/settings/page.tsx`
- `apps/web/src/app/dashboard/tickets/page.tsx`
- `apps/web/src/app/dashboard/users/page.tsx`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/orders/[token]/page.tsx`
- `apps/web/src/app/orders/[token]/receipt.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/tickets/verify/[token]/verify-ticket.tsx`
- `apps/web/src/app/tickets/verify/page.tsx`
- `apps/web/src/components/app-shell.tsx`
- `apps/web/src/components/examinations/exam-dialog.tsx`
- `apps/web/src/components/session-provider.tsx`
- `apps/web/src/hooks/use-branches.ts`
- `apps/web/src/lib/public-sales.ts`
- `apps/web/src/lib/request.ts`
- `apps/web/tests/browser.py`
- `apps/web/tests/public-browser.py`
- `apps/web/tests/public-sales.test.mjs`
- `apps/web/tests/request.test.mjs`

### Son iş ağacı

```text
 M apps/api/prisma/schema.prisma
 M apps/api/tsconfig.build.tsbuildinfo
?? apps/api/prisma/migrations/20261029000000_questions/migration.sql
?? apps/api/src/question/question.controller.ts
?? apps/api/src/question/question.dto.ts
?? apps/api/src/question/question.dto.unit.spec.ts
?? apps/api/src/question/question.service.ts
?? docs/PUBLIC_SALES_VERIFICATION.md
```

Staged diff boşdur.
