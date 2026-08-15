(() => {
  'use strict';
  const body = document.body;
  const lang = body.dataset.lang || 'uz';
  const page = body.dataset.page || 'home';
  const t = {
    uz: { loading:'Yuklanmoqda…', empty:'Maʼlumot hali kiritilmagan', error:'Maʼlumotni yuklab bo‘lmadi', sent:'Rahmat! So‘rovingiz qabul qilindi.', failed:'Xatolik yuz berdi. Qayta urinib ko‘ring.', date:'Sana', title:'Nomi', detail:'Tafsilot', value:'Qiymat', region:'Hudud', residential:'Turar joy', nonresidential:'Noturar joy' },
    ru: { loading:'Загрузка…', empty:'Информация пока не добавлена', error:'Не удалось загрузить данные', sent:'Спасибо! Ваша заявка принята.', failed:'Произошла ошибка. Попробуйте ещё раз.', date:'Дата', title:'Название', detail:'Описание', value:'Значение', region:'Регион', residential:'Жилое', nonresidential:'Нежилое' },
    en: { loading:'Loading…', empty:'No information has been added yet', error:'Could not load the data', sent:'Thank you! Your request has been received.', failed:'Something went wrong. Please try again.', date:'Date', title:'Title', detail:'Details', value:'Value', region:'Region', residential:'Residential', nonresidential:'Non-residential' },
    zh: { loading:'加载中…', empty:'暂无信息', error:'无法加载数据', sent:'谢谢！您的请求已收到。', failed:'出现错误，请重试。', date:'日期', title:'名称', detail:'详情', value:'数值', region:'地区', residential:'住宅', nonresidential:'非住宅' }
  }[lang];

  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const initials = (name) => String(name || 'AF').split(/\s+/).slice(0,2).map((w) => w[0] || '').join('').toUpperCase();

  const menuButton = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.site-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(open));
    });
  }
  document.querySelectorAll('[data-year]').forEach((node) => { node.textContent = new Date().getFullYear(); });

  async function loadTeam() {
    const targets = document.querySelectorAll('[data-team-grid]');
    if (!targets.length) return;
    try {
      const response = await fetch('/api/team', { cache: 'no-store' });
      if (!response.ok) throw new Error('team');
      const data = await response.json();
      const members = (data.members || []).filter((m) => m.active !== false).sort((a,b) => (a.order || 0) - (b.order || 0));
      const markup = members.length ? members.map((m) => {
        const name = (m.name && (m.name[lang] || m.name.uz)) || '';
        const role = (m.role && (m.role[lang] || m.role.uz)) || '';
        const detail = (m.detail && (m.detail[lang] || m.detail.uz)) || '';
        const photo = m.image ? `<img src="${escapeHtml(m.image)}" alt="${escapeHtml(name)}" loading="lazy">` : escapeHtml(initials(name));
        return `<article class="team-card"><div class="team-photo">${photo}</div><h3>${escapeHtml(name)}</h3><div class="role">${escapeHtml(role)}</div><div class="detail">${escapeHtml(detail)}</div></article>`;
      }).join('') : `<div class="empty-state">${t.empty}</div>`;
      targets.forEach((target) => { target.innerHTML = markup; });
    } catch (_) {
      targets.forEach((target) => { target.innerHTML = `<div class="empty-state">${t.error}</div>`; });
    }
  }

  const row = (cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
  function renderUseful(data) {
    const root = document.querySelector('[data-useful-container]');
    if (!root) return;
    const local = data[lang] || data.uz || {};
    const items = local[page] || [];
    if (!Array.isArray(items) || !items.length) { root.innerHTML = `<div class="empty-state">${t.empty}</div>`; return; }
    if (page === 'calendar') {
      root.innerHTML = `<div class="timeline">${items.map((item) => `<article class="timeline-item"><div class="timeline-date">${escapeHtml(item.date)}</div><div><span class="tag">${escapeHtml(item.category || '')}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail || '')}</p></div></article>`).join('')}</div>`;
    } else if (page === 'workdays') {
      root.innerHTML = `<table class="data-table"><thead><tr><th>${t.title}</th><th>5</th><th>6</th><th>${t.detail}</th></tr></thead><tbody>${items.map((item) => row([escapeHtml(item.month), escapeHtml(item.fiveDay), escapeHtml(item.sixDay), escapeHtml(item.hours || '')])).join('')}</tbody></table>`;
    } else if (page === 'rent') {
      root.innerHTML = `<table class="data-table"><thead><tr><th>${t.region}</th><th>${t.residential}</th><th>${t.nonresidential}</th></tr></thead><tbody>${items.map((item) => row([escapeHtml(item.region), escapeHtml(item.residential), escapeHtml(item.nonresidential)])).join('')}</tbody></table>`;
    } else {
      root.innerHTML = `<div class="grid grid-3">${items.map((item) => `<article class="card"><div class="card-icon">${escapeHtml(item.icon || '•')}</div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail || '')}</p>${item.url ? `<a class="card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.label || item.url)}</a>` : ''}</article>`).join('')}</div>`;
    }
    const infoRoot = document.querySelector('[data-current-info]');
    if (infoRoot && Array.isArray(local.info)) {
      infoRoot.innerHTML = local.info.map((item) => `<div class="info-tile"><small>${escapeHtml(item.title)}</small><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.note || '')}</small></div>`).join('');
    }
  }

  async function loadUseful() {
    if (!document.querySelector('[data-useful-container]')) return;
    try {
      const response = await fetch('/api/useful', { cache: 'no-store' });
      if (!response.ok) throw new Error('useful');
      renderUseful(await response.json());
    } catch (_) {
      document.querySelector('[data-useful-container]').innerHTML = `<div class="empty-state">${t.error}</div>`;
    }
  }

  document.querySelectorAll('.lead-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('.form-status');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = t.loading;
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.lang = lang;
        const response = await fetch('/api/leads', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        if (!response.ok) throw new Error('lead');
        form.reset();
        status.textContent = t.sent;
      } catch (_) { status.textContent = t.failed; }
      finally { button.disabled = false; }
    });
  });

  loadTeam();
  loadUseful();
})();
