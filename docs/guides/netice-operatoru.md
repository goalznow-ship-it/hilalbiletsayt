# OMR / nəticə operatoru üçün təlimat

## 1. Cavab açarı

Cavab açarını mərkəzi administrator **OMR → Cavab açarları** bölməsində hazırlayır.
İmtahanı, variantı və sual sayını seçin. Hər sual üçün A–E cavabına toxunun və
balını qeyd edin. Hazır siyahını `ABCD` və ya `1:A 2:B 3:C` şəklində yapışdırmaq,
yaxud **Sual bankından seç** bölməsini istifadə etmək olar. Bütün cavabları yoxlayıb
**Cavab açarını saxla** basın. Açarı vərəqləri çap etməzdən əvvəl hazırlayın:
yeni versiya əvvəl çap edilmiş kartların cavab açarını dəyişmir.

## 2. Cavab vərəqinin çapı

1. **OMR → Vərəqlər** bölməsində ödənilmiş bileti və cavab açarını seçin.
2. PDF-i yükləyin və **100 % miqyasda** (səhifəyə sığdırmadan), ağ A4 kağıza,
   qara rəngdə çap edin. Vərəqdəki QR kod və künc işarələri kəsilməməlidir.

## 3. Skan və yükləmə

1. Doldurulmuş vərəqləri 200–300 dpi ilə skan edin (PDF, PNG və ya JPEG). Telefon
   şəkli də olar: bütün səhifə, dörd künc işarəsi görünməli, şəkil düz və
   aydın olmalıdır.
2. **OMR → Skan yükləmə** bölməsində imtahanı seçin. **Kameranı aç** ilə canlı
   görüntünü açın və icazə verin. Telefonda avtomatik çəkiliş aktivdir: dörd künc
   görünəndə və görüntü sabitləşəndə şəkil çəkilir, skan özü başlayır. Əl ilə
   çəkmək üçün **Kartı çək**, sonra **Skan et** basın. Uğurlu skandan sonra
   **Növbəti kartı skan et** ilə davam edin. **Yeni kart** əvvəlki seçimi təmizləyir.
3. Kamera açılmırsa, **Telefonla şəkil çək** düyməsini və ya PDF/JPEG/PNG fayl
   seçimini istifadə edin. Canlı kamera HTTPS tələb edir; saytın kamera icazəsini
   brauzer ayarlarında yoxlayın. HEIC faylları qəbul edilmir: canlı kamera JPEG
   hazırlayır. Web səhifəsi bir fayl qəbul edir: maksimum 25 MB. Böyük telefon
   şəkilləri vərəq kəsilmədən kiçildilir. Saatda 240 skan mümkündür.
   API ayrıca ən çox 4 fayl və cəmi 50 MB dəstəkləyir.
4. Nəticə səhifəsində status görünür: **COMPLETED** — bal hesablanıb,
   **REVIEW** — yoxlama növbəsinə düşüb. **FAILED** olduqda eyni faylla yenidən
   cəhd edin. **REJECTED** olduqda faylın formatını, ölçüsünü və aydınlığını yoxlayın.

Yalnız bu sistemdə yaradılmış, QR-li `hilal-a4-v1` kartı tanınır. Kənar cavab
kartı və adi bilet QR-si OMR vərəqini əvəz etmir. QR/filial əlaqəsi təsdiqlənmirsə,
operatora yalnız emal statusu göstərilir; detalları mərkəzi administrator yoxlayır.

Eyni vərəq ikinci dəfə yüklənsə, **DUPLICATE** kimi qeyd olunur və birinci
nəticəni dəyişmir.

## 4. Yoxlama növbəsi

Sistem şübhəli vərəqləri özü qiymətləndirmir və növbəyə göndərir:
zəif və ya yarımçıq işarə, bir suala iki işarə, tamamilə boş vərəq, bulanıq
şəkil, oxunmayan QR, dəyişmiş və ya ödənilməmiş bilet.

1. Yükləmənin səhifəsini açın; sarı sətirlər yoxlanmalı suallardır.
2. **Orijinal şəkli aç** ilə şəkli səhifədə görün. PDF üçün **Orijinal skanı endir**
   düyməsindən istifadə edin. **Yalnız şübhəli cavabları göstər** yoxlamanı asanlaşdırır.
3. Hər şübhəli sual üçün düzgün variantı (və ya **Boş**) seçin.
4. Səbəbi yazın (ən azı 5 simvol) və **Manual düzəlişi təsdiqlə** basın. Bal
   yenidən hesablanır; kim, nə vaxt və hansı sualları dəyişdiyi saxlanılır.
   Skan düzgün oxunubsa, səbəbi yazaraq cavabları dəyişmədən təsdiqləmək olar.

QR kodu təsdiqlənməmiş vərəqi əllə təsdiqləmək olmaz — vərəqi yenidən skan
edin.

## 5. Dərcə hazırlıq

**Nəticələr** bölməsində "Yoxlamada" və "Emal olunur" sayı 0, hazır nəticə sayı
isə müsbət olduqda administrator **Nəticələri dərc et** düyməsini istifadə edə bilər.
**Keçidi kopyala** ilə namizəd səhifəsini paylaşın. Namizəd bilet kodunu və namizəd
nömrəsini yazaraq balını, hər sualdakı seçimini və düzgün cavabı görür. Səhv və boş
cavabları ayrıca süzmək, tam nəticəni çap etmək mümkündür.
Nəticələr dərc olunduqdan sonra yeni skan yüklənmir; düzəliş
lazımdırsa, administratordan nəticələri müvəqqəti gizlətməsini xahiş edin.
