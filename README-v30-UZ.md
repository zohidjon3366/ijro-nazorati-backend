# ALL FINANCE v30 FINAL

O‘zbekiston Respublikasi Mustaqilligining 35 yilligiga bag‘ishlangan bayramona dizaynli, to‘rt tilli yakuniy paket.

## Paket tarkibi

- 44 ta public sahifa: o‘zbek, rus, ingliz va xitoy tillarida;
- oq–ko‘k–yashil bayramona fon va O‘zbekiston bayrog‘i ranglaridagi lenta;
- markaziy `35` yillik badge, oltin konfetti va o‘zbek naqshlari;
- o‘ng tomonda original bino/monument kompozitsiyasi;
- mavjud ALL FINANCE logotipi va Inter shrift oilasi o‘zgartirilmagan;
- barcha sahifalarda bir xil header, dekor, ichki hero va footer;
- jamoa maʼlumotlari va rasmlarini admin orqali boshqarish;
- foydali maʼlumotlarni 4 ta alohida JSON ko‘rinishida boshqarish;
- murojaat formasini serverda saqlash;
- Render Persistent Disk bilan ishlaydigan `DATA_DIR` qo‘llab-quvvatlashi.

## Lokal ishga tushirish

Node.js 18 yoki yangi versiya kerak.

```text
npm run build
npm start
```

Sayt: `http://localhost:3000`

Admin: `http://localhost:3000/admin/`

Lokal admin paroli, agar environment berilmasa: `change-me`. Ommaviy serverda bu parolni ishlatmang.

## Render sozlamalari

```text
Build Command: npm run build
Start Command: npm start
Health Check Path: /health
```

Environment variables:

```text
ADMIN_PASSWORD=uzun-va-maxfiy-parol
DATA_DIR=/var/data/allfinance
NODE_VERSION=20
```

Persistent Disk:

```text
Mount Path: /var/data/allfinance
Size: 1 GB
```

Paketdagi `render.yaml` bu sozlamalarning tayyor namunasini beradi.

## Admin panel

### Jamoa

Manzil: `/admin/jamoa.html`

Bu bo‘limda:

- xodim qo‘shish yoki olib tashlash;
- rasm yuklash;
- tartib raqamini belgilash;
- saytda ko‘rsatish/yashirish;
- ism, lavozim va tajribani 4 tilda kiritish mumkin.

### Foydali maʼlumotlar

Manzil: `/admin/foydali.html`

Har bir til uchun alohida JSON beriladi. Asosiy kalitlar:

```text
info
calendar
workdays
rent
laws
links
```

Saqlangan maʼlumotlar `DATA_DIR/useful-admin-data.json` ichida saqlanadi va deploydan keyin yo‘qolmaydi.

## Deploydan keyin

1. Render’da `Manual Deploy → Clear build cache & deploy` qiling.
2. `/health` manzilida `ok: true` chiqishini tekshiring.
3. `/admin/` orqali kirib, admin parolini tekshiring.
4. Brauzerda eski dizayn qolsa, `Ctrl + F5` bosing.

## Dizaynni vaqtincha o‘chirish

Public HTML fayllaridagi quyidagi qator asosiy bayramona qatlamni ulaydi:

```text
/assets/css/independence-35.css?v=30.1
```

Bayramdan keyin shu CSS o‘rniga odatiy stil faylini ulash yoki undagi rang/dekor o‘zgaruvchilarini almashtirish mumkin. Admin va JSON funksiyalariga taʼsir qilmaydi.

## Muhim eslatma

`data/` papkasidagi boshlang‘ich JSON fayllar paket bilan beriladi. Render’da Persistent Disk avvaldan mavjud bo‘lsa, server diskdagi maʼlumotni saqlab qoladi va uni avtomatik ustidan yozmaydi.
