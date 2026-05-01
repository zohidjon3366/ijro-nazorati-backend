# Tilda Ijro Nazorati Backend

Bu backend Tilda ichidagi HTML mini-dastur uchun 2 ta endpoint beradi:

1. `GET /api/company-by-tin?tin=310153191&source=auto`
2. `POST /api/telegram-notify`

## Ishga tushirish

```bash
npm install
TELEGRAM_BOT_TOKEN=123456:ABC npm start
```

## Tilda HTML ichida sozlanadigan manzillar

HTML faylda quyidagilarni o'zgartiring:

```js
const COMPANY_LOOKUP_ENDPOINT = 'https://your-backend-domain.uz/api/company-by-tin';
const TELEGRAM_NOTIFY_ENDPOINT = 'https://your-backend-domain.uz/api/telegram-notify';
```

## Muhim

- Telegram bot tokenni HTML ichiga yozmang.
- Xodimlar botga /start yuborishi kerak.
- `chat_id` ni backend loglari, getUpdates yoki alohida bot handler orqali olib, xodim kartasiga kiriting.
- Orginfo uchun parser namunaviy. Sayt tuzilishi o'zgarsa, rasmiy API yoki iHamkor/Birdarcha ruxsatli endpointidan foydalaning.
