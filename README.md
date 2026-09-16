# Ijro Nazorati — Stage 8.4.1
## My Soliq Monitoring Integration

Stage 8.4.1 Stage 8.4 ustiga qurilgan. Oldingi ma'lumotlar o'chirilmaydi. Integratsiya uchun yangi jadvallar **qo'shiladi**, mavjud `companies`, `tasks`, `task_history`, `app_users` jadvallari saqlanadi.

## Asosiy imkoniyatlar

- My Soliq Monitoring Telegram xabarini avtomatik aniqlash.
- STIR bo'yicha `companies` jadvalidan korxonani topish.
- Bitta Telegram xabaridagi bir nechta hisobotni alohida import qilish.
- Yil/davr, jo'natilgan sana, tekshirilgan sana va tashqi statusni parse qilish.
- Hisobot nomini Nazorat jadvali bandiga mapping qilish.
- Mos nazorat topshirig'ini `company + month + control item` orqali topish.
- Zohidjonga biriktirilgan topshiriqni qabul qilingan status bo'lsa avtomatik `Bajarildi` yoki `Direktor tasdiqladi` holatiga o'tkazish.
- Mos topshiriq mavjud bo'lmasa, ixtiyoriy ravishda Zohidjon uchun nazorat topshirig'ini avtomatik yaratish.
- Muammoli/rad etilgan hisobot bo'lsa mas'ul xodim va direktor(lar)ga Telegram ogohlantirish yuborish.
- Dublikat xabarlar `dedupe_key` orqali qayta yopilmaydi.
- Rahbar panelida alohida **Soliq Monitoring** bo'limi: statistika, import jurnali, mappinglar, qayta ishlash va qo'lda test/import.
- Elektron HTML arxivga monitoring importlari va mappinglari ham qo'shildi.

## Muhim ishlash qoidasi

Tashqi bot xabari hisobotni kim topshirganini ko'rsatmasa, platforma xodimni taxmin qilmaydi. Avtomatik yopish faqat:

1. mavjud topshiriq ruxsat etilgan xodimga (default: `Zohidjon`) biriktirilgan bo'lsa; yoki
2. `SOLIQ_MONITOR_CREATE_MISSING_TASK=true` bo'lsa va platformada ruxsat etilgan faol xodim topilsa

amalga oshadi.

Agar shu korxona/band topshirig'i boshqa xodimga biriktirilgan bo'lsa, import jurnalida `Boshqa xodimga biriktirilgan` deb qoladi va avtomatik yopilmaydi.

## Supabase migration — MAJBURIY

Stage 8.4.1 integratsiyasi uchun Supabase SQL Editor'da:

`supabase_stage8_4_1_schema_upgrade.sql`

faylini bir marta ishga tushiring.

SQL mavjud ma'lumotlarni o'chirmaydi. `DROP`, `TRUNCATE`, `DELETE` yo'q.

Yangi jadvallar:

- `monitoring_imports`
- `monitoring_report_mappings`

Stage 8.4 jadvallari mavjud bo'lmasa, shu cumulative SQL ularni ham yaratadi.

## Render ENV

Tavsiya etilgan:

```text
SOLIQ_MONITOR_ENABLED=true
SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES=Zohidjon
SOLIQ_MONITOR_AUTO_STATUS=Direktor tasdiqladi
SOLIQ_MONITOR_CREATE_MISSING_TASK=true
SOLIQ_MONITOR_NOTIFY_PROBLEMS=true
SOLIQ_MONITOR_NOTIFY_CUSTOMER=false
SOLIQ_MONITOR_ALLOW_USER_FORWARD=true
```

Xavfsizlik uchun monitoring xabarlari keladigan maxsus Telegram guruhni cheklash tavsiya qilinadi:

```text
SOLIQ_MONITOR_CHAT_IDS=-100xxxxxxxxxx
```

My Soliq Monitoring bot ID ma'lum bo'lgach:

```text
SOLIQ_MONITOR_SOURCE_BOT_IDS=123456789
```

Bir nechta qiymat vergul bilan:

```text
SOLIQ_MONITOR_SOURCE_BOT_IDS=123456789,987654321
SOLIQ_MONITOR_CHAT_IDS=-1001111111111,-1002222222222
```

Qo'lda HTTP import endpointini himoyalash uchun ixtiyoriy:

```text
SOLIQ_MONITOR_IMPORT_SECRET=uzun-maxfiy-kalit
```

> Eslatma: brauzerdagi rahbar UI'dan qo'lda import ishlatilsa va `SOLIQ_MONITOR_IMPORT_SECRET` o'rnatilgan bo'lsa, hozirgi frontend secret yubormaydi. Secret asosan tashqi server-to-server import uchun mo'ljallangan. Telegram webhook oqimi secret talab qilmaydi.

## Telegram avtomatik oqimi

Eng qulay sxema:

1. Alohida Telegram guruh yarating, masalan `Soliq Monitoring → Ijro Nazorati`.
2. My Soliq Monitoring bot va Ijro Nazorati botini shu guruhga qo'shing.
3. Ijro Nazorati botida Bot-to-Bot Communication Mode'ni yoqing.
4. Ijro Nazorati botini guruh admini qiling yoki kerak bo'lsa Group Privacy Mode'ni o'chiring.
5. Render'da `SOLIQ_MONITOR_CHAT_IDS` ni shu guruh ID'iga sozlang.
6. My Soliq Monitoring xabari guruhga tushishi bilan `/api/telegram/webhook` uni avtomatik parse qiladi.

Agar My Soliq Monitoring faqat shaxsiy chatga xabar yuborsa va uni guruhga avtomatik chiqarish imkoniyati bo'lmasa, xabarni Ijro Nazorati botiga forward qilish mumkin. `SOLIQ_MONITOR_ALLOW_USER_FORWARD=true` bo'lsa, bot-origin forward qabul qilinadi.

## Statuslar

- `Qabul qilingan o'z vaqtida` → `accepted_on_time` → AUTO yopish.
- `Qabul qilingan` → `accepted` → AUTO yopish.
- `Qabul qilingan, kechikib` → `accepted_late` → AUTO yopish + jurnal ogohlantirishi.
- `Rad etilgan / xato / qabul qilinmagan` → `problem` → xodim + direktor Telegram ogohlantirish.
- `Tekshirilmoqda / kutilmoqda` → `pending` → topshiriq yopilmaydi.

## Deploy

GitHub repo'da almashtiring:

- `server.js`
- `package.json`
- `README.md`
- `public/ijro-nazorati.html`

So'ng Render:

`Manual Deploy → Deploy latest commit`

Tilda iframe manzili o'zgarmaydi:

`https://ijro-nazorati-backend.onrender.com/app`

## Tekshirish

1. `/health`
2. `/api/telegram/webhook-info`
3. `/api/soliq-monitor/summary`
4. Rahbar paneli → `Soliq Monitoring`
5. `+ Xabarni qo'lda import/test` orqali real bot xabarini sinang.

Birinchi testda 1 ta korxona va 1 ta hisobotdan boshlash tavsiya qilinadi. Import jurnalida korxona, nazorat bandi, topshiriq va `AUTO tasdiqlandi` natijasi to'g'ri chiqqach, umumiy oqim yoqiladi.
