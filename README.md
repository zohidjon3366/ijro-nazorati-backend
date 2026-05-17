# Ijro Nazorati — Stage 8.3.1 Final Fix

Ushbu paket Stage 8.3.1 fix asosida tayyorlandi. Hozirgi Supabase baza o'chirilmaydi, yangi jadval/ustun/migration qo'shilmaydi.

## Tuzatilgan muammolar

1. **Nazorat jadvali ustunlari**
   - Jadval ustunlari endi faqat `Nazorat jadvali bandlari` konfiguratsiyasidan olinadi.
   - Xodim topshiriqni bajarganda yoki direktor tasdiqlaganda yangi ustun qo'shilib ketmaydi.
   - Faqat mavjud katak holati yangilanadi: `x`, `⏳`, `!`, `🔴`, `✓`.

2. **Direktor tasdiqlaganda Telegram guruhga xabar yuborish**
   - Endi mijoz Telegram guruhiga xabar avtomatik yuborilmaydi.
   - Direktor `Tasdiqlash` tugmasini bosganda modal oyna ochiladi.
   - Modal oynada checkbox bor: `Mijoz Telegram guruhiga “topshiriq bajarildi” xabarini yuborish`.
   - Checkbox belgilanmasa, topshiriq faqat tizim ichida `Direktor tasdiqladi` bo'ladi.
   - Checkbox belgilanganda, korxonaga bog'langan Telegram guruhga bajarildi xabari yuboriladi.

## ENV

Oldingi ENV lar saqlanadi. Quyidagi sozlama qo'shilishi mumkin:

```text
CUSTOMER_DONE_NOTIFY_DEFAULT=false
```

Tavsiya: `false`. Shunda direktor xohlamasa Telegram guruhga xabar ketmaydi.

`CUSTOMER_DONE_NOTIFY_ENABLED=false` bo'lsa, Telegramga umuman yuborilmaydi. `true` yoki bo'sh bo'lsa, direktor checkbox belgilagan holatda yuboriladi.

## Deploy

Backend repo'da quyidagilar almashtiriladi:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

Keyin:

1. GitHub commit/push.
2. Render: `Manual Deploy -> Deploy latest commit`.
3. Tilda iframe allaqachon qo'yilgan bo'lsa, Tilda'ga tegilmaydi.
