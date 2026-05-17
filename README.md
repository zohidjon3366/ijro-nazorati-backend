# Korxonalar bo‘yicha topshiriqlar va ijro nazorati tizimi — Stage 8.3

Stage 8.3 Stage 8.2 stable asosida tayyorlandi. Asosiy qoida saqlangan: Supabase bazani o‘chirish, yangi jadval/ustun/migration qo‘shish talab qilinmaydi.

## Yangi funksiyalar

1. **Rahbar oylik nazorat jadvali**
   - Menyuda faqat rahbar uchun `Nazorat jadvali` bo‘limi chiqadi.
   - Jadval ko‘rinishi korxona × nazorat bandlari formatida.
   - Oy tanlash maydoni bor: har oy alohida ko‘riladi.
   - O‘tgan oylar mavjud topshiriqlar orqali saqlanadi.

2. **Jadval kataklaridan topshiriq yaratish**
   - Rahbar jadvaldagi kerakli katakni bosadi.
   - Korxona, band va oy avtomatik tanlanadi.
   - Mas’ul xodim, muddat, soat, muhimlik va status belgilanadi.
   - Topshiriq mavjud `tasks` jadvaliga oddiy topshiriq sifatida yoziladi.

3. **Bandlarni rahbar sozlashi**
   - `⚙ Bandlar` yoki `Bandlarni sozlash` tugmasi orqali yangi band qo‘shiladi.
   - Band nomi, default muddat kuni, faol/nofaol holati va tartib raqami sozlanadi.
   - Bandlar Supabase Storage ichidagi JSON faylda saqlanadi.
   - Baza schema o‘zgarmaydi.

4. **Rangli nazorat holatlari**
   - `x` — topshiriq yo‘q / bajarilmagan.
   - `⏳` — jarayonda.
   - `!` — muddat yaqin.
   - `🔴` — muddati o‘tgan.
   - `✓` — bajarildi / direktor tasdiqladi.

5. **Excel va Print/PDF**
   - Jadval Excel `.xls` formatida yuklab olinadi.
   - Print/PDF uchun browser print rejimi qo‘shilgan.

## Saqlash mexanizmi

Nazorat bandlari quyidagi storage faylda saqlanadi:

```text
CONTROL_CONFIG_PATH=control-board/stage8_3_items.json
```

Default bucket:

```text
ATTACHMENTS_BUCKET=task-attachments
```

Agar ENV kiritilmasa, mavjud `task-attachments` bucket ishlatiladi. Bu yangi database jadval yoki ustun emas, Supabase Storage faylidir.

## Muhim ENV lar

Stage 8.2 dagi ENV lar saqlanadi. Stage 8.3 uchun ixtiyoriy ENV:

```text
ATTACHMENTS_BUCKET=task-attachments
CONTROL_CONFIG_PATH=control-board/stage8_3_items.json
```

## Deploy tartibi

Backend repo ichida quyidagilar almashtiriladi:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

Keyin:

```text
git add .
git commit -m "Stage 8.3 director monthly control board"
git push
```

Render’da:

```text
Manual Deploy → Deploy latest commit
```

Tilda’da iframe allaqachon qo‘yilgan bo‘lsa, Tilda’ga tegilmaydi.

## Tekshiruv

Deploydan keyin quyidagilar tekshiriladi:

```text
/health
/app
/api/bootstrap
/api/control-items
```

Rahbar login bilan kirib, `Nazorat jadvali` bo‘limini oching.

## Eslatma

Stage 8.3 nazorat jadvali mavjud `tasks`, `companies`, `app_users` ma’lumotlariga tayanadi. O‘tgan oylar saqlanishi uchun topshiriqlar o‘chirilmasligi kerak.
