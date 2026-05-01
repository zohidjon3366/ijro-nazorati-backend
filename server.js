import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

const demoCompanyRegistry = {
  '310153191': {
    tin: '310153191',
    name: 'OOO «HOTELS LEVEL»',
    address: '100100, Toshkent sh., Yakkasaroy tumani, Rakatboshi, 3A',
    oked: '55100',
    director: 'Kamilov Sh.Sh.',
    source: 'demo'
  },
  '312396592': {
    tin: '312396592',
    name: '«ASTORIA HOTEL» OK',
    address: 'Toshkent sh., Mirobod tumani, Baynalminal MFY, Mironshoh 1-tor ko‘chasi, 10-uy',
    oked: '55100',
    director: '',
    source: 'demo'
  }
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function pickAfterLabel(text, labels, stopLabels = []) {
  const normalized = cleanText(text);
  for (const label of labels) {
    const idx = normalized.toLowerCase().indexOf(label.toLowerCase());
    if (idx === -1) continue;

    let part = normalized.slice(idx + label.length).trim();
    for (const stop of stopLabels) {
      const stopIdx = part.toLowerCase().indexOf(stop.toLowerCase());
      if (stopIdx > -1) part = part.slice(0, stopIdx).trim();
    }
    return cleanText(part);
  }
  return '';
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IjroNazoratiBot/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Upstream HTTP ${response.status}`);
  }
  return await response.text();
}

async function lookupFromOrginfo(tin) {
  // Orginfo rasmiy API bermaydi; bu faqat ochiq HTML sahifani o'qish uchun namunaviy parser.
  // Sayt tuzilishi o'zgarsa yoki himoya/captcha qo'yilsa, bu funksiya ishlamasligi mumkin.
  const searchUrl = `https://orginfo.uz/uz/search/organizations/?q=${encodeURIComponent(tin)}`;
  const searchHtml = await fetchText(searchUrl);
  let $ = cheerio.load(searchHtml);

  let organizationHref = '';
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const rowText = cleanText($(el).parent().text());
    if (!organizationHref && href.includes('/organization/') && rowText.includes(tin)) {
      organizationHref = href;
    }
  });

  // Ba'zi hollarda qidiruv to'g'ridan-to'g'ri tashkilot sahifasiga redirect bo'lishi mumkin.
  if (!organizationHref && searchHtml.includes('/organization/')) {
    const match = searchHtml.match(/href=["']([^"']*\/organization\/[^"']+)["']/i);
    if (match) organizationHref = match[1];
  }

  if (!organizationHref) return null;

  const organizationUrl = organizationHref.startsWith('http')
    ? organizationHref
    : `https://orginfo.uz${organizationHref.startsWith('/') ? '' : '/'}${organizationHref}`;

  const pageHtml = await fetchText(organizationUrl);
  $ = cheerio.load(pageHtml);

  const h1 = cleanText($('h1').first().text());
  const bodyText = cleanText($('body').text());

  const stirMatch = bodyText.match(/STIR\s*([0-9]{9})/i);
  const okedMatch = bodyText.match(/(?:IFUT|ОКЭД|OKED)\s*([0-9]{5})/i);

  let address = pickAfterLabel(bodyText, ['Manzili', 'Tashkilot manzili'], [
    'Boshqaruv ma\'lumotlari',
    'Rahbar',
    'Soliq qo‘mitasi',
    'Soliq qo\'mitasi',
    'Ta\'sischilar',
    'Ta’sischilar'
  ]);

  let director = pickAfterLabel(bodyText, ['Rahbar'], [
    'Ta\'sischilar',
    'Ta’sischilar',
    'Eslatma',
    'Qisqartmalar'
  ]);

  return {
    tin: stirMatch ? stirMatch[1] : tin,
    name: h1,
    address,
    oked: okedMatch ? okedMatch[1] : '',
    director,
    source: 'orginfo.uz',
    sourceUrl: organizationUrl
  };
}

async function lookupFromConfiguredApi(tin) {
  // Agar sizda iHamkor API yoki Birdarcha/Adliya/Statistika rasmiy endpointi bo'lsa,
  // COMPANY_UPSTREAM_URL=https://example.uz/api/company qilib qo'ying.
  // Endpoint JSON qaytarishi kerak: { name, tin/stir/inn, address, oked, director }
  const base = process.env.COMPANY_UPSTREAM_URL || '';
  if (!base) return null;

  const separator = base.includes('?') ? '&' : '?';
  const url = `${base}${separator}tin=${encodeURIComponent(tin)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Configured upstream HTTP ${response.status}`);
  const json = await response.json();
  const src = json.data || json.company || json.result || json;

  return {
    tin: onlyDigits(src.tin || src.stir || src.inn || tin),
    name: src.name || src.companyName || src.fullName || src.full_name || '',
    address: src.address || src.legalAddress || src.legal_address || '',
    oked: src.oked || src.okved || src.activityCode || '',
    director: src.director || src.directorName || src.manager || src.rahbar || '',
    source: 'configured_api'
  };
}

app.get('/api/company-by-tin', async (req, res) => {
  try {
    const tin = onlyDigits(req.query.tin);
    const source = String(req.query.source || 'auto').toLowerCase();

    if (!tin || tin.length !== 9) {
      return res.status(400).json({ ok: false, error: 'STIR 9 ta raqam bo‘lishi kerak' });
    }

    let company = null;

    if (source === 'demo') {
      company = demoCompanyRegistry[tin] || null;
    } else if (source === 'api') {
      company = await lookupFromConfiguredApi(tin);
    } else if (source === 'orginfo') {
      company = await lookupFromOrginfo(tin);
    } else {
      company = await lookupFromConfiguredApi(tin);
      if (!company) {
        try { company = await lookupFromOrginfo(tin); } catch (err) { console.warn('Orginfo lookup failed:', err.message); }
      }
      if (!company) company = demoCompanyRegistry[tin] || null;
    }

    if (!company) {
      return res.status(404).json({ ok: false, error: 'Korxona topilmadi' });
    }

    return res.json({ ok: true, data: company });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || 'Server xatosi' });
  }
});

app.post('/api/telegram-notify', async (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN) {
      return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env sozlanmagan' });
    }

    const toChatId = String(req.body.toChatId || '').trim();
    const text = String(req.body.text || '').trim();

    if (!toChatId) return res.status(400).json({ ok: false, error: 'toChatId majburiy' });
    if (!text) return res.status(400).json({ ok: false, error: 'text majburiy' });

    const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: toChatId, text })
    });

    const json = await tgResponse.json().catch(() => null);
    if (!tgResponse.ok || !json?.ok) {
      return res.status(502).json({ ok: false, error: 'Telegram xabarni qabul qilmadi', details: json });
    }

    return res.json({ ok: true, telegram: json.result });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: err.message || 'Server xatosi' });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Ijro nazorati backend running on port ${PORT}`);
});
