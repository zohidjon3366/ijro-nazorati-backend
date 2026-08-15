'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'change-me');
const MAX_BODY = 8 * 1024 * 1024;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });
  for (const name of ['team.json', 'useful-admin-data.json']) {
    const target = path.join(DATA_DIR, name);
    const seed = path.join(ROOT, 'data', name);
    if (!fs.existsSync(target) && fs.existsSync(seed)) fs.copyFileSync(seed, target);
  }
  const leads = path.join(DATA_DIR, 'leads.json');
  if (!fs.existsSync(leads)) fs.writeFileSync(leads, '[]\n', 'utf8');
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readJsonFile(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonFile(name, value) {
  const target = path.join(DATA_DIR, name);
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, target);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_) {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function authorized(req) {
  const header = String(req.headers.authorization || '');
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function safeText(value, max = 3000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function validateTeam(payload) {
  if (!payload || !Array.isArray(payload.members)) throw new Error('INVALID_TEAM');
  return {
    updatedAt: new Date().toISOString(),
    members: payload.members.slice(0, 50).map((m, index) => ({
      id: safeText(m.id || `member-${index + 1}`, 80),
      order: Number.isFinite(Number(m.order)) ? Number(m.order) : index + 1,
      active: m.active !== false,
      image: safeText(m.image, 500),
      name: Object.fromEntries(['uz', 'ru', 'en', 'zh'].map((lang) => [lang, safeText(m.name && m.name[lang], 160)])),
      role: Object.fromEntries(['uz', 'ru', 'en', 'zh'].map((lang) => [lang, safeText(m.role && m.role[lang], 200)])),
      detail: Object.fromEntries(['uz', 'ru', 'en', 'zh'].map((lang) => [lang, safeText(m.detail && m.detail[lang], 500)]))
    }))
  };
}

async function handleApi(req, res, pathname) {
  if (pathname === '/health') return json(res, 200, { ok: true, version: 'v30' });
  if (pathname === '/api/team' && req.method === 'GET') return json(res, 200, readJsonFile('team.json', { members: [] }));
  if (pathname === '/api/useful' && req.method === 'GET') return json(res, 200, readJsonFile('useful-admin-data.json', {}));

  if (pathname === '/api/leads' && req.method === 'POST') {
    const body = await readBody(req);
    const name = safeText(body.name, 120);
    const phone = safeText(body.phone, 60);
    if (!name || !phone) return json(res, 400, { ok: false, error: 'NAME_AND_PHONE_REQUIRED' });
    const leads = readJsonFile('leads.json', []);
    leads.push({ id: crypto.randomUUID(), name, phone, message: safeText(body.message, 1000), lang: safeText(body.lang, 5), createdAt: new Date().toISOString() });
    writeJsonFile('leads.json', leads.slice(-5000));
    return json(res, 201, { ok: true });
  }

  if (pathname.startsWith('/api/admin/') && !authorized(req)) return json(res, 401, { ok: false, error: 'UNAUTHORIZED' });
  if (pathname === '/api/admin/check' && req.method === 'GET') return json(res, 200, { ok: true });

  if (pathname === '/api/admin/team' && req.method === 'PUT') {
    const normalized = validateTeam(await readBody(req));
    writeJsonFile('team.json', normalized);
    return json(res, 200, { ok: true, data: normalized });
  }

  if (pathname === '/api/admin/useful' && req.method === 'PUT') {
    const body = await readBody(req);
    for (const lang of ['uz', 'ru', 'en', 'zh']) {
      if (!body || typeof body[lang] !== 'object' || Array.isArray(body[lang])) return json(res, 400, { ok: false, error: `INVALID_${lang.toUpperCase()}_JSON` });
    }
    body.updatedAt = new Date().toISOString();
    writeJsonFile('useful-admin-data.json', body);
    return json(res, 200, { ok: true, data: body });
  }

  if (pathname === '/api/admin/upload' && req.method === 'POST') {
    const body = await readBody(req);
    const match = String(body.data || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return json(res, 400, { ok: false, error: 'INVALID_IMAGE' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 6 * 1024 * 1024) return json(res, 400, { ok: false, error: 'IMAGE_SIZE' });
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const filename = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(DATA_DIR, 'uploads', filename), bytes);
    return json(res, 201, { ok: true, url: `/uploads/${filename}` });
  }

  return false;
}

function serveFile(res, filePath, cache = true) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const type = mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': fs.statSync(filePath).size,
    'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

ensureStorage();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname === '/health' || pathname.startsWith('/api/')) {
      const result = await handleApi(req, res, pathname);
      if (result !== false) return;
      return json(res, 404, { ok: false, error: 'NOT_FOUND' });
    }

    if (pathname.startsWith('/uploads/')) {
      const name = path.basename(pathname);
      if (serveFile(res, path.join(DATA_DIR, 'uploads', name), false)) return;
    }

    let requestPath = pathname === '/' ? '/index.html' : pathname;
    if (!path.extname(requestPath)) requestPath = `${requestPath}.html`;
    const target = path.resolve(ROOT, `.${requestPath}`);
    if (!target.startsWith(ROOT + path.sep)) return json(res, 403, { ok: false, error: 'FORBIDDEN' });
    if (serveFile(res, target, !requestPath.endsWith('.html'))) return;
    serveFile(res, path.join(ROOT, '404.html'), false) || json(res, 404, { ok: false, error: 'NOT_FOUND' });
  } catch (error) {
    if (!res.headersSent) json(res, error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 500, { ok: false, error: 'SERVER_ERROR' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ALL FINANCE v30 running on port ${PORT}`);
});
