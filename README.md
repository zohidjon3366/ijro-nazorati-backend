# Ijro Nazorati — Stage 8.2

Stage 8.2 Stage 8.1 Stable Control Center asosida yig‘ildi. Ushbu patch hozirgi Supabase bazani o‘chirmaydi, yangi jadval/ustun qo‘shmaydi va migration ishlatmaydi.

## Nimalar qo‘shildi

- Rahbar nazorat markazida `Telegramdan kelganlar` bloki faqat dolzarb statuslarni ko‘rsatadi: `Yangi`, `Qabul qilindi`, `Bajarilmoqda`, `Qayta ishlashga qaytarildi`.
- `Tasdiq kutayotganlar` bloki qo‘shildi. Xodim `Bajarildi` qilgan topshiriqlar direktor tasdiqlaguncha shu yerda ko‘rinadi.
- Telegram voice topshiriqlarida audio ilova mavjud bo‘lsa, alohida `▶ Eshitish` tugmasi chiqadi. `Ovoz/Transkript` tugmasi saqlangan.
- Telegramdan kelgan topshiriqlar uchun muddat business-hours qoidasi bo‘yicha belgilanadi.
- Telegram reminder tizimiga `scheduled` digest rejimi qo‘shildi: belgilangan soatlarda rahbarlarga umumiy nazorat xabari yuboriladi.
- Korxonalar sahifasida qatorlar sonini tanlash qo‘shildi: `10`, `50`, `100`, `1000`. Tanlov browser `localStorage`da saqlanadi.
- Bugungi ish rejasi, xavfli topshiriqlar, rangli kartalar va xodim uchun muhim topshiriqlarni yuqoriga chiqarish yaxshilandi.
- Kechikish sababini `[Kechikish sababi]: ...` marker orqali mavjud izoh maydonlarida ko‘rsatish qo‘llab-quvvatlanadi.
- Haftalik digest uchun ENV qo‘shildi, default o‘chiq.

## Muhim cheklov

```text
Yangi jadval yo‘q
Yangi ustun yo‘q
Migration yo‘q
Supabase mavjud ma’lumotlari saqlanadi
```

## Render ENV

Mavjud ENV lar saqlanadi:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_BOT_TOKEN=...
PUBLIC_BACKEND_URL=https://ijro-nazorati-backend.onrender.com
TELEGRAM_TASK_COMMAND=#z
TELEGRAM_GROUP_COMPANY_MAP={...}
TELEGRAM_DEFAULT_ASSIGNEE_MAP={...}
CUSTOMER_DONE_NOTIFY_ENABLED=true
OPENAI_API_KEY=...
OPENAI_TRANSCRIPTION_MODEL=whisper-1
OPENAI_TRANSCRIPTION_LANGUAGE=uz
```

Stage 8.2 uchun tavsiya qilingan reminder ENV:

```text
REMINDER_MODE=scheduled
REMINDER_SCAN_MINUTES=5
REMINDER_THRESHOLDS_MINUTES=1440,180,60
REMINDER_TIMES=09:00,13:00,17:30,20:00
REMINDER_TIMEZONE=Asia/Tashkent
REMINDER_SCHEDULE_WINDOW_MINUTES=3
REMINDER_DIGEST_ENABLED=true
REMINDER_OVERDUE_EVERY_TIME=true
```

Telegram default deadline ENV:

```text
TELEGRAM_DEFAULT_DEADLINE_MODE=business_hours
TELEGRAM_WORK_START=09:00
TELEGRAM_WORK_END=18:00
TELEGRAM_WORK_HOURS_DEADLINE_HOURS=1
TELEGRAM_OFF_HOURS_DEADLINE_HOURS=8
TELEGRAM_TIMEZONE=Asia/Tashkent
```

Haftalik digest ENV, default o‘chiq:

```text
WEEKLY_DIGEST_ENABLED=false
WEEKLY_DIGEST_DAY=FRIDAY
WEEKLY_DIGEST_TIME=17:30
WEEKLY_DIGEST_TIMEZONE=Asia/Tashkent
```

## Telegram deadline qoidasi

Agar Telegram xabar ichida muddat yozilgan bo‘lsa, shu muddat ustun turadi:

```text
#z Bugun 16:00 gacha bank to‘lovini qilish
muddat: 2026-05-08 16:30
muddat: 08.05.2026 16:30
soat: 15:00
vaqt: 14:30
```

Agar muddat yozilmagan bo‘lsa:

- 09:00–18:00 oralig‘ida kelgan xabar: deadline = kelgan vaqt + 1 soat;
- ish vaqtidan tashqarida kelgan xabar: deadline = +8 soat, lekin tungi vaqtga tushsa ertasi ish kuni 10:00 qilib qo‘yiladi.

Deadline soati yangi ustun qo‘shmasdan mavjud `[Soat: HH:MM]` marker mexanizmi orqali saqlanadi.

## Telegram group-company map

`TELEGRAM_GROUP_COMPANY_MAP` albatta JSON formatida bo‘lsin:

```json
{
  "-1003841965979": "f39350de-172c-453d-a5cc-51a3b5ccbe1a"
}
```

Bir nechta guruh bo‘lsa, har bir juftlik orasida vergul qo‘yiladi:

```json
{
  "-1003841965979": "f39350de-172c-453d-a5cc-51a3b5ccbe1a",
  "-1003965857211": "8b38450b-0f90-46f2-9e74-90c3151f8885"
}
```

## Deploy tartibi

Backend repo’da quyidagilar almashtiriladi:

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

Agar Tilda’da iframe allaqachon qo‘yilgan bo‘lsa, Tilda’ga tegmang. Iframe yo‘q bo‘lsa, `tilda_iframe_embed_stage8_2.html` ichidagi kodni Tilda T123/HTML block ichiga qo‘ying.

## Deploydan keyingi tekshiruv

```text
/health
/app
/api/telegram/webhook-info
/api/reminders/config
```

## Render Free haqida ogohlantirish

Render Free instance uxlab qolishi mumkin. Scheduled reminder aniq soatda ishlashi uchun Render Starter/Paid instance tavsiya qilinadi yoki UptimeRobot orqali `/health` manzilini har 5 daqiqada ping qiling.
