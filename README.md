# Ijro nazorati backend — Stage 2 Supabase

Bu backend Tilda ichidagi HTML mini-dastur uchun ishlaydi:

- Supabase PostgreSQL bazasi bilan umumiy ma'lumot saqlash
- Telegram xabar yuborish
- STIR bo'yicha korxona nomini ochiq manbadan olish

## Render Environment Variables

Render → Service → Environment bo'limiga quyidagilarni kiriting:

```text
TELEGRAM_BOT_TOKEN=BotFather token
SUPABASE_URL=https://PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase secret/service_role key
ALLOWED_ORIGIN=*
```

## Endpointlar

```text
GET  /health
POST /api/auth/login
GET  /api/bootstrap
GET  /api/company-by-tin?tin=310153191&source=auto
POST /api/telegram-notify
POST /api/users
PUT  /api/users/:id
DELETE /api/users/:id
POST /api/companies
PUT  /api/companies/:id
DELETE /api/companies/:id
POST /api/tasks
PUT  /api/tasks/:id
POST /api/tasks/:id/confirm
DELETE /api/tasks/:id
POST /api/task-templates
PUT  /api/task-templates/:id
DELETE /api/task-templates/:id
```

## GitHubga yuklash

Repositoryda eski `server.js`, `package.json`, `README.md` fayllarni shu fayllar bilan almashtiring. Render avtomatik qayta deploy qiladi.
