# Stage 8.4.2 Hotfix 1 — Direct Sync diagnostika

- Direct API qabul soni va oxirgi event Ijro Nazorati → Soliq Monitoring bo‘limida ko‘rinadi.
- `/api/integrations/soliq-monitor/probe` POST endpoint qo‘shildi.
- Event kelganda Render logida `IN` / `OUT` yozuvi chiqadi.
- `company_not_found`, `mapping_not_found`, `task_not_found` kabi semantik natijalar endi ko‘rinadi.
- Supabase migration talab qilinmaydi.
