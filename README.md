# ALL FINANCE KPI / Ijro Nazorati — Stage 8.4.3 Render Standalone

Bu versiyada KPI / Ijro Nazorati Tilda iframe'dan chiqarildi va Render/custom domain orqali mustaqil ishlaydi.

## Asosiy manzil

- Production: `https://kpi.allfinance.uz/`
- Health: `https://kpi.allfinance.uz/health`
- Eski moslik manzillari: `/app`, `/ijro` ham ilovani ochadi.

## Nima o'zgardi

1. Backend endi `/` root route'da `public/ijro-nazorati.html` ni beradi. Shu sabab `Cannot GET /` yo'qoladi.
2. Frontend API manzili hardcoded `onrender.com` emas. `window.location.origin` ishlatiladi. Demak `kpi.allfinance.uz` ichidan API ham shu domen orqali chaqiriladi.
3. Tilda/iframe talab qilinmaydi.
4. HTML javobiga `X-Frame-Options: SAMEORIGIN` va `Content-Security-Policy: frame-ancestors 'self'` qo'shildi. Ilova begona saytda iframe sifatida ishlashga bog'liq emas.
5. Stage 8.4.2 Hotfix 3 dagi Soliq Monitor Direct Sync, Nazorat jadvali, elektron arxiv va qolgan funksiyalar saqlangan.
6. Supabase schema o'zgarmaydi. Yangi SQL migratsiya talab qilinmaydi.

## Render deploy

GitHub repository'da quyidagilarni almashtiring:

- `server.js`
- `package.json`
- `public/ijro-nazorati.html`
- `README.md` (ixtiyoriy)

Keyin Render'da:

`Manual Deploy -> Deploy latest commit`

Deploy tugagach tekshiring:

1. `https://kpi.allfinance.uz/health` — JSON ichida `stage: 8.4.3-render-standalone` chiqishi kerak.
2. `https://kpi.allfinance.uz/` — to'g'ridan-to'g'ri login oynasi ochilishi kerak.
3. Brauzerda `Ctrl + F5` qiling.

## DNS

Agar `kpi.allfinance.uz` Render'da Verified va Certificate Issued bo'lsa hamda DNS CNAME `ijro-nazorati-backend.onrender.com` ga qaragan bo'lsa, DNS ni qayta o'zgartirish shart emas.

## Tilda

KPI uchun Tilda sahifasi/iframe endi kerak emas. Tilda'dagi eski KPI iframe sahifasini o'chirish yoki navigatsiyadan olib tashlash mumkin. Agar asosiy `allfinance.uz` saytida KPI tugmasi qolsa, uning havolasi to'g'ridan-to'g'ri `https://kpi.allfinance.uz/` bo'lsin.

## Muhim

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, Telegram va Soliq Monitor ENV lar o'zgarishsiz qoladi.
- `SOLIQ_MONITOR_IMPORT_SECRET` o'zgarmaydi.
- Soliq Monitor Direct Sync endpointlari o'zgarmagan, shuning uchun desktop Soliq Monitorni qayta sozlash shart emas.
