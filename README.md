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
