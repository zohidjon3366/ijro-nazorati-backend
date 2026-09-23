# TEXNIK SHART — Stage 8.4.2 Unified Soliq Integration

## 1. Maqsad
ALL FINANCE SOLIQ MONITOR v7.5.56 dan Ijro Nazorati platformasiga soliq hisobotlari va soliq to'lovlarini strukturali, idempotent va xavfsiz API orqali avtomatik uzatish.

## 2. Asosiy talablar
- Mavjud baza o'chirilmasin.
- Stage 8.4.1 Hotfix 2 funksiyalari saqlansin.
- Telegram fallback ishlashda davom etsin.
- Direct API xabari takror kelsa dublikat task/status yaratilmasin.
- STIR asosiy korxona identifikatori bo'lsin.

## 3. Eventlar
### accepted_report
STIR, report_name, year, period, sent_at, checked_at, external_status.
Qabul qilingan status → mos Nazorat topshirig'i AUTO tasdiqlanadi.

### tax_payment
STIR, payment_no, payment_date, tax_code, tax_name, amount, external_status.
`paid` → mapping va kombinatsiya qoidasi tekshiriladi.
`rejected` → topshiriq yopilmaydi, ogohlantirish yuboriladi.

## 4. Kombinatsiya qoidasi
Default:
- code 46 + code 36 = bir guruh (`payroll_taxes`).
- Faqat bittasi paid → task `Bajarilmoqda`, jurnal `Qisman 1/2`.
- Ikkalasi paid → task `Direktor tasdiqladi`.
- Oldingi rejected yozuvlar tarixda qoladi; joriy paid eventlar yangi holatni tasdiqlaydi.

## 5. Mapping
`monitoring_tax_mappings`:
- tax_code
- tax_name
- control_item_id/name
- group_key
- required_codes[]
- priority
- is_active

Rahbar UI'dan tahrirlashi mumkin.

## 6. API xavfsizlik
`x-soliq-monitor-secret` header majburiy bo'lishi tavsiya qilinadi.
Render `SOLIQ_MONITOR_IMPORT_SECRET` va Windows dasturidagi maxfiy kalit bir xil bo'ladi.

## 7. Deduplikatsiya
Soliq Monitor event_id yaratadi. Supabase `monitoring_imports.event_id` unique index va `dedupe_key` orqali qayta ishlashdan himoyalanadi.

## 8. Nazorat oyi
- accepted_report: default jo'natilgan sana oyi.
- tax_payment: payment_date oyi.

## 9. UI
Rahbar `Soliq Monitoring` bo'limida:
- report/tax-payment badge;
- tashqi status;
- to'lov raqami/sana/summa;
- Nazorat bandi;
- task link;
- AUTO amal;
- Hisobot mappinglari;
- Soliq kodlari mappinglari.

## 10. Qabul mezonlari
- Direct health 200/ok qaytarsin.
- accepted_report Nazorat jadvalini avtomatik tasdiqlasin.
- 46 paid yakka holda yakunlamasin.
- 36 paid kelgach 46+36 bandi AUTO tasdiqlansin.
- rejected payment xodim va direktorga ogohlantirish bersin.
- duplicate event ikkinchi task yaratmasin.
- Telegram oqimi ishlashda davom etsin.
