# Korxonalar bo‘yicha topshiriqlar va ijro nazorati tizimi — Stage 8.3.4

Ushbu paket Stage 8.3.3 asosida tayyorlangan qo‘shimcha fix hisoblanadi.

## Muhim shart

- Hozirgi Supabase baza o‘chirilmaydi.
- Yangi jadval qo‘shilmaydi.
- Yangi ustun qo‘shilmaydi.
- Migration kerak emas.
- Tilda iframe tartibi saqlanadi.

## Stage 8.3.4 da kiritilgan o‘zgarishlar

### 1. 1000 tadan keyingi topshiriqlar soni to‘g‘rilandi

Supabase `select()` so‘rovlari default holatda 1000 qator bilan cheklanib qolishi mumkin edi. Endi backend topshiriqlarni, korxonalarni, foydalanuvchilarni va ilova flaglarini page-by-page tortadi.

Natija:

- 1000 tadan keyin ham topshiriqlar soni to‘g‘ri ko‘rinadi;
- menu hisoblagichlari to‘g‘ri ishlaydi;
- dashboard va hisobotlarda umumiy sonlar to‘g‘ri hisoblanadi;
- reminder/digest hisob-kitoblarida ham 1000 limitga tushib qolmaydi.

Qo‘shimcha ENV majburiy emas. Zarurat bo‘lsa:

```text
SUPABASE_FETCH_PAGE_SIZE=1000
SUPABASE_FETCH_MAX_ROWS=50000
```

### 2. Topshiriqlar ro‘yxatida page size kengaytirildi

Topshiriqlar ro‘yxatida har sahifadagi qatorlar soni tanlanadi:

```text
10 / 50 / 100 / 1000 / 2000 / 5000
```

Tanlangan qiymat browser `localStorage` da saqlanadi.

### 3. Bajarilmagan yoki muammoli topshiriqlarni guruhlab o‘chirish

Rahbar uchun topshiriqlar ro‘yxatida quyidagi imkoniyatlar qo‘shildi:

- joriy sahifadagi muammoli topshiriqlarni belgilash;
- belgilangan topshiriqlarni guruhlab o‘chirish;
- belgilarni tozalash.

O‘chirish faqat quyidagi muammoli holatlarga qo‘llanadi:

```text
Bajarilmadi
Bekor qilindi
Qayta ishlashga qaytarildi
Muddati o‘tgan topshiriqlar
```

Bajarilgan yoki direktor tasdiqlagan topshiriqlar tasodifan belgilanib qolsa ham backend ularni o‘chirmaydi.

## Deploy tartibi

Backend repo’da quyidagi fayllarni almashtiring:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

Keyin:

```text
GitHub commit/push
Render → Manual Deploy → Deploy latest commit
```

Agar Tilda’da iframe allaqachon qo‘yilgan bo‘lsa, Tilda’ga tegmang.

## Tekshiruv

Deploydan keyin:

```text
/health
/app
```

Sahifani `Ctrl + F5` bilan yangilang.
