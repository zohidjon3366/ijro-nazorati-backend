# Ijro Nazorati — Stage 8.0

Ushbu patch hozirgi Supabase baza tuzilmasini o‘zgartirmaydi. Yangi jadval, ustun yoki migration yo‘q.

## Qo‘shilganlar

- Rahbar nazorat markazi: Telegramdan kelgan topshiriqlar, bugungi, kechikkan va 1 soatdan kam qolgan topshiriqlar.
- Xodimlar va korxonalar reytingi.
- Topshiriq kartalarida tezkor amal tugmalari.
- Mijoz Telegram guruhiga “topshiriq bajarildi va tasdiqlandi” xabari.
- PDF/Print va yaxshilangan Excel/CSV hisobotlar.
- Telegram voice xabarlar uchun audio player va transkript ko‘rinishi.
- Ovozli fayllarni ilova oynasiga kirmasdan “Ovoz/Transkript” tugmasi orqali eshitish.

## Env sozlamalar

Mijoz guruhiga yakuniy xabar yuborish uchun mavjud `TELEGRAM_GROUP_COMPANY_MAP` ishlatiladi:

```json
{"-1003841965979":"company_id"}
```

Ixtiyoriy o‘chirish:

```text
CUSTOMER_DONE_NOTIFY_ENABLED=false
```

## Deploy

GitHub repo ichida quyidagilarni almashtiring:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

So‘ng Render’da Manual Deploy qiling.
