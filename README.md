# Ijro Nazorati — Stage 7.9 Rebuilt

Ushbu paket hozirgi Supabase baza strukturasini o‘zgartirmaydi. Yangi jadval, ustun yoki migration talab qilinmaydi.

## Asosiy imkoniyatlar

- Stage 7.8 dagi barcha frontend funksiyalar saqlangan.
- Topshiriqlar uchun rangli eslatmalar va Telegram reminder.
- Ommaviy/tezkor topshiriq berish: bir nechta korxona va bir nechta xodimga.
- Xodim samaradorligi reytingi.
- Muhimlik ranglari: Oddiy, Muhim, Shoshilinch, Kritik.
- Excel hisobot: `/api/reports/tasks.xls`.
- Kuchaytirilgan kalendar: kunlik/haftalik/oylik.
- Arxiv filtrlari.
- Telegram guruhdan `#z` yoki `/z` orqali text/voice topshiriqlarni Shoshilinch topshiriqqa aylantirish.

## Iframe app route

Render backend quyidagi yo‘ldan web appni beradi:

```
/app
```

Tilda ichida katta HTML emas, qisqa iframe ishlatiladi.

## Telegram guruhdan topshiriq olish

Backend endpoint:

```
POST /api/telegram/webhook
```

Webhook sozlash uchun endpoint:

```
POST /api/telegram/set-webhook
```

Body namunasi:

```json
{ "baseUrl": "https://ijro-nazorati-backend.onrender.com", "secret": "ixtiyoriy_sir" }
```

## Kerakli env sozlamalar

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_BOT_TOKEN=...
PUBLIC_BACKEND_URL=https://ijro-nazorati-backend.onrender.com
TELEGRAM_TASK_COMMAND=#z
TELEGRAM_GROUP_COMPANY_MAP={"-1001234567890":"company_id"}
TELEGRAM_DEFAULT_ASSIGNEE_MAP={"company_id":"user_id"}
TELEGRAM_DEFAULT_DEADLINE_HOURS=24
REMINDER_SCAN_MINUTES=5
```

Voice transkript uchun ixtiyoriy:

```
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_TRANSCRIPTION_LANGUAGE=uz
```

`OPENAI_API_KEY` bo‘lmasa ham voice xabar Shoshilinch topshiriq sifatida yaratiladi, lekin transkript bo‘sh qolishi mumkin. Ovozli fayl mavjud `task_attachments` mexanizmi orqali ilova sifatida saqlanadi.

## Baza xavfsizligi

Bu patch Supabase schema o‘zgartirmaydi. Faqat mavjud jadvallarga oddiy yozuvlar qo‘shadi:

- `tasks` — yangi topshiriq
- `task_history` — tarix yozuvi
- `task_attachments` — voice ilova, agar voice bo‘lsa

