# Stage 8.3.3 — Nazorat jadvali: “Topshirish zarur emas” yakuniy fix

Ushbu paket Stage 8.3.2 asosida tayyorlandi. Hozirgi Supabase baza o‘chirilmaydi, yangi jadval/ustun/migration qo‘shilmaydi.

## Qo‘shilgan va tuzatilgan funksiyalar

1. **“Topshirish zarur emas” bosilganda xodim biriktirilmaydi**
   - Nazorat jadvalidagi katakdan “Topshirish zarur emas” tanlansa, topshiriq `assignee_id = null` bilan saqlanadi.
   - Bunday topshiriq xodimga yuborilmaydi.

2. **Xodim izohi direktor ko‘rishi uchun ajratildi**
   - Xodim nazorat topshirig‘i izohiga “Topshirish zarur emas” deb yozsa, tizim uni direktor jadvalida alohida holat sifatida ko‘rsatadi.
   - Jadvaldagi katak “Xodim: topshirish zarur emas” holatini ko‘rsatadi.

3. **Topshirish zarur bo‘lmagan kataklar boshqacha ko‘rinadi**
   - Bunday kataklar maxsus kulrang chiziqli ko‘rinishda chiqadi.
   - Xodim tomonidan yozilgan holat sariq-kulrang ogohlantirish ko‘rinishida ajratiladi.

4. **Korxona + band bo‘yicha doimiy “zarur emas” qoidasi saqlandi**
   - Masalan, bir korxonada NDS topshirish zarur bo‘lmasa, bu holat Supabase Storage JSON sozlamasida saqlanadi.
   - Keyingi oy jadval ochilganda shu korxona va band avtomatik “Topshirish zarur emas” bo‘lib ko‘rinadi.
   - Database schema o‘zgarmaydi.

5. **“Zarur qilib qaytarish” tugmasi qo‘shildi**
   - Rahbar oldin saqlangan “Topshirish zarur emas” qoidasini bekor qila oladi.
   - Kerak bo‘lsa o‘sha katak yana oddiy topshiriq sifatida ishlatiladi.

## Saqlash mexanizmi

Quyidagi Storage JSON ishlatiladi:

```text
CONTROL_SETTINGS_PATH=control-board/stage8_3_settings.json
```

Ichida `companyIds` bilan birga `notRequiredItems` ham saqlanadi. Bu yangi jadval yoki ustun emas.

## Deploy

Repo’da quyidagi fayllarni almashtiring:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

Keyin GitHub’ga push qiling va Render’da:

```text
Manual Deploy → Deploy latest commit
```

Tilda iframe allaqachon qo‘yilgan bo‘lsa, Tilda’ga tegmang.
