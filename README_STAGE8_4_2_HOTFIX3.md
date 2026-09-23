# Stage 8.4.2 Hotfix 3 — Accepted Report Status Fix

Muammo: Soliq Monitor v7.5.56.2 kirillcha `Қабул қилинган ўз вақтида` holatini `status_group=unknown` sifatida yuborgan. To‘lovlar esa kirill holatlarini allaqachon taniyotgani uchun ular Nazorat jadvalida ko‘ringan.

Tuzatishlar:
- Ijro Nazorati `status_group=unknown` bo‘lsa tashqi `external_status`dan holatni qayta aniqlaydi.
- `Qabul qilingan hisobotlarni qayta sinxronlash` tugmasi eski Direct API `accepted_report` yozuvlarini ham raw_payload orqali qayta ishlaydi.
- Hisobot davri Avgust bo‘lsa ham topshirilgan sana Sentabr bo‘lsa, Nazorat oyi Sentabr bo‘lib qoladi.
- Supabase migration talab qilinmaydi.

Deploydan keyin Soliq Monitoring bo‘limida `Qabul qilingan hisobotlarni qayta sinxronlash` tugmasini bir marta bosing.
