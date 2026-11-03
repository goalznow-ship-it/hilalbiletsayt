# Administrator üçün təlimat

Mərkəzi administrator və super administrator bütün filialları görür.

## İlk quraşdırma

1. İlk administrator hesabı serverdə `BOOTSTRAP_ADMIN_EMAIL` və
   `BOOTSTRAP_ADMIN_PASSWORD` ilə avtomatik yaradılır. İlk girişdən sonra
   server administratoru şifrəni `.env` faylından silməlidir.
2. **Filiallar** — hər filialı kodu, ünvanı və telefonu ilə yaradın.
3. **İşçilər və satıcılar** — hər işçiyə ayrıca hesab verin, rolunu (Satıcı,
   Filial rəhbəri, OMR operatoru, Mərkəzi administrator) və filialını təyin
   edin. Hesabları heç vaxt bölüşdürməyin; işdən çıxan işçinin hesabını
   deaktiv edin.

## İmtahan və satış

1. **İmtahanlar** — imtahanı yaradın, qiyməti AZN ilə təyin edin və dərc edin
   (qiymətsiz imtahan dərc olunmur).
2. Sessiyaları yaradın (tarix, yer, tutum) və satış üçün **açın**. Tutum
   verilənlər bazasında yoxlanılır — artıq bilet satıla bilməz.
3. **Sual bankı** — imtahanın suallarını və düzgün cavablarını daxil edin.

## Nəticələr

1. OMR operatoru vərəqləri skan edib yoxlama növbəsini boşaltdıqdan sonra
   **Nəticələr** bölməsini açın.
2. "Yoxlamada" sütunu 0 olmalıdır; əks halda **Dərc et** düyməsi aktiv olmur.
3. **Dərc et** — nəticələr namizədlər üçün açılır. Namizəd ictimai
   **/results** səhifəsində bilet kodu (və ya QR) və namizəd nömrəsi ilə öz
   nəticəsini görür.
4. Səhv aşkarlansa, **Gizlət** basın, düzəliş edilsin, sonra yenidən dərc edin.
   Dərc olunmuş imtahan üçün yeni skan və düzəliş qəbul edilmir.

## Təhlükəsizlik

* Hər əməliyyat audit jurnalına yazılır (kim, nə vaxt, nə etdi).
* Bilet QR kodları imzalanıb; saxta və ya dəyişdirilmiş QR qəbul edilmir.
* İctimai nəticə səhifəsi IP üzrə dəqiqədə 10 sorğu ilə məhdudlaşdırılıb və
  səhv məlumatda həmişə eyni cavabı verir (təxmin etmək mümkün deyil).
