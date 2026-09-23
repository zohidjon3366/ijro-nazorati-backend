# Ijro Nazorati — Stage 8.4.2
## Unified Soliq Integration + Soliq Monitor Direct Sync

Stage 8.4.2 Stage 8.4.1 Hotfix 2 ustiga qurilgan. Mavjud `companies`, `tasks`, `task_history`, `app_users` va oldingi monitoring ma'lumotlari o'chirilmaydi.

## Nima yangilandi

- **Direct API**: Windows'dagi ALL FINANCE SOLIQ MONITOR v7.5.56 endi Telegramga bog'liq bo'lmasdan Ijro Nazoratiga strukturali JSON yuboradi.
- `accepted_report` eventlari: qabul qilingan hisobot → STIR → korxona → hisobot mappingi → Nazorat bandi → `Direktor tasdiqladi`.
- `tax_payment` eventlari: to'lov №, sana, soliq kodi, summa, bank holati bilan import qilinadi.
- **46 + 36 kombinatsiyasi**: JShDS va Ijtimoiy soliq ikkisi ham bank tomonidan to'langandagina `JSHODS VA IJTIMOIY SOLIQ TO'LOVLARI` bandi AUTO tasdiqlanadi. Bittasi bo'lsa `Bajarilmoqda / qisman` holatida qoladi.
- Rad etilgan to'lovlar import jurnalida qizil ko'rinadi va mas'ul xodim + direktor Telegram orqali ogohlantiriladi.
- Soliq kodi → Nazorat bandi mappinglari uchun yangi `monitoring_tax_mappings` jadvali va rahbar UI qo'shildi.
- Telegramdagi eski My Soliq Monitoring import oqimi fallback sifatida saqlanadi.
- Elektron arxiv yangi tax mappinglarni ham o'qiydi.

## Supabase migration — MAJBURIY

Deploydan oldin Supabase SQL Editor'da:

`supabase_stage8_4_2_schema_upgrade.sql`

faylini **bir marta** Run qiling.

SQL cumulative: Stage 8.4 + 8.4.1 + 8.4.2 strukturalarini idempotent yaratadi. Mavjud ma'lumotlarni o'chirmaydi; `TRUNCATE`/ma'lumotni tozalash yo'q.

Yangi/yangilangan obyektlar:

- `monitoring_imports` — `event_type`, `event_id`, `control_month`, tax payment dalillari ustunlari;
- `monitoring_tax_mappings` — soliq kodlari va kombinatsiyalar;
- oldingi `monitoring_report_mappings` saqlanadi.

## Render ENV

```text
SOLIQ_MONITOR_ENABLED=true
SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES=Zohidjon
SOLIQ_MONITOR_AUTO_STATUS=Direktor tasdiqladi
SOLIQ_MONITOR_CREATE_MISSING_TASK=true
SOLIQ_MONITOR_NOTIFY_PROBLEMS=true
SOLIQ_MONITOR_NOTIFY_CUSTOMER=false
SOLIQ_MONITOR_CONTROL_MONTH_MODE=sent_month
SOLIQ_MONITOR_ACCEPTED_SYNC_ANY_ASSIGNEE=true
SOLIQ_MONITOR_CONTROL_TIMEZONE=Asia/Tashkent
SOLIQ_MONITOR_IMPORT_SECRET=UZUN_MAXFIY_KALIT
```

`SOLIQ_MONITOR_IMPORT_SECRET` qiymati Soliq Monitor v7.5.56 dagi **KPI / Ijro Nazorati Direct Sync → Maxfiy kalit** bilan aynan bir xil bo'lishi kerak.

## Direct API

Health:

`GET /api/integrations/soliq-monitor/health`

Event:

`POST /api/integrations/soliq-monitor/events`

Header:

`x-soliq-monitor-secret: <SOLIQ_MONITOR_IMPORT_SECRET>`

Qo'llab-quvvatlanadigan eventlar:

- `accepted_report`
- `tax_payment`

## Default tax mapping

- `46 + 36` → `JSHODS VA IJTIMOIY SOLIQ TO'LOVLARI`
- `1` → NDS/QQS
- `100` → Aylanmadan soliq to'lovi
- `44` → Mol-mulk solig'i
- `53` → Yer solig'i
- `52` → Suv solig'i
- `32` → Foyda solig'i

Rahbar `Soliq Monitoring → Soliq kodlari` oynasida mappinglarni o'zgartira oladi.

## Deploy

Repo'da almashtiring:

- `server.js`
- `package.json`
- `README.md`
- `public/ijro-nazorati.html`

So'ng Render: **Manual Deploy → Deploy latest commit**.

Tilda iframe URL o'zgarmaydi:

`https://ijro-nazorati-backend.onrender.com/app`

## Tekshirish ketma-ketligi

1. Supabase Stage 8.4.2 SQL → Success.
2. Render ENV secretni kiriting.
3. Render deploy.
4. `/api/integrations/soliq-monitor/health` endpointini Soliq Monitor'dagi `Ulanishni tekshirish` tugmasi bilan tekshiring.
5. Bitta korxonada qabul qilingan hisobotni test qiling.
6. Bitta korxonada kod `46` va `36` to'lovlarini test qiling.
7. Nazorat jadvalida ikkala to'lovdan keyin `✓ Tasdiqlandi · AUTO` chiqishini tekshiring.

## Muhim

Direct API asosiy kanal. Telegramni o'chirish shart emas: u rahbar uchun ko'rinadigan parallel jurnal va fallback bo'lib qoladi.

## Stage 8.4.2 Hotfix 1 — Direct Sync diagnostika

- Ijro Nazorati → Soliq Monitoring sahifasida Direct API qabul soni va oxirgi event ko‘rinadi.
- `POST /api/integrations/soliq-monitor/probe` server + secret + Supabase aloqasini tekshiradi.
- Render logida har event uchun `[Soliq Direct Sync] IN` va `OUT` yozuvlari chiqadi.
- Direct event kelmagan bo‘lsa UI aniq ogohlantiradi.
- Supabase SQL qayta bajarilishi shart emas.
