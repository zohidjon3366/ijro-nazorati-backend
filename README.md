# Ijro Nazorati — Stage 7.5 iframe deploy patch

Bu patch Tilda T123 blokidagi **“juda ko‘p matn”** xatosini hal qiladi.

## Nima o‘zgardi

- Dastur HTML/JS/CSS fayli Render backend ichidagi `public/ijro-nazorati.html` faylidan ochiladi.
- Tilda ichiga endi katta HTML kod emas, faqat qisqa `iframe` qo‘yiladi.
- Supabase baza tuzilmasi o‘zgarmaydi.
- Jadval/ustun/migration qo‘shilmaydi.
- Stage 7.5 Compact Kanban funksiyalari saqlangan.

## Render URL

Deploydan keyin dastur shu manzilda ochiladi:

```
https://ijro-nazorati-backend.onrender.com/app
```

Yoki:

```
https://ijro-nazorati-backend.onrender.com/ijro
```

## Tilda iframe kodi

T123 / HTML blokka faqat shu kodni qo‘ying:

```html
<div style="width:100%;min-height:100vh;margin:0;padding:0;overflow:hidden;">
  <iframe
    src="https://ijro-nazorati-backend.onrender.com/app"
    style="width:100%;height:100vh;border:0;display:block;"
    loading="eager"
    allow="clipboard-read; clipboard-write">
  </iframe>
</div>
```

## Joylash tartibi

1. Backend repo ichidagi `server.js`, `package.json`, `README.md` fayllarini ushbu patchdagi fayllar bilan almashtiring.
2. `public/ijro-nazorati.html` faylini ham repo ichiga qo‘shing.
3. GitHub’ga commit/push qiling.
4. Render deploy tugashini kuting.
5. `https://ijro-nazorati-backend.onrender.com/app` ochilishini tekshiring.
6. Tilda T123 blokka faqat yuqoridagi iframe kodni qo‘ying.
7. Publish qiling va Ctrl+F5 bilan tekshiring.
