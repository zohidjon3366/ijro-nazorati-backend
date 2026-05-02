# Ijro nazorati backend — Stage 3

Stage 3 quyidagilarni qo'shadi:

- Topshiriq tarixi endpointi va HTML ichida ko'rish
- Hisobotlar bo'limi
- Korxona/xodim/status/muddat/tezkor/kechikkan filtrlar
- Excel uchun CSV eksport endpointi

## Render Environment Variables

```text
TELEGRAM_BOT_TOKEN=BotFather token
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase secret/service_role key
ALLOWED_ORIGIN=*
```

## Yangi endpoint

```text
GET /api/reports/tasks.csv
```

Filtr query parametrlari: `companyId`, `assigneeId`, `status`, `dateFrom`, `dateTo`, `overdue=true`, `quick=true/false`.


## Stage 4: Topshiriq ilovalari

Qo‘shimcha endpointlar:

```text
GET    /api/tasks/:id/attachments
POST   /api/tasks/:id/attachments
DELETE /api/attachments/:id
```

`POST /api/tasks/:id/attachments` `multipart/form-data` qabul qiladi:

- `file` — yuklanadigan fayl
- `actorId` — foydalanuvchi ID

Render Environment Variables:

```text
ATTACHMENTS_BUCKET=task-attachments
MAX_ATTACHMENT_SIZE_MB=25
```

Supabase’da `task_attachments` jadvali va `task-attachments` Storage bucket yaratilgan bo‘lishi kerak.


## Stage 7 — Tezkor kirish optimizatsiyasi

Qo‘shildi:
- `POST /api/auth/login?bootstrap=false` — loginni tezroq bajaradi, katta bootstrap ma’lumotlar alohida yuklanadi.
- `/health` endpointi vaqt qaytaradi, Tilda sahifasi login oynasida backendni oldindan uyg‘otadi.
- Eski HTML bilan moslik saqlangan: `bootstrap=false` bo‘lmasa eski javob formati ishlaydi.

Render Free ishlatilsa, servis uxlab qolishi mumkin. Eng kuchli tezlik uchun Render paid instance yoki UptimeRobot orqali `https://ijro-nazorati-backend.onrender.com/health` manziliga har 5 daqiqada ping tavsiya qilinadi.


## Stage 7.1 — Ommaviy topshiriq, nusxalash va tezlik

Qo‘shildi:
- Kunduzgi rejimda oq shriftlar olib tashlandi, asosiy yozuvlar quyuq rangga o‘tkazildi.
- Korxonalar ro‘yxatida checkbox orqali bir nechta korxonani belgilab, bitta topshiriqni har bir korxonaga alohida yaratish imkoniyati qo‘shildi.
- Topshiriq kartasi/jadvalidan `Nusxalash` tugmasi qo‘shildi. Nusxada status `Yangi`, muddat bugungi sana bo‘ladi.
- `POST /api/tasks/bulk` endpointi qo‘shildi. Body ichida `companyIds` massivi yuboriladi.
- `/api/warmup` endpointi qo‘shildi: login oynasi ochilganda backend bilan birga Supabase ulanishini ham oldindan uyg‘otadi.
- Frontend bootstrap ma’lumotlarini sessiya cache’iga saqlaydi va keyingi kirishda panelni tezroq ko‘rsatadi, so‘ng fonda yangilaydi.
