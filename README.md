# Stage 8.3.1 Final v2 — Nazorat jadvali marker fix

Ushbu patch Stage 8.3.1 Final ustiga qo‘yiladi.

## Tuzatilgan muammo
Nazorat jadvalidan berilgan topshiriq xodim tomonidan bajarilib, direktor tomonidan tasdiqlangandan keyin ayrim holatlarda nazorat jadvalida ko‘rinmay qolgan.

Sabab: tasdiqlash yoki tahrirlash vaqtida `[NazoratJadvali]` markeri bir qatorga tushib qolishi yoki izohdan ajralishi mumkin edi. Frontend jadval esa marker ma’lumotini qat’iy formatda o‘qigan.

## Tuzatishlar
- Backend `PUT /api/tasks/:id` va `POST /api/tasks/:id/confirm` vaqtida nazorat markerini saqlaydi.
- Direktor tasdiqlash izohini o‘zgartirsa ham marker yo‘qolmaydi.
- Frontend marker bir qatorga tushib qolgan bo‘lsa ham `Oy`, `Band`, `BandID` ni aniqlaydi.
- Marker butunlay noto‘liq bo‘lsa ham `[Nazorat] ...` nomi, topshiriq turi va deadline oyi asosida jadvalga qaytarib ko‘rsatadi.
- Supabase bazasi o‘chirilmaydi.
- Yangi jadval/ustun/migration qo‘shilmaydi.

## Deploy
Repo’da quyidagilarni almashtiring:

```text
server.js
package.json
README.md
public/ijro-nazorati.html
```

Keyin GitHub’ga push qilib Render’da `Manual Deploy → Deploy latest commit` qiling.

Tilda iframe qo‘yilgan bo‘lsa, Tilda’ga tegmang.
