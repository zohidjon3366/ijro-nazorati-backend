# Stage 8.4.2 Hotfix 2 — Bajarilgan oy + bir martalik uzatish

## Asosiy biznes qoidasi
Nazorat jadvali hisobotning qaysi davrga tegishli ekaniga qarab emas, ish real bajarilgan sanaga qarab yuritiladi.

- Avgust 2026 hisoboti 11.09.2026 da topshirildi → **Sentabr 2026 Nazorat jadvali**.
- Avgust soliqlari 12.09.2026 da to‘landi → **Sentabr 2026 Nazorat jadvali**.
- `report_period=2026-08` tarix/dalil sifatida saqlanadi.
- `control_month=2026-09` Nazorat jadvaliga bog‘lash uchun ishlatiladi.

## Dublikatlar
Direct API `event_id` bo‘yicha idempotent. Bir xil event qayta yuborilsa yangi import yoki yangi AUTO amal yaratmaydi.
Soliq Monitor v7.5.56.2 tomonda ham SENT KPI eventlari va Telegram yetkazmalari bir martalik ledger bilan saqlanadi.

## UI
Soliq Monitoring jurnalida hisobot davri va Nazorat oyi turlicha bo‘lsa ikkalasi ko‘rsatiladi.

## O‘rnatish
Supabase uchun yangi SQL kerak emas.
GitHub/Render’da `server.js`, `public/ijro-nazorati.html` va odatdagi release fayllarini almashtirib deploy qiling.
