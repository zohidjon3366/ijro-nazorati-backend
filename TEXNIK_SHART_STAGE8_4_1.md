# Texnik shart — Stage 8.4.1 My Soliq Monitoring Integration

## 1. Maqsad
My Soliq Monitoring Telegram xabarlaridan korxona va topshirilgan soliq hisobotlari holatini avtomatik o'qib, Rahbar Nazorat jadvali va mavjud topshiriqlar bilan bog'lash.

## 2. Saqlanadigan funksiyalar
Stage 8.4 va oldingi barcha funksiyalar saqlanadi: nazorat jadvali, topishirish zarur emas qoidalari, korxona statuslari, bulk topshiriqlar, Telegram vazifalar, scheduled reminder, HTML arxiv, 1000+ task pagination va bulk delete.

## 3. Baza prinsipi
Mavjud jadvallar o'chirilmaydi va ma'lumotlar saqlanadi. Stage 8.4.1 da faqat yangi integratsiya jadvallari qo'shiladi:

- `monitoring_imports` — har bir tashqi hisobot bo'yicha immutable-ish import jurnal.
- `monitoring_report_mappings` — tashqi hisobot nomini Nazorat jadvali bandiga mapping.

## 4. Telegram kirish oqimi
Backend mavjud `/api/telegram/webhook` orqali kelgan `message` va `edited_message` ni tekshiradi. Soliq monitoring formati aniqlansa, #z topshiriq parseridan oldin integratsiya parseriga beriladi.

Qabul qilish manbalari:
- botdan shared groupga to'g'ridan-to'g'ri xabar;
- bot-origin forward;
- qo'lda import/test endpointi.

Allowlist ENV:
- `SOLIQ_MONITOR_SOURCE_BOT_IDS`
- `SOLIQ_MONITOR_CHAT_IDS`

## 5. Parser
Xabardan aniqlanadi:
- STIR;
- korxona nomi;
- bir yoki bir nechta hisobot nomi;
- yil/davr;
- jo'natilgan sana;
- holati;
- tekshirilgan sana.

Uzbek lotin, Uzbek kirill va asosiy ruscha harflar normalizatsiyasi qo'llanadi.

## 6. Mapping
Avval `monitoring_report_mappings` qoidalari ishlaydi. Mapping topilmasa xavfsiz keyword fallback qo'llanadi. `Mol-mulk ijarasi uchun to'lov manbaida ...` kabi boshqa mazmundagi hisobot `Mol-mulk solig'i`ga faqat nomida `mol-mulk` borligi uchun avtomatik biriktirilmasligi kerak.

## 7. Topshiriq matching
Mos topshiriq quyidagi kalitlar bilan topiladi:

`company_id + NazoratJadvali Oy + BandID/Band`

Fallback sifatida `company_id + deadline month + title/type` ishlatiladi.

## 8. Xodim attributsiyasi
Default avtomatik xodim: `Zohidjon`.

ENV:
- `SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS`
- `SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES`

Tashqi xabarda bajaruvchi ko'rsatilmaganligi sabab boshqa xodimga biriktirilgan topshiriq Zohidjon nomidan avtomatik yopilmaydi.

## 9. AUTO yopish
Qabul qilingan holatlarda:
- mavjud mos topshiriq topiladi;
- yoki ruxsat berilsa yangi nazorat topshirig'i yaratiladi;
- status `SOLIQ_MONITOR_AUTO_STATUS` bo'yicha o'zgaradi (`Bajarildi` yoki `Direktor tasdiqladi`);
- `task_history` ga audit yozuvi yoziladi;
- import jurnaliga matched IDs va auto action saqlanadi.

Customer Telegram guruhiga avtomatik yuborish default o'chiq: `SOLIQ_MONITOR_NOTIFY_CUSTOMER=false`.

## 10. Muammoli hisobotlar
`problem` statusda:
- topshiriq avtomatik yakunlanmaydi;
- mas'ul xodim Telegramiga xabar yuboriladi;
- direktor Telegramiga xabar yuboriladi;
- task_history va monitoring_imports jurnalida qayd qilinadi.

## 11. Deduplikatsiya
`dedupe_key` SHA-256 orqali source/chat/message/STIR/report/period/sent/status kombinatsiyasidan hosil qilinadi. Bir xil bot xabari qayta kelganda task takror yopilmaydi.

## 12. Rahbar UI
Yangi `Soliq Monitoring` bo'limi:
- 30 kunlik statistika;
- import jurnali;
- status va auto action;
- mos nazorat bandi/topshiriq;
- qayta ishlash;
- qo'lda import/test;
- mappinglar editori.

## 13. Elektron arxiv
Stage 8.4 HTML arxiviga `monitoring_imports` va `monitoring_report_mappings` ham qo'shiladi.

## 14. Qabul mezonlari
1. STIR mavjud korxonaga to'g'ri ulanadi.
2. Bitta xabardagi 5 hisobot 5 import yozuviga ajraladi.
3. Avgust 2026 davri `2026-08` bo'lib aniqlanadi.
4. Qabul qilingan hisobot mos nazorat topshirig'ini yopadi.
5. Boshqa xodimga biriktirilgan task Zohidjon nomidan yopilmaydi.
6. Muammoli statusda xodim va direktor ogohlantiriladi.
7. Bir xil xabar ikkinchi marta taskni qayta o'zgartirmaydi.
8. Mapping topilmasa jurnalga `mapping_not_found` tushadi.
9. Mavjud tarixiy ma'lumotlar o'chmaydi.
10. Elektron HTML arxiv monitoring jurnali bilan shakllanadi.
