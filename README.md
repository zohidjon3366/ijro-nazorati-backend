# Korxonalar bo‘yicha topshiriqlar va ijro nazorati tizimi — Stage 8.3.5

Stage 8.3.5 Stage 8.3.4 ustiga tayyorlangan qo‘shimcha fix. Hozirgi Supabase baza o‘chirilmaydi, yangi jadval, yangi ustun va migration qo‘shilmaydi.

## Kiritilgan o‘zgarishlar

1. Korxonalar ro‘yxatida status bo‘yicha avtomatik tartiblash:
   - Faol korxonalar yuqorida;
   - Vaqtincha to‘xtatilgan korxonalar oxirroqda;
   - Tugatilgan korxonalar eng oxirda.

2. Korxona statusiga `Tugatilgan` punkti qo‘shildi. Bu status Supabase Storage JSON sozlamasida saqlanadi, `companies` jadvaliga yangi ustun qo‘shilmaydi.

3. Direktor tasdiqlaganda mijoz Telegram guruhiga yuboriladigan xabarga xodim izohi ham avtomatik qo‘shiladi.

4. Topshiriq `Bajarilmadi` holatiga o‘tkazilganda biriktirilgan xodimga Telegram orqali ogohlantirish yuboriladi.

## Tavsiya etiladigan ENV

```text
EMPLOYEE_FAILED_NOTIFY_ENABLED=true
CUSTOMER_DONE_NOTIFY_ENABLED=true
CUSTOMER_DONE_NOTIFY_DEFAULT=false
```

## Deploy

Repo’da quyidagi fayllarni almashtiring:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

Keyin GitHub’ga push qiling va Render’da `Manual Deploy → Deploy latest commit` qiling.

Tilda iframe allaqachon qo‘yilgan bo‘lsa, Tilda’ga tegmang.
