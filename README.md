# Ijro nazorati — Stage 8.3.2

Stage 8.3.1 Final v2 asosida tayyorlangan qo‘shimcha fix.

## Muhim shart

- Hozirgi Supabase baza o‘chirilmaydi.
- Yangi jadval/ustun/migration qo‘shilmaydi.
- Nazorat jadvali bandlari va ko‘rinadigan korxonalar sozlamalari Supabase Storage JSON orqali saqlanadi.

## Kiritilgan o‘zgarishlar

1. Nazorat jadvalida ko‘rinadigan korxonalarni rahbar o‘zi belgilaydi.
2. Jadvalda korxona nomi yoki STIR bo‘yicha filtr qo‘shildi.
3. Katak ichida “Topshirish zarur emas” tugmasi qo‘shildi.
4. “Topshirish zarur emas” holati jadvalda alohida `-` belgisi bilan ko‘rinadi.
5. Barcha ko‘rinadigan korxonalarni belgilab, bitta band bo‘yicha ommaviy topshiriq berish qo‘shildi.
6. Agar shu oy/korxona/band bo‘yicha topshiriq avval mavjud bo‘lsa, ommaviy yaratishda uni yangilash yoki o‘tkazib yuborish tanlanadi.
7. Jadval ko‘rinishi zamonaviylashtirildi.
8. Jadval pastga scroll qilinganda ustun nomlari ko‘rinib turishi uchun jadval ichki scroll va sticky header bilan ishlaydi.
9. Supabase schema o‘zgarmaydi.

## Deploy

Repo’da quyidagilarni almashtiring:

- `server.js`
- `package.json`
- `README.md`
- `public/ijro-nazorati.html`

Keyin GitHub’ga push qiling va Render’da `Manual Deploy → Deploy latest commit` qiling.

Tilda iframe allaqachon qo‘yilgan bo‘lsa, Tilda’ga tegilmaydi.

## Yangi ENV ixtiyoriy

Alohida ENV shart emas. Istasangiz storage JSON yo‘lini o‘zgartirish mumkin:

```text
CONTROL_SETTINGS_PATH=control-board/stage8_3_settings.json
```
