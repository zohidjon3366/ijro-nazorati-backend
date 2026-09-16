import express from 'express';
import cors from 'cors';
import compression from 'compression';
import * as cheerio from 'cheerio';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const app = express();
app.set('etag', 'weak');
app.use(compression({ threshold: Number(process.env.COMPRESSION_THRESHOLD_BYTES || 1024) }));
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_HTML_PATH = path.join(__dirname, 'public', 'ijro-nazorati.html');
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json({ limit: '5mb' }));

// Stage 7.5 iframe mode: serve the full web app from Render so Tilda T123 only needs a tiny iframe code.
// This does not change Supabase database structure.
app.get(['/app', '/app/', '/ijro', '/ijro/'], (req, res) => {
  const seconds = Math.max(0, Number(process.env.APP_HTML_CACHE_SECONDS || 60));
  res.setHeader('Cache-Control', seconds ? `public, max-age=${seconds}, stale-while-revalidate=300` : 'no-cache');
  res.setHeader('X-Ijro-Stage', '8.4.1');
  return res.sendFile(APP_HTML_PATH);
});


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_ATTACHMENT_SIZE_MB || 25) * 1024 * 1024,
    files: 1
  }
});

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_TASK_COMMAND = (process.env.TELEGRAM_TASK_COMMAND || '#z').trim() || '#z';
const TELEGRAM_VOICE_MODE = (process.env.TELEGRAM_VOICE_MODE || 'command').toLowerCase(); // command | all
const TELEGRAM_DEFAULT_DEADLINE_HOURS = Math.max(1, Number(process.env.TELEGRAM_DEFAULT_DEADLINE_HOURS || 24));
const TELEGRAM_DEFAULT_DEADLINE_MODE = (process.env.TELEGRAM_DEFAULT_DEADLINE_MODE || 'business_hours').toLowerCase();
const TELEGRAM_WORK_START = process.env.TELEGRAM_WORK_START || '09:00';
const TELEGRAM_WORK_END = process.env.TELEGRAM_WORK_END || '18:00';
const TELEGRAM_WORK_HOURS_DEADLINE_HOURS = Math.max(1, Number(process.env.TELEGRAM_WORK_HOURS_DEADLINE_HOURS || 1));
const TELEGRAM_OFF_HOURS_DEADLINE_HOURS = Math.max(1, Number(process.env.TELEGRAM_OFF_HOURS_DEADLINE_HOURS || 8));
const TELEGRAM_TIMEZONE = process.env.TELEGRAM_TIMEZONE || 'Asia/Tashkent';
const TELEGRAM_PENDING_MINUTES = Math.max(1, Number(process.env.TELEGRAM_PENDING_MINUTES || 5));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';
const OPENAI_TRANSCRIPTION_LANGUAGE = process.env.OPENAI_TRANSCRIPTION_LANGUAGE || 'uz';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ATTACHMENTS_BUCKET = process.env.ATTACHMENTS_BUCKET || 'task-attachments';
const CONTROL_CONFIG_PATH = process.env.CONTROL_CONFIG_PATH || 'control-board/stage8_3_items.json';
const CONTROL_SETTINGS_PATH = process.env.CONTROL_SETTINGS_PATH || 'control-board/stage8_3_settings.json';
const ARCHIVE_STORAGE_PREFIX = (process.env.ARCHIVE_STORAGE_PREFIX || 'electronic-archive').replace(/^\/+|\/+$/g, '');
const ARCHIVE_SIGNED_URL_SECONDS = Math.max(60, Number(process.env.ARCHIVE_SIGNED_URL_SECONDS || 7 * 24 * 60 * 60));
const MAX_ATTACHMENT_SIZE_MB = Number(process.env.MAX_ATTACHMENT_SIZE_MB || 25);

// Stage 8.4.1 — My Soliq Monitoring Integration
const SOLIQ_MONITOR_ENABLED = envBoolEarly(process.env.SOLIQ_MONITOR_ENABLED, true);
const SOLIQ_MONITOR_SOURCE_BOT_IDS = splitEnvList(process.env.SOLIQ_MONITOR_SOURCE_BOT_IDS || '');
const SOLIQ_MONITOR_CHAT_IDS = splitEnvList(process.env.SOLIQ_MONITOR_CHAT_IDS || '');
const SOLIQ_MONITOR_ALLOW_USER_FORWARD = envBoolEarly(process.env.SOLIQ_MONITOR_ALLOW_USER_FORWARD, true);
const SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS = splitEnvList(process.env.SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS || '');
const SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES = splitEnvList(process.env.SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES || 'Zohidjon');
const SOLIQ_MONITOR_AUTO_STATUS = cleanEnvStatus(process.env.SOLIQ_MONITOR_AUTO_STATUS || 'Direktor tasdiqladi');
const SOLIQ_MONITOR_CREATE_MISSING_TASK = envBoolEarly(process.env.SOLIQ_MONITOR_CREATE_MISSING_TASK, true);
const SOLIQ_MONITOR_NOTIFY_PROBLEMS = envBoolEarly(process.env.SOLIQ_MONITOR_NOTIFY_PROBLEMS, true);
const SOLIQ_MONITOR_NOTIFY_CUSTOMER = envBoolEarly(process.env.SOLIQ_MONITOR_NOTIFY_CUSTOMER, false);
// Hotfix 2: qabul qilingan tashqi hisobot Nazorat jadvalini fakt bo'yicha tasdiqlaydi.
// sent_month = hisobot qaysi oy uchun ekanidan qat'i nazar, real jo'natilgan oy Nazorat jadvali oyi hisoblanadi.
const SOLIQ_MONITOR_CONTROL_MONTH_MODE = String(process.env.SOLIQ_MONITOR_CONTROL_MONTH_MODE || 'sent_month').trim().toLowerCase();
const SOLIQ_MONITOR_CONTROL_TIMEZONE = String(process.env.SOLIQ_MONITOR_CONTROL_TIMEZONE || TELEGRAM_TIMEZONE || 'Asia/Tashkent').trim();
const SOLIQ_MONITOR_ACCEPTED_SYNC_ANY_ASSIGNEE = envBoolEarly(process.env.SOLIQ_MONITOR_ACCEPTED_SYNC_ANY_ASSIGNEE, true);
const SOLIQ_MONITOR_IMPORT_SECRET = String(process.env.SOLIQ_MONITOR_IMPORT_SECRET || '').trim();

function splitEnvList(raw) { return String(raw || '').split(',').map(x => x.trim()).filter(Boolean); }
function envBoolEarly(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') return !!fallback;
  return ['1','true','yes','ha','on'].includes(String(value).trim().toLowerCase());
}
function cleanEnvStatus(value) {
  const v = String(value || '').trim();
  return ['Bajarildi','Direktor tasdiqladi'].includes(v) ? v : 'Direktor tasdiqladi';
}

const BOOTSTRAP_CACHE_SECONDS = Math.max(0, Number(process.env.BOOTSTRAP_CACHE_SECONDS || 20));
const BOOTSTRAP_CACHE_MAX_BYTES = Math.max(1024 * 1024, Number(process.env.BOOTSTRAP_CACHE_MAX_BYTES || 25 * 1024 * 1024));
let bootstrapCache = { time: 0, json: null, bytes: 0 };
function invalidateBootstrapCache() {
  bootstrapCache = { time: 0, json: null, bytes: 0 };
}
function bootstrapCacheAgeMs() { return Date.now() - Number(bootstrapCache.time || 0); }

// Stage 8.3.6 — successful API writes invalidate the short in-memory bootstrap cache.
app.use('/api', (req, res, next) => {
  res.on('finish', () => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method) && res.statusCode >= 200 && res.statusCode < 400) {
      invalidateBootstrapCache();
    }
  });
  next();
});

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

const demoCompanyRegistry = {
  '310153191': { tin: '310153191', name: 'OOO «HOTELS LEVEL»', source: 'demo' },
  '312396592': { tin: '312396592', name: '«ASTORIA HOTEL» OK', source: 'demo' }
};

function ensureDb() {
  if (!supabase) {
    const err = new Error('SUPABASE_URL yoki SUPABASE_SERVICE_ROLE_KEY sozlanmagan');
    err.status = 500;
    throw err;
  }
}


const DEFAULT_CONTROL_ITEMS = [
  { id: 'ctrl-1c', name: '1C', defaultDay: 15, active: true, order: 10 },
  { id: 'ctrl-xalq-banki', name: 'Xalq banki', defaultDay: 15, active: true, order: 20 },
  { id: 'ctrl-pod-nalog', name: 'Pod nalog', defaultDay: 15, active: true, order: 30 },
  { id: 'ctrl-platejka', name: 'Platejka', defaultDay: 15, active: true, order: 40 },
  { id: 'ctrl-ediniy-nalog', name: 'Ediniy nalog', defaultDay: 15, active: true, order: 50 },
  { id: 'ctrl-nds', name: 'NDS', defaultDay: 20, active: true, order: 60 },
  { id: 'ctrl-mol-mulk', name: 'Mol-mulk solig‘i', defaultDay: 10, active: true, order: 70 },
  { id: 'ctrl-yer-soligi', name: 'Yer solig‘i', defaultDay: 10, active: true, order: 80 },
  { id: 'ctrl-suv-soligi', name: 'Suv solig‘i', defaultDay: 10, active: true, order: 90 },
  { id: 'ctrl-schet-faktura', name: 'Schet faktura', defaultDay: 20, active: true, order: 100 }
];

function makeSlug(value) {
  return String(value || 'band')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || ('band-' + Date.now());
}

function normalizeControlItems(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr
    .map((item, index) => {
      const name = cleanText(item.name || item.title || '');
      if (!name) return null;
      return {
        id: cleanText(item.id || ('ctrl-' + makeSlug(name))).slice(0, 90),
        name: name.slice(0, 90),
        defaultDay: Math.min(31, Math.max(1, Number(item.defaultDay ?? item.default_day ?? item.day ?? 15) || 15)),
        active: item.active === undefined ? true : !!item.active,
        order: Number(item.order ?? index * 10) || index * 10
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
}


function normalizeControlSettings(settings) {
  const raw = settings && typeof settings === 'object' ? settings : {};
  const companyIds = Array.isArray(raw.companyIds || raw.company_ids)
    ? (raw.companyIds || raw.company_ids).map(x => cleanText(x)).filter(Boolean)
    : [];
  const nrRaw = raw.notRequiredItems || raw.not_required_items || raw.notRequired || raw.not_required || [];
  const notRequiredItems = Array.isArray(nrRaw)
    ? nrRaw.map((x) => {
        if (!x || typeof x !== 'object') return null;
        const companyId = cleanText(x.companyId || x.company_id || '');
        const itemId = cleanText(x.itemId || x.item_id || '');
        if (!companyId || !itemId) return null;
        return {
          companyId,
          itemId,
          note: cleanText(x.note || ''),
          source: cleanText(x.source || 'director'),
          updatedAt: cleanText(x.updatedAt || x.updated_at || '')
        };
      }).filter(Boolean)
    : [];
  const uniqueRules = [];
  const seen = new Set();
  for (const rule of notRequiredItems) {
    const key = `${rule.companyId}::${rule.itemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRules.push(rule);
  }
  const statusRaw = raw.companyStatuses || raw.company_statuses || raw.companyStatus || raw.company_status || {};
  const statusItems = Array.isArray(statusRaw)
    ? statusRaw
    : Object.entries(statusRaw || {}).map(([companyId, status]) => ({ companyId, status }));
  const companyStatuses = [];
  const seenStatus = new Set();
  for (const item of statusItems) {
    if (!item || typeof item !== 'object') continue;
    const companyId = cleanText(item.companyId || item.company_id || item.id || '');
    let status = cleanText(item.status || item.value || '').toLowerCase();
    if (['tugatilgan','terminated','closed','liquidated'].includes(status)) status = 'terminated';
    else if (['paused','inactive','stopped','toxtatilgan','to‘xtatilgan','vaqtincha'].includes(status)) status = 'paused';
    else status = 'active';
    if (!companyId || status === 'active' || seenStatus.has(companyId)) continue;
    seenStatus.add(companyId);
    companyStatuses.push({ companyId, status, note: cleanText(item.note || ''), updatedAt: cleanText(item.updatedAt || item.updated_at || '') });
  }
  return {
    companyIds: [...new Set(companyIds)],
    notRequiredItems: uniqueRules,
    companyStatuses,
    updatedAt: cleanText(raw.updatedAt || raw.updated_at || '')
  };
}

async function readControlSettings() {
  ensureDb();
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(CONTROL_SETTINGS_PATH);
  if (error) {
    const code = String(error.statusCode || error.status || '');
    const message = String(error.message || '').toLowerCase();
    if (code === '404' || message.includes('not found')) return normalizeControlSettings({ companyIds: [] });
    console.warn('Control settings read failed:', error.message);
    return normalizeControlSettings({ companyIds: [] });
  }
  const text = await data.text();
  const parsed = JSON.parse(text || '{}');
  return normalizeControlSettings(parsed.settings || parsed);
}

async function writeControlSettings(settings) {
  ensureDb();
  const normalized = normalizeControlSettings(settings);
  normalized.updatedAt = new Date().toISOString();
  const payload = JSON.stringify({ version: '8.4', updatedAt: normalized.updatedAt, settings: normalized }, null, 2);
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(CONTROL_SETTINGS_PATH, Buffer.from(payload, 'utf8'), {
    contentType: 'application/json; charset=utf-8',
    upsert: true
  });
  if (error) throw error;
  return normalized;
}

async function readControlItems() {
  ensureDb();
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(CONTROL_CONFIG_PATH);
  if (error) {
    const code = String(error.statusCode || error.status || '');
    const message = String(error.message || '').toLowerCase();
    if (code === '404' || message.includes('not found')) return normalizeControlItems(DEFAULT_CONTROL_ITEMS);
    console.warn('Control items config read failed:', error.message);
    return normalizeControlItems(DEFAULT_CONTROL_ITEMS);
  }
  const text = await data.text();
  const parsed = JSON.parse(text || '{}');
  return normalizeControlItems(parsed.items || parsed);
}

async function writeControlItems(items) {
  ensureDb();
  const normalized = normalizeControlItems(items);
  const payload = JSON.stringify({ version: '8.4', updatedAt: new Date().toISOString(), items: normalized }, null, 2);
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(CONTROL_CONFIG_PATH, Buffer.from(payload, 'utf8'), {
    contentType: 'application/json; charset=utf-8',
    upsert: true
  });
  if (error) throw error;
  return normalized;
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCompanyName(value) {
  let text = cleanText(value).replace(/<[^>]*>/g, ' ');
  if (!text) return '';
  const suffixRegex = new RegExp('(.{2,180}?(?:MCHJ|МЧЖ|OOO|ООО|OK|ОК|AJ|АО|XK|ХК|MAS[\\\'’]?ULIYATI CHEKLANGAN JAMIYATI|МАСЪУЛИЯТИ ЧЕКЛАНГАН ЖАМИЯТИ|HOKIMIYATI|ҲОКИМИЯТИ|DAVLAT MUASSASASI|ГУП|ДУК|СП|LLC|LTD))', 'i');
  const m = text.match(suffixRegex);
  if (m) text = m[1].trim();
  if (text.length > 180) text = text.slice(0, 180).trim();
  return text;
}

function toNameOnlyCompany(company, tin) {
  if (!company) return null;
  return {
    tin: onlyDigits(company.tin || company.stir || company.inn || tin),
    name: cleanCompanyName(company.name || company.companyName || company.fullName || company.full_name || company.title || ''),
    source: company.source || 'lookup',
    sourceUrl: company.sourceUrl || ''
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; IjroNazoratiBot/2.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);
  return await response.text();
}

async function lookupFromOrginfo(tin) {
  const searchUrl = `https://orginfo.uz/uz/search/organizations/?q=${encodeURIComponent(tin)}`;
  const searchHtml = await fetchText(searchUrl);
  let $ = cheerio.load(searchHtml);
  let organizationHref = '';

  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const rowText = cleanText($(el).parent().text());
    if (!organizationHref && href.includes('/organization/') && rowText.includes(tin)) organizationHref = href;
  });

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
  return { tin, name: cleanText($('h1').first().text()), source: 'orginfo.uz', sourceUrl: organizationUrl };
}

async function lookupFromConfiguredApi(tin) {
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
    source: 'configured_api'
  };
}

function userToClient(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.full_name,
    role: u.role,
    login: u.login,
    telegramChatId: u.telegram_chat_id || '',
    isActive: !!u.is_active,
    createdAt: u.created_at,
    updatedAt: u.updated_at
  };
}

function companyToClient(c) {
  if (!c) return null;
  return {
    id: c.id,
    tin: c.tin || '',
    name: c.name || '',
    address: c.address || '',
    oked: c.oked || '',
    director: c.director_name || '',
    isActive: !!c.is_active,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  };
}

function templateToClient(t) {
  if (!t) return null;
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    defaultDays: t.default_days,
    priority: t.priority,
    description: t.description || '',
    isActive: !!t.is_active,
    createdAt: t.created_at,
    updatedAt: t.updated_at
  };
}

function taskToClient(t, audioTaskIds = null) {
  if (!t) return null;
  const hasAudioAttachment = audioTaskIds instanceof Set
    ? audioTaskIds.has(t.id)
    : (t.hasAudioAttachment ?? t.has_audio_attachment ?? false);
  return {
    id: t.id,
    companyId: t.company_id,
    assigneeId: t.assignee_id,
    templateId: t.template_id || '',
    title: t.title,
    type: t.type,
    deadline: t.deadline || '',
    priority: t.priority,
    status: t.status,
    description: t.description || '',
    employeeNote: t.employee_note || '',
    directorNote: t.director_note || '',
    isQuick: !!t.is_quick,
    hasAudioAttachment: !!hasAudioAttachment,
    isActive: !!t.is_active,
    createdBy: t.created_by || '',
    createdAt: t.created_at,
    completedAt: t.completed_at || '',
    updatedAt: t.updated_at
  };
}

function userFromBody(body, forCreate = false) {
  const payload = {};
  if ('name' in body || 'fullName' in body || 'full_name' in body) payload.full_name = cleanText(body.name || body.fullName || body.full_name);
  if ('role' in body) payload.role = body.role === 'director' ? 'director' : 'employee';
  if ('login' in body) payload.login = cleanText(body.login).toLowerCase();
  if ('telegramChatId' in body || 'telegram_chat_id' in body) payload.telegram_chat_id = cleanText(body.telegramChatId || body.telegram_chat_id);
  if ('isActive' in body || 'is_active' in body) payload.is_active = !!(body.isActive ?? body.is_active);
  if (!forCreate) payload.updated_at = new Date().toISOString();
  return payload;
}

function companyFromBody(body, forCreate = false) {
  const payload = {};
  if ('tin' in body) payload.tin = onlyDigits(body.tin);
  if ('name' in body) payload.name = cleanText(body.name);
  if ('address' in body) payload.address = cleanText(body.address);
  if ('oked' in body) payload.oked = cleanText(body.oked);
  if ('director' in body || 'directorName' in body || 'director_name' in body) payload.director_name = cleanText(body.director || body.directorName || body.director_name);
  if ('isActive' in body || 'is_active' in body) payload.is_active = !!(body.isActive ?? body.is_active);
  if (!forCreate) payload.updated_at = new Date().toISOString();
  return payload;
}

function templateFromBody(body, forCreate = false) {
  const payload = {};
  if ('title' in body) payload.title = cleanText(body.title);
  if ('type' in body) payload.type = cleanText(body.type || 'Boshqa');
  if ('defaultDays' in body || 'default_days' in body) payload.default_days = Number(body.defaultDays ?? body.default_days ?? 0);
  if ('priority' in body) payload.priority = cleanText(body.priority || 'Oddiy');
  if ('description' in body) payload.description = cleanText(body.description);
  if ('isActive' in body || 'is_active' in body) payload.is_active = !!(body.isActive ?? body.is_active);
  if (!forCreate) payload.updated_at = new Date().toISOString();
  return payload;
}

function taskFromBody(body, forCreate = false) {
  const payload = {};
  if ('companyId' in body || 'company_id' in body) payload.company_id = body.companyId || body.company_id || null;
  if ('assigneeId' in body || 'assignee_id' in body) payload.assignee_id = body.assigneeId || body.assignee_id || null;
  if ('templateId' in body || 'template_id' in body) payload.template_id = body.templateId || body.template_id || null;
  if ('title' in body) payload.title = cleanText(body.title);
  if ('type' in body) payload.type = cleanText(body.type || 'Boshqa');
  if ('deadline' in body) payload.deadline = body.deadline || null;
  if ('priority' in body) payload.priority = cleanText(body.priority || 'Oddiy');
  if ('status' in body) payload.status = cleanText(body.status || 'Yangi');
  if ('description' in body) payload.description = cleanText(body.description);
  if ('employeeNote' in body || 'employee_note' in body) payload.employee_note = cleanText(body.employeeNote || body.employee_note);
  if ('directorNote' in body || 'director_note' in body) payload.director_note = cleanText(body.directorNote || body.director_note);
  if ('isQuick' in body || 'is_quick' in body) payload.is_quick = !!(body.isQuick ?? body.is_quick);
  if ('isActive' in body || 'is_active' in body) payload.is_active = !!(body.isActive ?? body.is_active);
  if ('createdBy' in body || 'created_by' in body) payload.created_by = body.createdBy || body.created_by || null;
  if (!forCreate) payload.updated_at = new Date().toISOString();
  return payload;
}

async function verifyPassword(inputPassword, savedHash) {
  const input = String(inputPassword || '');
  const saved = String(savedHash || '');
  if (!input || !saved) return false;
  if (saved.startsWith('$2a$') || saved.startsWith('$2b$') || saved.startsWith('$2y$')) return bcrypt.compare(input, saved);
  return input === saved;
}

async function makePasswordHash(password) {
  return bcrypt.hash(String(password || ''), 10);
}



// Stage 8.3.4 — Supabase default 1000 row limit bypass.
// Supabase select() returns 1000 rows by default; this helper loads data page-by-page
// without changing the database schema.
const SUPABASE_FETCH_PAGE_SIZE = Math.min(1000, Math.max(100, Number(process.env.SUPABASE_FETCH_PAGE_SIZE || 1000)));
const SUPABASE_FETCH_MAX_ROWS = Math.max(1000, Number(process.env.SUPABASE_FETCH_MAX_ROWS || 50000));

async function fetchAllRows(table, select = '*', options = {}) {
  ensureDb();
  const pageSize = SUPABASE_FETCH_PAGE_SIZE;
  const maxRows = SUPABASE_FETCH_MAX_ROWS;
  const rows = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    let query = supabase.from(table).select(select);
    const filters = Array.isArray(options.eq) ? options.eq : [];
    for (const [column, value] of filters) query = query.eq(column, value);
    if (options.order) query = query.order(options.order.column, { ascending: options.order.ascending !== false });
    query = query.range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    const part = data || [];
    rows.push(...part);
    if (part.length < pageSize) break;
  }
  return rows;
}

async function fetchAllRowsResult(table, select = '*', options = {}) {
  try {
    return { data: await fetchAllRows(table, select, options), error: null };
  } catch (error) {
    return { data: [], error };
  }
}

async function getBootstrapData() {
  ensureDb();
  let controlItems = normalizeControlItems(DEFAULT_CONTROL_ITEMS);
  let controlSettings = normalizeControlSettings({ companyIds: [] });
  try { controlItems = await readControlItems(); } catch (err) { console.warn('Control items fallback:', err.message); }
  try { controlSettings = await readControlSettings(); } catch (err) { console.warn('Control settings fallback:', err.message); }
  const [usersRes, companiesRes, templatesRes, tasksRes, attachmentsRes] = await Promise.all([
    fetchAllRowsResult('app_users', '*', { order: { column: 'created_at', ascending: true } }),
    fetchAllRowsResult('companies', '*', { order: { column: 'created_at', ascending: true } }),
    fetchAllRowsResult('task_templates', '*', { order: { column: 'created_at', ascending: true } }),
    fetchAllRowsResult('tasks', '*', { order: { column: 'created_at', ascending: false } }),
    fetchAllRowsResult('task_attachments', 'task_id,file_name,file_type')
  ]);
  for (const r of [usersRes, companiesRes, templatesRes, tasksRes]) if (r.error) throw r.error;
  if (attachmentsRes.error) console.warn('Audio flags load failed:', attachmentsRes.error.message);
  const audioTaskIds = new Set((attachmentsRes.data || [])
    .filter(a => String(a.file_type || '').toLowerCase().startsWith('audio/') || /\.(ogg|oga|mp3|m4a|wav|webm)$/i.test(String(a.file_name || '')))
    .map(a => a.task_id));
  return {
    users: usersRes.data.map(userToClient),
    companies: companiesRes.data.map(companyToClient),
    taskTemplates: templatesRes.data.map(templateToClient),
    tasks: tasksRes.data.map(t => taskToClient(t, audioTaskIds)),
    controlItems,
    controlSettings
  };
}


async function getBootstrapDataCached({ force = false } = {}) {
  if (!force && BOOTSTRAP_CACHE_SECONDS > 0 && bootstrapCache.json && bootstrapCacheAgeMs() <= BOOTSTRAP_CACHE_SECONDS * 1000) {
    return bootstrapCache.json;
  }
  const data = await getBootstrapData();
  try {
    const bytes = Buffer.byteLength(JSON.stringify(data));
    if (BOOTSTRAP_CACHE_SECONDS > 0 && bytes <= BOOTSTRAP_CACHE_MAX_BYTES) {
      bootstrapCache = { time: Date.now(), json: data, bytes };
    } else {
      invalidateBootstrapCache();
    }
  } catch (_) {
    invalidateBootstrapCache();
  }
  return data;
}

async function sendTelegramMessage(toChatId, text) {
  const chatId = cleanText(toChatId);
  if (!chatId || !text) return { ok: false, skipped: true };
  if (!TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true, error: 'TELEGRAM_BOT_TOKEN env sozlanmagan' };

  const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  const json = await tgResponse.json().catch(() => null);
  if (!tgResponse.ok || !json?.ok) return { ok: false, error: 'Telegram xabarni qabul qilmadi', details: json };
  return { ok: true, telegram: json.result };
}


// ================= Stage 7.9 rebuilt — Telegram group/voice to urgent task =================
// Baza strukturasini o'zgartirmaydi. Guruh->korxona va default xodim bog'lanishi Render env orqali beriladi.
const telegramPendingTasks = new Map();
function parseJsonEnv(name, fallback = {}) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (err) { console.warn(`${name} JSON parse failed:`, err.message); return fallback; }
}
function telegramCompanyMap() { return parseJsonEnv('TELEGRAM_GROUP_COMPANY_MAP', {}); }
function telegramDefaultAssigneeMap() { return parseJsonEnv('TELEGRAM_DEFAULT_ASSIGNEE_MAP', {}); }
function telegramAdminMap() { return parseJsonEnv('TELEGRAM_ADMIN_CHAT_MAP', {}); }
function normalizeTelegramCommand(value) {
  const cmd = cleanText(value || TELEGRAM_TASK_COMMAND || '#z').toLowerCase();
  return cmd.startsWith('#') || cmd.startsWith('/') ? cmd : '#' + cmd;
}
function telegramCommandVariants() {
  const c = normalizeTelegramCommand(TELEGRAM_TASK_COMMAND);
  const bare = c.replace(/^#|^\//, '');
  return [...new Set([c, '#' + bare, '/' + bare])];
}
function pendingTelegramKey(chatId, fromId) { return `${chatId || ''}|${fromId || 'anon'}`; }
function rememberTelegramPending(chatId, fromId) {
  telegramPendingTasks.set(pendingTelegramKey(chatId, fromId), Date.now() + TELEGRAM_PENDING_MINUTES * 60 * 1000);
}
function consumeTelegramPending(chatId, fromId) {
  const key = pendingTelegramKey(chatId, fromId);
  const exp = telegramPendingTasks.get(key);
  telegramPendingTasks.delete(key);
  return !!(exp && exp > Date.now());
}
function cleanupTelegramPending() {
  const now = Date.now();
  for (const [k, exp] of telegramPendingTasks.entries()) if (!exp || exp < now) telegramPendingTasks.delete(k);
}
function telegramMessageText(message) { return cleanText(message?.text || message?.caption || ''); }
function stripTelegramCommand(text) {
  let v = cleanText(text);
  const lower = v.toLowerCase();
  for (const cmd of telegramCommandVariants()) {
    if (lower === cmd) return '';
    if (lower.startsWith(cmd + ' ')) return cleanText(v.slice(cmd.length));
    if (lower.startsWith(cmd + '\n')) return cleanText(v.slice(cmd.length));
  }
  return v;
}
function isTelegramTaskCommand(text) {
  const lower = cleanText(text).toLowerCase();
  if (!lower) return false;
  return telegramCommandVariants().some(cmd => lower === cmd || lower.startsWith(cmd + ' ') || lower.startsWith(cmd + '\n'));
}
function telegramSenderName(from = {}) {
  return cleanText([from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || from.id || '');
}
function parseHm(value, fallback = '00:00') {
  const raw = String(value || fallback).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return parseHm(fallback, '00:00');
  return { h: Math.min(23, Math.max(0, Number(m[1]))), m: Math.min(59, Math.max(0, Number(m[2]))) };
}
function hmToMinutes(value) { const p = parseHm(value); return p.h * 60 + p.m; }
function isoFromTzParts(parts) { return `${parts.year}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`; }
function getTzParts(date = new Date(), timeZone = TELEGRAM_TIMEZONE) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  let hour = Number(parts.hour || 0);
  if (hour === 24) hour = 0;
  return { year:Number(parts.year), month:Number(parts.month), day:Number(parts.day), hour, minute:Number(parts.minute || 0), second:Number(parts.second || 0) };
}
function dateFromTashkentLocal(dateIso, time = '00:00') {
  const m = String(dateIso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const hm = parseHm(time || '00:00');
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hm.h - 5, hm.m, 0));
}
function isoDateFromTzDate(date = new Date(), timeZone = TELEGRAM_TIMEZONE) { return isoFromTzParts(getTzParts(date, timeZone)); }
function hhmmFromTzDate(date = new Date(), timeZone = TELEGRAM_TIMEZONE) {
  const p = getTzParts(date, timeZone);
  return String(p.hour).padStart(2,'0') + ':' + String(p.minute).padStart(2,'0');
}
function addDaysToIso(dateIso, days) {
  const base = dateFromTashkentLocal(dateIso, '12:00') || new Date();
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return isoDateFromTzDate(base, TELEGRAM_TIMEZONE);
}
function explicitDeadlineFromText(text, baseDate = new Date()) {
  const src = cleanText(text);
  const today = isoDateFromTzDate(baseDate, TELEGRAM_TIMEZONE);
  let date = '';
  let time = '';
  let explicit = false;
  let m = src.match(/(?:muddat|муддат|deadline)\s*[:\-]?\s*(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/i) || src.match(/\b(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
  if (m) { date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; if (m[4]) time = m[4]; explicit = true; }
  if (!date) {
    m = src.match(/(?:muddat|муддат|deadline)\s*[:\-]?\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}:\d{2}))?/i) || src.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
    if (m) { date = `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; if (m[4]) time = m[4]; explicit = true; }
  }
  const timeMatch = src.match(/(?:soat|соат|time|vaqt)\s*[:\-]?\s*(\d{1,2}:\d{2})/i) || src.match(/\b(\d{1,2}:\d{2})\b/);
  if (!time && timeMatch) { time = timeMatch[1]; explicit = true; }
  if (/\b(ertaga|эртага|tomorrow)\b/i.test(src)) { date = addDaysToIso(today, 1); explicit = true; }
  else if (/\b(bugun|бугун|today)\b/i.test(src)) { date = today; explicit = true; }
  if (explicit && !date && time) {
    let d = today;
    const dt = dateFromTashkentLocal(d, time);
    if (dt && dt.getTime() < baseDate.getTime()) d = addDaysToIso(d, 1);
    date = d;
  }
  return explicit ? { date, time } : null;
}
function automaticTelegramDeadline(baseDate = new Date()) {
  if (TELEGRAM_DEFAULT_DEADLINE_MODE !== 'business_hours') {
    const d = new Date(baseDate.getTime() + TELEGRAM_DEFAULT_DEADLINE_HOURS * 60 * 60 * 1000);
    return { date: isoDateFromTzDate(d, TELEGRAM_TIMEZONE), time: hhmmFromTzDate(d, TELEGRAM_TIMEZONE), explicit: false };
  }
  const parts = getTzParts(baseDate, TELEGRAM_TIMEZONE);
  const nowMinutes = parts.hour * 60 + parts.minute;
  const startMinutes = hmToMinutes(TELEGRAM_WORK_START || '09:00');
  const endMinutes = hmToMinutes(TELEGRAM_WORK_END || '18:00');
  const currentIso = isoFromTzParts(parts);
  const inWork = nowMinutes >= startMinutes && nowMinutes < endMinutes;
  if (inWork) {
    const d = new Date(baseDate.getTime() + TELEGRAM_WORK_HOURS_DEADLINE_HOURS * 60 * 60 * 1000);
    return { date: isoDateFromTzDate(d, TELEGRAM_TIMEZONE), time: hhmmFromTzDate(d, TELEGRAM_TIMEZONE), explicit: false };
  }
  const d = new Date(baseDate.getTime() + TELEGRAM_OFF_HOURS_DEADLINE_HOURS * 60 * 60 * 1000);
  const res = getTzParts(d, TELEGRAM_TIMEZONE);
  const resMinutes = res.hour * 60 + res.minute;
  if (nowMinutes >= endMinutes && resMinutes < startMinutes) {
    return { date: addDaysToIso(currentIso, 1), time: '10:00', explicit: false };
  }
  if (nowMinutes < startMinutes && resMinutes < startMinutes) {
    return { date: currentIso, time: '10:00', explicit: false };
  }
  return { date: isoFromTzParts(res), time: String(res.hour).padStart(2,'0') + ':' + String(res.minute).padStart(2,'0'), explicit: false };
}
function parseTelegramDeadline(text, baseDate = new Date()) {
  const explicit = explicitDeadlineFromText(text, baseDate);
  if (explicit) return explicit;
  return automaticTelegramDeadline(baseDate);
}
function telegramTitleFromText(text) {
  const cleaned = cleanText(text).split(/\n+/).map(cleanText).filter(Boolean)
    .filter(line => !/^(muddat|муддат|deadline|mas.?ul|мас.?ул|xodim|ходим)\s*[:\-]/i.test(line));
  let line = cleaned[0] || cleanText(text) || 'Telegramdan kelgan shoshilinch topshiriq';
  line = line.replace(/^topshiriq\s*[:\-]/i, '').replace(/^вазифа\s*[:\-]/i, '').trim();
  if (line.length > 160) line = line.slice(0, 157).trim() + '...';
  return line || 'Telegramdan kelgan shoshilinch topshiriq';
}
function formatTelegramSourceNote(message, rawText, transcript, deadlineTime) {
  const from = telegramSenderName(message.from || {});
  const chatTitle = cleanText(message.chat?.title || message.chat?.username || message.chat?.id || '');
  const lines = [];
  if (deadlineTime) lines.push(`[Soat: ${deadlineTime}]`);
  lines.push('Manba: Telegram');
  if (chatTitle) lines.push(`Guruh: ${chatTitle}`);
  if (message.chat?.id) lines.push(`Guruh ID: ${message.chat.id}`);
  if (from) lines.push(`Yuboruvchi: ${from}`);
  if (message.message_id) lines.push(`Telegram message_id: ${message.message_id}`);
  if (rawText) lines.push(`Matn: ${cleanText(rawText)}`);
  if (transcript) lines.push(`Transkript: ${cleanText(transcript)}`);
  return lines.join('\n');
}
async function getTelegramFile(fileId) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN env sozlanmagan');
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const json = await r.json().catch(() => null);
  if (!r.ok || !json?.ok || !json.result?.file_path) throw new Error('Telegram fayl yo‘lini qaytarmadi');
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${json.result.file_path}`;
  const fr = await fetch(fileUrl);
  if (!fr.ok) throw new Error(`Telegram fayl yuklab olinmadi: HTTP ${fr.status}`);
  return { buffer: Buffer.from(await fr.arrayBuffer()), filePath: json.result.file_path };
}
async function transcribeTelegramVoice(buffer, mimeType = 'audio/ogg', fileName = 'voice.ogg') {
  if (!OPENAI_API_KEY) return '';
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType || 'audio/ogg' }), fileName);
    form.append('model', OPENAI_TRANSCRIPTION_MODEL);
    if (OPENAI_TRANSCRIPTION_LANGUAGE) form.append('language', OPENAI_TRANSCRIPTION_LANGUAGE);
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: form });
    const json = await r.json().catch(() => null);
    if (!r.ok) { console.warn('Voice transcription failed:', json?.error?.message || `HTTP ${r.status}`); return ''; }
    return cleanText(json?.text || '');
  } catch (err) {
    console.warn('Voice transcription error:', err.message);
    return '';
  }
}
async function uploadBufferAsTaskAttachment(taskId, buffer, originalName, mimeType, actorId) {
  if (!buffer?.length) return null;
  const safeName = sanitizeFileName(originalName || 'telegram_voice.ogg');
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const randomPart = Math.random().toString(36).slice(2, 8);
  const storagePath = `${taskId}/${stamp}_${randomPart}_${safeName}`;
  const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, buffer, { contentType: mimeType || 'application/octet-stream', upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from('task_attachments').insert({
    task_id: taskId,
    file_name: originalName || safeName,
    file_path: storagePath,
    file_type: mimeType || 'application/octet-stream',
    file_size: buffer.length,
    uploaded_by: actorId || null
  }).select('*').single();
  if (error) throw error;
  await addTaskHistory(taskId, actorId, 'Telegram ovozli fayli ilova qilindi', null, null, originalName || safeName);
  return data;
}
async function defaultAssigneeForCompany(companyId) {
  const map = telegramDefaultAssigneeMap();
  const explicit = map[companyId] || process.env.TELEGRAM_DEFAULT_ASSIGNEE_ID || '';
  if (explicit) return explicit;
  const { data, error } = await supabase.from('app_users').select('*').eq('role', 'employee').eq('is_active', true).order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  return data?.[0]?.id || null;
}
async function defaultActorId() {
  const explicit = process.env.TELEGRAM_CREATED_BY_USER_ID || '';
  if (explicit) return explicit;
  const { data, error } = await supabase.from('app_users').select('*').eq('role', 'director').eq('is_active', true).order('created_at', { ascending: true }).limit(1);
  if (error) throw error;
  return data?.[0]?.id || null;
}
async function notifyDirectorsTelegramTask(task, message) {
  try {
    const [company, assignee, directorsRes] = await Promise.all([
      getById('companies', task.company_id),
      getById('app_users', task.assignee_id),
      supabase.from('app_users').select('*').eq('role', 'director').eq('is_active', true).not('telegram_chat_id', 'is', null)
    ]);
    if (directorsRes.error) throw directorsRes.error;
    const text = [
      '⚡ Telegram guruhdan yangi shoshilinch topshiriq',
      '',
      `Korxona: ${company?.name || '-'}`,
      `Mas’ul: ${assignee?.full_name || '-'}`,
      `Topshiriq: ${task.title || '-'}`,
      `Muddat: ${taskDeadlineTextServer(task) || '-'}`,
      `Guruh: ${message.chat?.title || message.chat?.id || '-'}`
    ].join('\n');
    await Promise.all((directorsRes.data || []).map(d => sendTelegramMessage(d.telegram_chat_id, text).catch(err => console.warn('Director telegram task notify failed:', err.message))));
  } catch (err) { console.warn('Notify directors telegram task failed:', err.message); }
}
async function createUrgentTaskFromTelegram(message) {
  ensureDb();
  const chatId = String(message.chat?.id || '');
  const companyId = telegramCompanyMap()[chatId];
  if (!companyId) {
    await sendTelegramMessage(chatId, `⚠️ Bu Telegram guruh hali korxonaga bog‘lanmagan. Render env TELEGRAM_GROUP_COMPANY_MAP ichiga ${chatId} ni korxona ID bilan bog‘lang.`).catch(()=>{});
    return { ok: false, skipped: true, reason: 'company_map_missing', chatId };
  }
  let commandBody = stripTelegramCommand(telegramMessageText(message));
  let transcript = '';
  let voiceBuffer = null;
  let voiceName = '';
  let voiceMime = 'audio/ogg';
  if (message.voice?.file_id) {
    voiceMime = message.voice.mime_type || 'audio/ogg';
    voiceName = `telegram_voice_${message.message_id || Date.now()}.ogg`;
    const file = await getTelegramFile(message.voice.file_id);
    voiceBuffer = file.buffer;
    transcript = await transcribeTelegramVoice(voiceBuffer, voiceMime, voiceName);
    if (!commandBody && transcript) commandBody = transcript;
  }
  const rawText = commandBody || transcript || telegramMessageText(message) || 'Telegramdan kelgan shoshilinch topshiriq';
  const { date, time } = parseTelegramDeadline(rawText);
  const assigneeId = await defaultAssigneeForCompany(companyId);
  const actorId = await defaultActorId();
  if (!assigneeId) {
    await sendTelegramMessage(chatId, '⚠️ Telegram topshirig‘i qabul qilindi, lekin default mas’ul xodim topilmadi. Render env TELEGRAM_DEFAULT_ASSIGNEE_ID yoki TELEGRAM_DEFAULT_ASSIGNEE_MAP sozlang.').catch(()=>{});
    return { ok: false, skipped: true, reason: 'assignee_missing' };
  }
  const directorNote = formatTelegramSourceNote(message, rawText, transcript, time);
  const payload = {
    company_id: companyId,
    assignee_id: assigneeId,
    template_id: null,
    title: telegramTitleFromText(rawText),
    type: 'Telegram',
    deadline: date || null,
    priority: 'Shoshilinch',
    status: 'Yangi',
    description: ['Manba: Telegram', transcript ? `Transkript: ${transcript}` : '', rawText ? `Matn: ${rawText}` : ''].filter(Boolean).join('\n'),
    employee_note: '',
    director_note: directorNote,
    is_quick: true,
    is_active: true,
    created_by: actorId || null,
    completed_at: null
  };
  const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
  if (error) throw error;
  await addTaskHistory(data.id, actorId, 'Telegramdan shoshilinch topshiriq yaratildi', null, data.status, rawText);
  if (voiceBuffer) await uploadBufferAsTaskAttachment(data.id, voiceBuffer, voiceName, voiceMime, actorId).catch(err => console.warn('Telegram voice attachment failed:', err.message));
  notifyTaskCreatedAsync(data);
  notifyDirectorsTelegramTask(data, message);
  await sendTelegramMessage(chatId, `✅ Telegram topshirig‘i rasmiylashtirildi\nTopshiriq: ${data.title}\nMuddat: ${taskDeadlineTextServer(data) || '-'}`).catch(()=>{});
  return { ok: true, task: taskToClient(data) };
}
async function processTelegramUpdate(update = {}) {
  cleanupTelegramPending();
  const message = update.message || update.edited_message || null;
  if (!message?.chat?.id) return { ok: true, ignored: true, reason: 'no_message' };

  // Stage 8.4.1: Soliq Monitoring xabari bo‘lsa #z oqimidan oldin qayta ishlanadi.
  const monitorResult = await maybeProcessSoliqMonitoringTelegram(message, update).catch(err => ({ handled: true, ok: false, error: err.message }));
  if (monitorResult?.handled) return { ok: monitorResult.ok !== false, soliqMonitoring: monitorResult };

  const chatId = String(message.chat.id);
  const fromId = String(message.from?.id || 'anon');
  const text = telegramMessageText(message);
  const hasCommand = isTelegramTaskCommand(text);
  if (hasCommand && !stripTelegramCommand(text) && !message.voice?.file_id) {
    rememberTelegramPending(chatId, fromId);
    await sendTelegramMessage(chatId, `#z qabul qilindi. Keyingi ${TELEGRAM_PENDING_MINUTES} daqiqa ichida matn yoki ovoz yuborsangiz, shoshilinch topshiriq sifatida rasmiylashtiriladi.`).catch(()=>{});
    return { ok: true, pending: true };
  }
  const pending = consumeTelegramPending(chatId, fromId);
  const shouldCreate = hasCommand || pending || (TELEGRAM_VOICE_MODE === 'all' && !!message.voice?.file_id);
  if (!shouldCreate) return { ok: true, ignored: true, reason: 'no_command' };
  return await createUrgentTaskFromTelegram(message);
}

app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const result = await processTelegramUpdate(req.body || {});
    return res.json({ ok: true, result });
  } catch (err) {
    console.warn('Telegram webhook failed:', err.message);
    return res.status(err.status || 500).json({ ok: false, error: err.message || 'Telegram webhook xatosi' });
  }
});

app.post('/api/telegram/set-webhook', async (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN) return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env sozlanmagan' });
    const secret = process.env.TELEGRAM_WEBHOOK_SETUP_SECRET || '';
    if (secret && req.body?.secret !== secret) return res.status(403).json({ ok: false, error: 'Webhook sozlash siri noto‘g‘ri' });
    const baseUrl = cleanText(req.body?.baseUrl || process.env.PUBLIC_BACKEND_URL || process.env.RENDER_EXTERNAL_URL || '');
    if (!baseUrl) return res.status(400).json({ ok: false, error: 'PUBLIC_BACKEND_URL env yoki body.baseUrl kerak' });
    const webhookUrl = baseUrl.replace(/\/$/, '') + '/api/telegram/webhook';
    const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message'] })
    });
    const json = await tgResponse.json().catch(() => null);
    if (!tgResponse.ok || !json?.ok) return res.status(502).json({ ok: false, error: 'Telegram webhook o‘rnatilmadi', details: json });
    return res.json({ ok: true, webhookUrl, telegram: json });
  } catch (err) { return handleError(res, err); }
});

app.get('/api/telegram/webhook-info', async (req, res) => {
  try {
    if (!TELEGRAM_BOT_TOKEN) return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN env sozlanmagan' });
    const tgResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`);
    const json = await tgResponse.json().catch(() => null);
    return res.status(tgResponse.ok ? 200 : 502).json({ ok: !!json?.ok, telegram: json });
  } catch (err) { return handleError(res, err); }
});

async function getById(table, id) {
  ensureDb();
  const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

async function notifyTaskCreated(task) {
  try {
    const [company, assignee] = await Promise.all([
      getById('companies', task.company_id),
      getById('app_users', task.assignee_id)
    ]);
    if (!assignee?.telegram_chat_id) return;
    const text = [
      task.is_quick ? '⚡ Sizga tezkor topshiriq biriktirildi' : '📌 Sizga yangi topshiriq biriktirildi',
      '',
      `Korxona: ${company?.name || '-'}`,
      `Topshiriq: ${task.title}`,
      `Muddat: ${task.deadline || '-'}`,
      `Muhimlik: ${task.priority || '-'}`,
      task.description ? `Izoh: ${task.description}` : ''
    ].filter(Boolean).join('\n');
    await sendTelegramMessage(assignee.telegram_chat_id, text);
  } catch (err) {
    console.warn('Task created telegram failed:', err.message);
  }
}

function notifyTaskCreatedAsync(task) {
  setTimeout(() => notifyTaskCreated(task).catch(err => console.warn('Task created telegram async failed:', err.message)), 0);
}

async function notifyDirectorsTaskStatusChanged(task, oldStatus) {
  try {
    const [company, assignee, directorsRes] = await Promise.all([
      getById('companies', task.company_id),
      getById('app_users', task.assignee_id),
      supabase.from('app_users').select('*').eq('role', 'director').eq('is_active', true).not('telegram_chat_id', 'is', null)
    ]);
    if (directorsRes.error) throw directorsRes.error;
    const text = [
      '✅ Topshiriq holati o‘zgardi',
      '',
      `Xodim: ${assignee?.full_name || '-'}`,
      `Korxona: ${company?.name || '-'}`,
      `Topshiriq: ${task.title}`,
      oldStatus ? `Oldingi holat: ${oldStatus}` : '',
      `Yangi holat: ${task.status}`,
      task.employee_note ? `Xodim izohi: ${task.employee_note}` : ''
    ].filter(Boolean).join('\n');
    await Promise.all((directorsRes.data || []).map(d => sendTelegramMessage(d.telegram_chat_id, text)));
  } catch (err) {
    console.warn('Task status telegram failed:', err.message);
  }
}

async function notifyAssigneeTaskFailed(task, oldStatus = '') {
  try {
    if (process.env.EMPLOYEE_FAILED_NOTIFY_ENABLED === 'false') return;
    if (!task || task.status !== 'Bajarilmadi') return;
    const [company, assignee] = await Promise.all([
      getById('companies', task.company_id).catch(() => null),
      getById('app_users', task.assignee_id).catch(() => null)
    ]);
    if (!assignee?.telegram_chat_id) return;
    const text = [
      '⚠️ Topshiriq bajarilmagan deb belgilandi',
      '',
      `Korxona: ${company?.name || '-'}`,
      `Topshiriq: ${task.title || '-'}`,
      oldStatus ? `Oldingi holat: ${oldStatus}` : '',
      `Yangi holat: ${task.status}`,
      `Muddat: ${taskDeadlineTextServer(task) || '-'}`,
      task.director_note ? `Direktor izohi: ${task.director_note}` : '',
      task.employee_note ? `Xodim izohi: ${task.employee_note}` : ''
    ].filter(Boolean).join('\n');
    await sendTelegramMessage(assignee.telegram_chat_id, text);
  } catch (err) {
    console.warn('Employee failed task telegram failed:', err.message);
  }
}

async function addTaskHistory(taskId, userId, action, oldStatus, newStatus, note) {
  try {
    await supabase.from('task_history').insert({
      task_id: taskId,
      user_id: userId || null,
      action,
      old_status: oldStatus || null,
      new_status: newStatus || null,
      note: note || null
    });
  } catch (err) {
    console.warn('Task history failed:', err.message);
  }
}


function isTaskDoneServer(status) {
  return status === 'Bajarildi' || status === 'Direktor tasdiqladi';
}

function todayIsoServer() {
  return isoDateFromTzDate(new Date(), process.env.REMINDER_TIMEZONE || TELEGRAM_TIMEZONE || 'Asia/Tashkent');
}

function isTaskOverdueServer(task) {
  return !!(task.deadline && task.deadline < todayIsoServer() && !isTaskDoneServer(task.status) && task.status !== 'Bekor qilindi');
}

function csvCell(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return '"' + text.replace(/"/g, '""') + '"';
}

function toCsv(rows) {
  return '\ufeff' + rows.map(row => row.map(csvCell).join(';')).join('\n');
}

function sanitizeFileName(name) {
  const original = cleanText(name || 'file');
  const safe = original
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180);
  return safe || 'file';
}

function extFromName(name) {
  const safe = sanitizeFileName(name);
  const idx = safe.lastIndexOf('.');
  return idx >= 0 ? safe.slice(idx).toLowerCase() : '';
}

function attachmentToClient(a, signedUrl = '') {
  if (!a) return null;
  return {
    id: a.id,
    taskId: a.task_id,
    fileName: a.file_name || '',
    filePath: a.file_path || '',
    fileType: a.file_type || '',
    fileSize: a.file_size || 0,
    uploadedBy: a.uploaded_by || '',
    createdAt: a.created_at,
    url: signedUrl || ''
  };
}

async function createSignedAttachmentUrl(filePath) {
  if (!filePath) return '';
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePath, 60 * 60);
  if (error) {
    console.warn('Signed URL failed:', error.message);
    return '';
  }
  return data?.signedUrl || '';
}

async function ensureTaskExists(taskId) {
  const task = await getById('tasks', taskId);
  if (!task) {
    const err = new Error('Topshiriq topilmadi');
    err.status = 404;
    throw err;
  }
  return task;
}

function handleError(res, err) {
  console.error(err);
  const status = err.status || err.code === '23505' ? 409 : 500;
  return res.status(status).json({ ok: false, error: err.message || 'Server xatosi', details: err.details || null });
}

app.get('/health', (_, res) => res.json({ ok: true, supabase: !!supabase, time: new Date().toISOString() }));

app.get('/api/performance', async (req, res) => {
  try {
    const force = String(req.query.fresh || '').toLowerCase() === '1';
    const started = Date.now();
    const data = await getBootstrapDataCached({ force });
    const ms = Date.now() - started;
    return res.json({
      ok: true,
      stage: '8.4.2',
      ms,
      cache: {
        enabled: BOOTSTRAP_CACHE_SECONDS > 0,
        seconds: BOOTSTRAP_CACHE_SECONDS,
        ageMs: bootstrapCache.time ? bootstrapCacheAgeMs() : null,
        bytes: bootstrapCache.bytes || null
      },
      counts: {
        users: data.users?.length || 0,
        companies: data.companies?.length || 0,
        taskTemplates: data.taskTemplates?.length || 0,
        tasks: data.tasks?.length || 0,
        controlItems: data.controlItems?.length || 0
      }
    });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/warmup', async (_, res) => {
  try {
    ensureDb();
    await supabase.from('app_users').select('id', { count: 'exact', head: true }).limit(1);
    return res.json({ ok: true, db: true, time: new Date().toISOString() });
  } catch (err) {
    return res.json({ ok: false, db: false, error: err.message, time: new Date().toISOString() });
  }
});

app.get('/api/company-by-tin', async (req, res) => {
  try {
    const tin = onlyDigits(req.query.tin);
    const source = String(req.query.source || 'auto').toLowerCase();
    if (!tin || tin.length !== 9) return res.status(400).json({ ok: false, error: 'STIR 9 ta raqam bo‘lishi kerak' });

    let company = null;
    if (source === 'demo') company = demoCompanyRegistry[tin] || null;
    else if (source === 'api') company = await lookupFromConfiguredApi(tin);
    else if (source === 'orginfo') company = await lookupFromOrginfo(tin);
    else {
      company = await lookupFromConfiguredApi(tin);
      if (!company) {
        try { company = await lookupFromOrginfo(tin); } catch (err) { console.warn('Orginfo lookup failed:', err.message); }
      }
      if (!company) company = demoCompanyRegistry[tin] || null;
    }
    company = toNameOnlyCompany(company, tin);
    if (!company?.name) return res.status(404).json({ ok: false, error: 'Korxona nomi topilmadi' });
    return res.json({ ok: true, data: company });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/telegram-notify', async (req, res) => {
  try {
    const result = await sendTelegramMessage(req.body.toChatId, req.body.text);
    if (!result.ok) return res.status(result.skipped ? 400 : 502).json(result);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    ensureDb();
    const login = cleanText(req.body.login).toLowerCase();
    const password = String(req.body.password || '');
    const { data: user, error } = await supabase.from('app_users').select('*').eq('login', login).maybeSingle();
    if (error) throw error;
    if (!user) return res.status(401).json({ ok: false, error: 'Login yoki parol noto‘g‘ri' });
    if (!user.is_active) return res.status(403).json({ ok: false, error: 'Foydalanuvchi vaqtincha to‘xtatilgan' });
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ ok: false, error: 'Login yoki parol noto‘g‘ri' });

    // Tezkor login: HTML avval foydalanuvchini kiritadi, ma’lumotlarni keyin alohida yuklaydi.
    // Eski HTML bilan moslik uchun bootstrap=false bo‘lmasa, eski usul saqlanadi.
    if (String(req.query.bootstrap || '').toLowerCase() === 'false') {
      return res.json({ ok: true, user: userToClient(user) });
    }

    const data = await getBootstrapDataCached({ force: String(req.query.fresh || '').toLowerCase() === '1' });
    return res.json({ ok: true, user: userToClient(user), data });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/bootstrap', async (req, res) => {
  try {
    const force = String(req.query.fresh || req.query.force || '').toLowerCase() === '1';
    const data = await getBootstrapDataCached({ force });
    res.setHeader('X-Bootstrap-Cache-Seconds', String(BOOTSTRAP_CACHE_SECONDS));
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(res, err);
  }
});


// ================= Stage 8.4 — Elektron HTML arxiv =================
function archiveSafeFileStamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function archiveDateText(value) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' });
  } catch (_) {}
  return String(value || '');
}

function archiveCell(value) {
  if (value === null || value === undefined || value === '') return '<span class="muted">—</span>';
  if (typeof value === 'boolean') return value ? 'Ha' : 'Yo‘q';
  if (typeof value === 'object') return `<pre>${htmlEscape(JSON.stringify(value, null, 2))}</pre>`;
  return htmlEscape(value);
}

function archiveTable(title, rows, columns, emptyText = 'Ma’lumot yo‘q') {
  const safeRows = Array.isArray(rows) ? rows : [];
  const head = columns.map(c => `<th>${htmlEscape(c.label)}</th>`).join('');
  const body = safeRows.map(row => `<tr>${columns.map(c => `<td>${archiveCell(typeof c.value === 'function' ? c.value(row) : row[c.key])}</td>`).join('')}</tr>`).join('');
  return `<section class="section"><h2>${htmlEscape(title)} <span>${safeRows.length} ta</span></h2>${safeRows.length ? `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` : `<div class="empty">${htmlEscape(emptyText)}</div>`}</section>`;
}

function stripPasswordFields(user) {
  const clone = { ...(user || {}) };
  delete clone.password_hash;
  delete clone.password;
  return clone;
}

async function getArchiveDataset() {
  ensureDb();
  let controlItems = [];
  let controlSettings = {};
  try { controlItems = await readControlItems(); } catch (err) { controlItems = []; }
  try { controlSettings = await readControlSettings(); } catch (err) { controlSettings = {}; }

  const tableDefs = [
    ['app_users', '*', { order: { column: 'created_at', ascending: true } }],
    ['companies', '*', { order: { column: 'created_at', ascending: true } }],
    ['task_templates', '*', { order: { column: 'created_at', ascending: true } }],
    ['tasks', '*', { order: { column: 'created_at', ascending: false } }],
    ['task_history', '*', { order: { column: 'created_at', ascending: false } }],
    ['task_attachments', '*', { order: { column: 'created_at', ascending: false } }],
    ['archive_snapshots', '*', { order: { column: 'created_at', ascending: false } }],
    ['monitoring_imports', '*', { order: { column: 'created_at', ascending: false } }],
    ['monitoring_report_mappings', '*', { order: { column: 'priority', ascending: true } }],
    ['monitoring_tax_mappings', '*', { order: { column: 'priority', ascending: true } }]
  ];
  const results = {};
  const warnings = [];
  for (const [table, select, options] of tableDefs) {
    const r = await fetchAllRowsResult(table, select, options);
    if (r.error) {
      warnings.push(`${table}: ${r.error.message || r.error.details || 'o‘qib bo‘lmadi'}`);
      results[table] = [];
    } else {
      results[table] = r.data || [];
    }
  }
  results.app_users = (results.app_users || []).map(stripPasswordFields);
  return {
    generatedAt: new Date().toISOString(),
    stage: '8.4.2',
    tables: results,
    controlItems,
    controlSettings,
    warnings
  };
}

function buildArchiveHtml(dataset, meta = {}) {
  const t = dataset.tables || {};
  const usersById = new Map((t.app_users || []).map(x => [x.id, x]));
  const companiesById = new Map((t.companies || []).map(x => [x.id, x]));
  const summary = {
    companies: (t.companies || []).length,
    users: (t.app_users || []).length,
    templates: (t.task_templates || []).length,
    tasks: (t.tasks || []).length,
    activeTasks: (t.tasks || []).filter(x => x.is_active !== false).length,
    doneTasks: (t.tasks || []).filter(x => ['Bajarildi', 'Direktor tasdiqladi'].includes(x.status)).length,
    history: (t.task_history || []).length,
    attachments: (t.task_attachments || []).length,
    controlItems: (dataset.controlItems || []).length,
    monitoringImports: (t.monitoring_imports || []).length
  };
  const cards = Object.entries({
    'Korxonalar': summary.companies,
    'Xodimlar': summary.users,
    'Topshiriqlar': summary.tasks,
    'Faol topshiriqlar': summary.activeTasks,
    'Bajarilgan/tasdiqlangan': summary.doneTasks,
    'Tarix yozuvlari': summary.history,
    'Ilovalar': summary.attachments,
    'Nazorat bandlari': summary.controlItems,
    'Soliq Monitoring importlari': summary.monitoringImports
  }).map(([label, value]) => `<div class="card"><span>${htmlEscape(label)}</span><b>${value}</b></div>`).join('');

  const warnings = (dataset.warnings || []).length ? `<div class="warning"><b>Ogohlantirish:</b><br>${(dataset.warnings || []).map(htmlEscape).join('<br>')}</div>` : '';

  const html = `<!doctype html><html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ijro Nazorati elektron arxivi — ${htmlEscape(meta.fileStamp || '')}</title><style>
  body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f3f6fb;color:#111827}.hero{background:linear-gradient(135deg,#263096,#111827);color:#fff;padding:26px 30px}.hero h1{margin:0;font-size:26px}.hero p{margin:8px 0 0;color:rgba(255,255,255,.75)}.wrap{padding:24px;max-width:1480px;margin:0 auto}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0 0 20px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:14px;box-shadow:0 8px 24px rgba(15,23,42,.06)}.card span{font-size:12px;color:#64748b}.card b{display:block;font-size:26px;margin-top:6px}.section{background:#fff;border:1px solid #e5e7eb;border-radius:18px;margin:18px 0;padding:18px;box-shadow:0 8px 24px rgba(15,23,42,.05)}h2{margin:0 0 12px;font-size:19px}h2 span{font-size:12px;color:#64748b;font-weight:400}.table-wrap{overflow:auto;border:1px solid #e5e7eb;border-radius:12px}table{border-collapse:collapse;width:100%;min-width:900px}th,td{border-bottom:1px solid #e5e7eb;padding:9px 10px;font-size:12px;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#eef2ff;color:#111827;z-index:1}tr:nth-child(even) td{background:#fafafa}.muted{color:#94a3b8}pre{margin:0;white-space:pre-wrap;font-size:11px}.warning{background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12;padding:13px 15px;border-radius:14px;margin:0 0 18px}.footer{font-size:12px;color:#64748b;margin:24px 0}.empty{border:1px dashed #cbd5e1;border-radius:12px;padding:16px;color:#64748b;text-align:center}@media print{body{background:#fff}.section,.card{box-shadow:none}.hero{background:#111827!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="hero"><h1>Korxonalar bo‘yicha topshiriqlar va ijro nazorati tizimi — elektron arxiv</h1><p>Yaratilgan vaqt: ${htmlEscape(archiveDateText(dataset.generatedAt))} · Stage ${htmlEscape(dataset.stage || '8.4')}</p></div><div class="wrap">${warnings}<div class="grid">${cards}</div>
  ${archiveTable('Korxonalar', t.companies || [], [
    {label:'ID', key:'id'}, {label:'STIR', key:'tin'}, {label:'Nomi', key:'name'}, {label:'Manzil', key:'address'}, {label:'OKED', key:'oked'}, {label:'Rahbar', key:'director_name'}, {label:'Faol', key:'is_active'}, {label:'Yaratilgan', value:r=>archiveDateText(r.created_at)}
  ])}
  ${archiveTable('Xodimlar va foydalanuvchilar', t.app_users || [], [
    {label:'ID', key:'id'}, {label:'F.I.Sh.', key:'full_name'}, {label:'Rol', key:'role'}, {label:'Login', key:'login'}, {label:'Telegram chat ID', key:'telegram_chat_id'}, {label:'Faol', key:'is_active'}, {label:'Yaratilgan', value:r=>archiveDateText(r.created_at)}
  ])}
  ${archiveTable('Spravochnik / topshiriq shablonlari', t.task_templates || [], [
    {label:'ID', key:'id'}, {label:'Nomi', key:'title'}, {label:'Turi', key:'type'}, {label:'Default kun', key:'default_days'}, {label:'Muhimlik', key:'priority'}, {label:'Faol', key:'is_active'}, {label:'Izoh', key:'description'}
  ])}
  ${archiveTable('Topshiriqlar', t.tasks || [], [
    {label:'ID', key:'id'}, {label:'Korxona', value:r=>companiesById.get(r.company_id)?.name || r.company_id || ''}, {label:'Mas’ul', value:r=>usersById.get(r.assignee_id)?.full_name || r.assignee_id || ''}, {label:'Topshiriq', key:'title'}, {label:'Turi', key:'type'}, {label:'Muddat', key:'deadline'}, {label:'Status', key:'status'}, {label:'Muhimlik', key:'priority'}, {label:'Xodim izohi', key:'employee_note'}, {label:'Direktor izohi', key:'director_note'}, {label:'Yaratilgan', value:r=>archiveDateText(r.created_at)}, {label:'Bajarilgan', value:r=>archiveDateText(r.completed_at)}
  ])}
  ${archiveTable('Topshiriqlar tarixi', t.task_history || [], [
    {label:'ID', key:'id'}, {label:'Topshiriq ID', key:'task_id'}, {label:'Foydalanuvchi', value:r=>usersById.get(r.user_id)?.full_name || r.user_id || ''}, {label:'Amal', key:'action'}, {label:'Oldingi status', key:'old_status'}, {label:'Yangi status', key:'new_status'}, {label:'Izoh', key:'note'}, {label:'Vaqt', value:r=>archiveDateText(r.created_at)}
  ])}
  ${archiveTable('Ilovalar', t.task_attachments || [], [
    {label:'ID', key:'id'}, {label:'Topshiriq ID', key:'task_id'}, {label:'Fayl nomi', key:'file_name'}, {label:'Fayl turi', key:'file_type'}, {label:'Hajm', key:'file_size'}, {label:'Storage path', key:'file_path'}, {label:'Yuklangan', value:r=>archiveDateText(r.created_at)}
  ])}
  ${archiveTable('Nazorat jadvali bandlari', dataset.controlItems || [], [
    {label:'ID', key:'id'}, {label:'Band', key:'name'}, {label:'Default kun', key:'defaultDay'}, {label:'Faol', key:'active'}, {label:'Tartib', key:'order'}
  ])}
  ${archiveTable('Oldingi arxiv yozuvlari', t.archive_snapshots || [], [
    {label:'ID', key:'id'}, {label:'Fayl', key:'file_name'}, {label:'Storage path', key:'storage_path'}, {label:'Stage', key:'stage'}, {label:'Jadvallar soni', key:'table_count'}, {label:'Yozuvlar soni', key:'row_count'}, {label:'Yaratilgan', value:r=>archiveDateText(r.created_at)}
  ])}
  ${archiveTable('My Soliq Monitoring import jurnali', t.monitoring_imports || [], [
    {label:'ID', key:'id'}, {label:'STIR', key:'company_tin'}, {label:'Hisobot', key:'report_name_raw'}, {label:'Davr', key:'report_period'}, {label:'Tashqi holat', key:'external_status'}, {label:'Natija', key:'status_group'}, {label:'Korxona ID', key:'matched_company_id'}, {label:'Band', key:'matched_control_item_name'}, {label:'Topshiriq ID', key:'matched_task_id'}, {label:'Avto amal', key:'auto_action'}, {label:'Xato/izoh', key:'error_message'}, {label:'Import vaqti', value:r=>archiveDateText(r.created_at)}
  ])}
  ${archiveTable('Soliq Monitoring mappinglari', t.monitoring_report_mappings || [], [
    {label:'ID', key:'id'}, {label:'Hisobot pattern', key:'report_pattern'}, {label:'Match', key:'match_mode'}, {label:'Nazorat bandi ID', key:'control_item_id'}, {label:'Nazorat bandi', key:'control_item_name'}, {label:'Faol', key:'is_active'}, {label:'Ustuvorlik', key:'priority'}
  ])}
  ${archiveTable('Soliq to‘lov kodlari mappinglari', t.monitoring_tax_mappings || [], [
    {label:'ID', key:'id'}, {label:'Soliq kodi', key:'tax_code'}, {label:'Soliq nomi', key:'tax_name'}, {label:'Nazorat bandi ID', key:'control_item_id'}, {label:'Nazorat bandi', key:'control_item_name'}, {label:'Guruh', key:'group_key'}, {label:'Majburiy kodlar', value:r=>(r.required_codes||[]).join(', ')}, {label:'Faol', key:'is_active'}, {label:'Ustuvorlik', key:'priority'}
  ])}
  <section class="section"><h2>Nazorat jadvali sozlamalari JSON</h2><pre>${htmlEscape(JSON.stringify(dataset.controlSettings || {}, null, 2))}</pre></section><div class="footer">Ushbu HTML arxiv mustaqil ochiladi. Parol hash maydoni xavfsizlik uchun arxivga kiritilmadi.</div></div></body></html>`;
  return html;
}

async function tryInsertArchiveSnapshot(row) {
  try {
    const { error } = await supabase.from('archive_snapshots').insert(row);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

app.get('/api/archive/html', async (req, res) => {
  try {
    const dataset = await getArchiveDataset();
    const stamp = archiveSafeFileStamp();
    const html = buildArchiveHtml(dataset, { fileStamp: stamp });
    const download = String(req.query.download || '').toLowerCase() === '1';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (download) res.setHeader('Content-Disposition', `attachment; filename="ijro_nazorati_elektron_arxiv_${stamp}.html"`);
    return res.send(html);
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/archive/save-html', async (req, res) => {
  try {
    ensureDb();
    const dataset = await getArchiveDataset();
    const stamp = archiveSafeFileStamp();
    const fileName = `ijro_nazorati_elektron_arxiv_${stamp}.html`;
    const html = buildArchiveHtml(dataset, { fileStamp: stamp });
    const storagePath = `${ARCHIVE_STORAGE_PREFIX}/${fileName}`;
    const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, Buffer.from(html, 'utf8'), {
      contentType: 'text/html; charset=utf-8',
      upsert: false
    });
    if (error) throw error;
    let signedUrl = '';
    try {
      const signed = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(storagePath, ARCHIVE_SIGNED_URL_SECONDS);
      signedUrl = signed.data?.signedUrl || '';
    } catch (err) {
      console.warn('Archive signed URL failed:', err.message);
    }
    const rowCount = Object.values(dataset.tables || {}).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
    const snapshot = await tryInsertArchiveSnapshot({
      file_name: fileName,
      storage_path: storagePath,
      stage: '8.4.2',
      table_count: Object.keys(dataset.tables || {}).length,
      row_count: rowCount,
      created_by: req.body?.actorId || req.body?.actor_id || null,
      metadata: { summary: { generatedAt: dataset.generatedAt }, warnings: dataset.warnings || [] }
    });
    return res.json({ ok: true, fileName, storagePath, signedUrl, rowCount, snapshot });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/archive/list', async (req, res) => {
  try {
    ensureDb();
    const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).list(ARCHIVE_STORAGE_PREFIX, {
      limit: Math.min(1000, Math.max(1, Number(req.query.limit || 100))),
      sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) throw error;
    return res.json({ ok: true, prefix: ARCHIVE_STORAGE_PREFIX, data: data || [] });
  } catch (err) {
    return handleError(res, err);
  }
});


app.get('/api/control-items', async (req, res) => {
  try {
    const items = await readControlItems();
    return res.json({ ok: true, data: items });
  } catch (err) {
    return handleError(res, err);
  }
});

app.put('/api/control-items', async (req, res) => {
  try {
    const items = await writeControlItems(req.body?.items || []);
    return res.json({ ok: true, data: items });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/control-settings', async (req, res) => {
  try {
    const settings = await readControlSettings();
    return res.json({ ok: true, data: settings });
  } catch (err) {
    return handleError(res, err);
  }
});

app.put('/api/control-settings', async (req, res) => {
  try {
    const settings = await writeControlSettings(req.body?.settings || req.body || {});
    return res.json({ ok: true, data: settings });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/users', async (req, res) => {
  try {
    ensureDb();
    const payload = userFromBody(req.body, true);
    if (!payload.full_name) return res.status(400).json({ ok: false, error: 'F.I.Sh. majburiy' });
    if (!payload.login) return res.status(400).json({ ok: false, error: 'Login majburiy' });
    if (!req.body.password) return res.status(400).json({ ok: false, error: 'Parol majburiy' });
    payload.password_hash = await makePasswordHash(req.body.password);
    const { data, error } = await supabase.from('app_users').insert(payload).select('*').single();
    if (error) throw error;
    return res.json({ ok: true, data: userToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    ensureDb();
    const payload = userFromBody(req.body, false);
    if (req.body.password) payload.password_hash = await makePasswordHash(req.body.password);
    const { data, error } = await supabase.from('app_users').update(payload).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    return res.json({ ok: true, data: userToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    ensureDb();
    const { count, error: countError } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', req.params.id);
    if (countError) throw countError;
    if (count > 0) return res.status(409).json({ ok: false, error: 'Bu xodimga topshiriqlar biriktirilgan. O‘chirish mumkin emas, vaqtincha to‘xtating.' });
    const { error } = await supabase.from('app_users').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/companies', async (req, res) => {
  try {
    ensureDb();
    const payload = companyFromBody(req.body, true);
    if (!payload.tin || payload.tin.length !== 9) return res.status(400).json({ ok: false, error: 'STIR 9 ta raqam bo‘lishi kerak' });
    if (!payload.name) return res.status(400).json({ ok: false, error: 'Korxona nomi majburiy' });
    const { data, error } = await supabase.from('companies').insert(payload).select('*').single();
    if (error) throw error;
    return res.json({ ok: true, data: companyToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.put('/api/companies/:id', async (req, res) => {
  try {
    ensureDb();
    const payload = companyFromBody(req.body, false);
    const { data, error } = await supabase.from('companies').update(payload).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    if (payload.is_active === false) await supabase.from('tasks').update({ is_active: false, updated_at: new Date().toISOString() }).eq('company_id', req.params.id);
    return res.json({ ok: true, data: companyToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.delete('/api/companies/:id', async (req, res) => {
  try {
    ensureDb();
    const { count, error: countError } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('company_id', req.params.id);
    if (countError) throw countError;
    if (count > 0) return res.status(409).json({ ok: false, error: 'Korxonada topshiriqlar bor. O‘chirish mumkin emas, vaqtincha to‘xtating.' });
    const { error } = await supabase.from('companies').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/task-templates', async (req, res) => {
  try {
    ensureDb();
    const payload = templateFromBody(req.body, true);
    if (!payload.title) return res.status(400).json({ ok: false, error: 'Topshiriq nomi majburiy' });
    const { data, error } = await supabase.from('task_templates').insert(payload).select('*').single();
    if (error) throw error;
    return res.json({ ok: true, data: templateToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.put('/api/task-templates/:id', async (req, res) => {
  try {
    ensureDb();
    const payload = templateFromBody(req.body, false);
    const { data, error } = await supabase.from('task_templates').update(payload).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    return res.json({ ok: true, data: templateToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.delete('/api/task-templates/:id', async (req, res) => {
  try {
    ensureDb();
    const { error } = await supabase.from('task_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    ensureDb();
    const payload = taskFromBody(req.body, true);
    if (!payload.company_id) return res.status(400).json({ ok: false, error: 'Korxona tanlang' });
    const notRequiredControl = /\[TopshirishZarurEmas\]|Topshirish zarur emas/i.test(String([
      payload.director_note,
      payload.employee_note,
      payload.description,
      payload.title
    ].filter(Boolean).join('\n')));
    if (!payload.assignee_id && !notRequiredControl) return res.status(400).json({ ok: false, error: 'Xodim tanlang' });
    if (!payload.title) return res.status(400).json({ ok: false, error: 'Topshiriq nomi majburiy' });
    if (payload.status === 'Bajarildi') payload.completed_at = new Date().toISOString();
    const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
    if (error) throw error;
    await addTaskHistory(data.id, payload.created_by, payload.is_quick ? 'Tezkor topshiriq yaratildi' : 'Topshiriq yaratildi', null, data.status, data.description);
    if (data.assignee_id) notifyTaskCreatedAsync(data);
    return res.json({ ok: true, data: taskToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});


app.post('/api/tasks/bulk', async (req, res) => {
  try {
    ensureDb();
    const rawIds = Array.isArray(req.body.companyIds) ? req.body.companyIds : (Array.isArray(req.body.company_ids) ? req.body.company_ids : []);
    const companyIds = [...new Set(rawIds.map(id => cleanText(id)).filter(Boolean))];
    if (!companyIds.length) return res.status(400).json({ ok: false, error: 'Kamida bitta korxona tanlang' });
    if (companyIds.length > 500) return res.status(400).json({ ok: false, error: 'Bir martada 500 tagacha korxonaga topshiriq berish mumkin' });
    const base = taskFromBody(req.body, true);
    if (!base.assignee_id) return res.status(400).json({ ok: false, error: 'Xodim tanlang' });
    if (!base.title) return res.status(400).json({ ok: false, error: 'Topshiriq nomi majburiy' });
    delete base.company_id;
    const now = new Date().toISOString();
    const rows = companyIds.map(companyId => ({
      ...base,
      company_id: companyId,
      completed_at: base.status === 'Bajarildi' ? now : null
    }));
    const { data, error } = await supabase.from('tasks').insert(rows).select('*');
    if (error) throw error;
    const historyRows = (data || []).map(task => ({
      task_id: task.id,
      user_id: base.created_by || null,
      action: task.is_quick ? 'Ommaviy tezkor topshiriq yaratildi' : 'Ommaviy topshiriq yaratildi',
      old_status: null,
      new_status: task.status,
      note: task.description || null
    }));
    if (historyRows.length) {
      const { error: historyError } = await supabase.from('task_history').insert(historyRows);
      if (historyError) console.warn('Bulk task history failed:', historyError.message);
    }
    (data || []).forEach(task => notifyTaskCreatedAsync(task));
    return res.json({ ok: true, count: (data || []).length, data: (data || []).map(taskToClient) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    ensureDb();
    const oldTask = await getById('tasks', req.params.id);
    if (!oldTask) return res.status(404).json({ ok: false, error: 'Topshiriq topilmadi' });
    const payload = taskFromBody(req.body, false);
    preserveControlMarkerForPayload(payload, oldTask);
    if (payload.status === 'Bajarildi' && !oldTask.completed_at) payload.completed_at = new Date().toISOString();
    if (payload.status && payload.status !== 'Bajarildi') payload.completed_at = null;
    const { data, error } = await supabase.from('tasks').update(payload).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    const actorId = req.body.actorId || req.body.actor_id || null;
    if (payload.status && payload.status !== oldTask.status) {
      await addTaskHistory(data.id, actorId, 'Status o‘zgardi', oldTask.status, data.status, data.employee_note || data.director_note || '');
      await notifyDirectorsTaskStatusChanged(data, oldTask.status);
      if (data.status === 'Bajarilmadi' && oldTask.status !== 'Bajarilmadi') notifyAssigneeTaskFailed(data, oldTask.status).catch(err => console.warn('Employee failed notify async failed:', err.message));
      if (data.status === 'Direktor tasdiqladi' && oldTask.status !== 'Direktor tasdiqladi' && customerDoneNotifyRequested(req.body)) notifyCustomerTaskDone(data).catch(err => console.warn('Customer done notify async failed:', err.message));
    } else {
      await addTaskHistory(data.id, actorId, 'Topshiriq tahrirlandi', oldTask.status, data.status, data.employee_note || data.director_note || '');
    }
    return res.json({ ok: true, data: taskToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

function normalizeMultilineNote(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractControlMarkerParts(value) {
  const raw = normalizeMultilineNote(value);
  if (!/\[NazoratJadvali\]/i.test(raw)) return null;
  const month = raw.match(/Oy:\s*([0-9]{4}-[0-9]{2})/i)?.[1] || '';
  const bandId = raw.match(/BandID:\s*([A-Za-z0-9_.:-]+)/i)?.[1] || '';
  let band = '';
  const bandLine = raw.match(/Band:\s*([^\n]+)/i)?.[1] || '';
  if (bandLine) {
    band = bandLine
      .replace(/\s*BandID:\s*[A-Za-z0-9_.:-].*$/i, '')
      .replace(/\s*\[Soat:\s*\d{2}:\d{2}\].*$/i, '')
      .trim();
  }
  if (!month || (!band && !bandId)) return null;
  return { month, band, bandId };
}

function buildControlMarkerBlock(parts) {
  if (!parts?.month) return '';
  const lines = ['[NazoratJadvali]', `Oy: ${parts.month}`];
  if (parts.band) lines.push(`Band: ${parts.band}`);
  if (parts.bandId) lines.push(`BandID: ${parts.bandId}`);
  return lines.join('\n');
}

function extractControlMarkerBlockFromTask(task) {
  const parts = extractControlMarkerParts([task?.director_note, task?.description, task?.title].filter(Boolean).join('\n'));
  return buildControlMarkerBlock(parts);
}

function appendControlMarkerIfMissing(note, marker) {
  const incoming = normalizeMultilineNote(note);
  if (!marker) return incoming;
  if (/\[NazoratJadvali\]/i.test(incoming)) {
    const parts = extractControlMarkerParts(incoming);
    const rebuilt = buildControlMarkerBlock(parts);
    return rebuilt
      ? incoming.replace(/\[NazoratJadvali\][\s\S]*?(?=\n\[Soat:|\nManba:|\nGuruh:|\nYuboruvchi:|\nTelegram message_id:|\nMatn:|\nTranskript:|$)/i, rebuilt).trim()
      : incoming;
  }
  return (incoming ? `${incoming}\n${marker}` : marker).trim();
}

function preserveControlMarkerForPayload(payload, oldTask) {
  const marker = extractControlMarkerBlockFromTask(oldTask);
  if (!marker) return payload;
  if (Object.prototype.hasOwnProperty.call(payload, 'director_note')) {
    payload.director_note = appendControlMarkerIfMissing(payload.director_note, marker);
  } else if (Object.prototype.hasOwnProperty.call(payload, 'description') && /\[Nazorat\]/i.test(String(oldTask?.title || ''))) {
    payload.director_note = appendControlMarkerIfMissing(oldTask?.director_note || '', marker);
  }
  return payload;
}

function preserveControlMarkerOnConfirm(oldTask, newNote) {
  const marker = extractControlMarkerBlockFromTask(oldTask);
  const incoming = normalizeMultilineNote(newNote || '');
  return appendControlMarkerIfMissing(incoming || 'Tasdiqlandi.', marker) || 'Tasdiqlandi.';
}

app.post('/api/tasks/:id/confirm', async (req, res) => {
  try {
    ensureDb();
    const oldTask = await getById('tasks', req.params.id);
    if (!oldTask) return res.status(404).json({ ok: false, error: 'Topshiriq topilmadi' });
    const note = preserveControlMarkerOnConfirm(oldTask, req.body.directorNote || req.body.director_note || '');
    const { data, error } = await supabase.from('tasks').update({
      status: 'Direktor tasdiqladi',
      director_note: note,
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await addTaskHistory(data.id, req.body.actorId || null, 'Direktor tasdiqladi', oldTask.status, data.status, note);
    if (oldTask.status !== 'Direktor tasdiqladi' && customerDoneNotifyRequested(req.body)) notifyCustomerTaskDone(data).catch(err => console.warn('Customer done notify async failed:', err.message));
    return res.json({ ok: true, data: taskToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    ensureDb();
    const { error } = await supabase.from('tasks').delete().eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});


app.post('/api/tasks/bulk-delete', async (req, res) => {
  try {
    ensureDb();
    const rawIds = Array.isArray(req.body.ids) ? req.body.ids : [];
    const ids = [...new Set(rawIds.map(id => cleanText(id)).filter(Boolean))];
    if (!ids.length) return res.status(400).json({ ok: false, error: 'O‘chirish uchun topshiriqlar belgilanmagan' });
    if (ids.length > Number(process.env.BULK_DELETE_MAX_TASKS || 5000)) {
      return res.status(400).json({ ok: false, error: 'Bir martada juda ko‘p topshiriq tanlangan' });
    }

    const rows = [];
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      const { data, error } = await supabase.from('tasks').select('*').in('id', part);
      if (error) throw error;
      rows.push(...(data || []));
    }

    const onlyProblem = req.body.onlyProblem !== false;
    const deletable = onlyProblem
      ? rows.filter(t => ['Bajarilmadi', 'Bekor qilindi', 'Qayta ishlashga qaytarildi'].includes(t.status) || isTaskOverdueServer(t))
      : rows;
    const deleteIds = deletable.map(t => t.id);
    if (!deleteIds.length) return res.json({ ok: true, deleted: 0, skipped: ids.length, message: 'Tanlanganlar ichida bajarilmagan yoki muammoli topshiriq topilmadi' });

    const attachments = [];
    for (let i = 0; i < deleteIds.length; i += 500) {
      const part = deleteIds.slice(i, i + 500);
      const { data, error } = await supabase.from('task_attachments').select('id,task_id,file_path').in('task_id', part);
      if (error) throw error;
      attachments.push(...(data || []));
    }
    const storagePaths = attachments.map(a => a.file_path).filter(Boolean);
    for (let i = 0; i < storagePaths.length; i += 100) {
      const part = storagePaths.slice(i, i + 100);
      const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(part);
      if (error) console.warn('Bulk attachment storage remove failed:', error.message);
    }

    for (let i = 0; i < deleteIds.length; i += 500) {
      const part = deleteIds.slice(i, i + 500);
      await supabase.from('task_history').delete().in('task_id', part);
      await supabase.from('task_attachments').delete().in('task_id', part);
      const { error } = await supabase.from('tasks').delete().in('id', part);
      if (error) throw error;
    }

    return res.json({ ok: true, deleted: deleteIds.length, skipped: ids.length - deleteIds.length });
  } catch (err) {
    return handleError(res, err);
  }
});


app.get('/api/tasks/:id/attachments', async (req, res) => {
  try {
    ensureDb();
    await ensureTaskExists(req.params.id);
    const { data, error } = await supabase
      .from('task_attachments')
      .select('*, app_users(full_name)')
      .eq('task_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const withUrls = await Promise.all((data || []).map(async a => ({
      ...attachmentToClient(a, await createSignedAttachmentUrl(a.file_path)),
      uploadedByName: a.app_users?.full_name || ''
    })));
    return res.json({ ok: true, data: withUrls });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/tasks/:id/attachments', upload.single('file'), async (req, res) => {
  try {
    ensureDb();
    const task = await ensureTaskExists(req.params.id);
    if (!req.file) return res.status(400).json({ ok: false, error: 'Fayl tanlanmagan' });
    if (req.file.size > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: `Fayl hajmi ${MAX_ATTACHMENT_SIZE_MB} MB dan oshmasin` });
    }

    const actorId = req.body.actorId || req.body.actor_id || null;
    const originalName = sanitizeFileName(req.file.originalname || 'file');
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
    const randomPart = Math.random().toString(36).slice(2, 8);
    const storagePath = `${req.params.id}/${stamp}_${randomPart}_${originalName}`;

    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype || 'application/octet-stream',
        upsert: false
      });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.from('task_attachments').insert({
      task_id: req.params.id,
      file_name: req.file.originalname || originalName,
      file_path: storagePath,
      file_type: req.file.mimetype || 'application/octet-stream',
      file_size: req.file.size || 0,
      uploaded_by: actorId
    }).select('*').single();
    if (error) throw error;

    await addTaskHistory(task.id, actorId, 'Ilova yuklandi', task.status, task.status, req.file.originalname || originalName);
    const signedUrl = await createSignedAttachmentUrl(data.file_path);
    return res.json({ ok: true, data: attachmentToClient(data, signedUrl) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.delete('/api/attachments/:id', async (req, res) => {
  try {
    ensureDb();
    const { data: attachment, error: findError } = await supabase
      .from('task_attachments')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!attachment) return res.status(404).json({ ok: false, error: 'Ilova topilmadi' });

    if (attachment.file_path) {
      const { error: storageError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove([attachment.file_path]);
      if (storageError) console.warn('Storage remove failed:', storageError.message);
    }

    const { error } = await supabase.from('task_attachments').delete().eq('id', req.params.id);
    if (error) throw error;
    await addTaskHistory(attachment.task_id, req.query.actorId || null, 'Ilova o‘chirildi', null, null, attachment.file_name || '');
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});


app.get('/api/tasks/:id/history', async (req, res) => {
  try {
    ensureDb();
    const { data, error } = await supabase.from('task_history').select('*, app_users(full_name)').eq('task_id', req.params.id).order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(res, err);
  }
});


app.get('/api/reports/tasks.csv', async (req, res) => {
  try {
    ensureDb();
    const [tasksRes, companiesRes, usersRes] = await Promise.all([
      fetchAllRowsResult('tasks', '*', { order: { column: 'created_at', ascending: false } }),
      fetchAllRowsResult('companies', '*'),
      fetchAllRowsResult('app_users', '*')
    ]);
    for (const r of [tasksRes, companiesRes, usersRes]) if (r.error) throw r.error;

    const companies = new Map((companiesRes.data || []).map(c => [c.id, c]));
    const users = new Map((usersRes.data || []).map(u => [u.id, u]));
    const q = req.query || {};

    let tasks = tasksRes.data || [];
    if (q.companyId) tasks = tasks.filter(t => t.company_id === q.companyId);
    if (q.assigneeId) tasks = tasks.filter(t => t.assignee_id === q.assigneeId);
    if (q.status) tasks = tasks.filter(t => t.status === q.status);
    if (q.quick === 'true') tasks = tasks.filter(t => !!t.is_quick);
    if (q.quick === 'false') tasks = tasks.filter(t => !t.is_quick);
    if (q.dateFrom) tasks = tasks.filter(t => t.deadline && t.deadline >= q.dateFrom);
    if (q.dateTo) tasks = tasks.filter(t => t.deadline && t.deadline <= q.dateTo);
    if (q.overdue === 'true') tasks = tasks.filter(isTaskOverdueServer);

    const rows = [[
      'Korxona STIR', 'Korxona', 'Topshiriq', 'Turi', 'Muhimlik', 'Masul xodim',
      'Muddat', 'Status', 'Faol', 'Tezkor', 'Kechikkan', 'Topshiriq mazmuni',
      'Xodim izohi', 'Direktor izohi', 'Yaratilgan sana', 'Bajarilgan sana'
    ]];

    for (const t of tasks) {
      const c = companies.get(t.company_id) || {};
      const u = users.get(t.assignee_id) || {};
      rows.push([
        c.tin || '', c.name || '', t.title || '', t.type || '', t.priority || '', u.full_name || '',
        t.deadline || '', t.status || '', t.is_active ? 'Faol' : 'To‘xtatilgan', t.is_quick ? 'Ha' : 'Yo‘q',
        isTaskOverdueServer(t) ? 'Ha' : 'Yo‘q', t.description || '', t.employee_note || '', t.director_note || '',
        t.created_at || '', t.completed_at || ''
      ]);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ijro_nazorati_topshiriqlar.csv"');
    return res.send(toCsv(rows));
  } catch (err) {
    return handleError(res, err);
  }
});



// ================= Stage 7.9 — bulk advanced, Excel report and Telegram reminders =================
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
}
function extractTaskTimeServer(task) {
  const text = String((task?.director_note || '') + '\n' + (task?.description || ''));
  const m = text.match(/\[Soat:\s*(\d{2}:\d{2})\]/);
  return m ? m[1] : '';
}
function taskDeadlineDateServer(task) {
  if (!task?.deadline) return null;
  const time = extractTaskTimeServer(task) || '23:59';
  const d = dateFromTashkentLocal(String(task.deadline).slice(0, 10), time);
  return !d || Number.isNaN(d.getTime()) ? null : d;
}
function taskDeadlineTextServer(task) {
  const time = extractTaskTimeServer(task);
  return `${task?.deadline || ''}${time ? ' ' + time : ''}`.trim();
}
async function getReportRowsFromDb(q = {}) {
  ensureDb();
  const [tasksRes, companiesRes, usersRes] = await Promise.all([
    fetchAllRowsResult('tasks', '*', { order: { column: 'created_at', ascending: false } }),
    fetchAllRowsResult('companies', '*'),
    fetchAllRowsResult('app_users', '*')
  ]);
  for (const r of [tasksRes, companiesRes, usersRes]) if (r.error) throw r.error;
  const companies = new Map((companiesRes.data || []).map(c => [c.id, c]));
  const users = new Map((usersRes.data || []).map(u => [u.id, u]));
  let tasks = tasksRes.data || [];
  if (q.companyId) tasks = tasks.filter(t => t.company_id === q.companyId);
  if (q.assigneeId) tasks = tasks.filter(t => t.assignee_id === q.assigneeId);
  if (q.status) tasks = tasks.filter(t => t.status === q.status);
  if (q.quick === 'true') tasks = tasks.filter(t => !!t.is_quick);
  if (q.quick === 'false') tasks = tasks.filter(t => !t.is_quick);
  if (q.dateFrom) tasks = tasks.filter(t => t.deadline && t.deadline >= q.dateFrom);
  if (q.dateTo) tasks = tasks.filter(t => t.deadline && t.deadline <= q.dateTo);
  if (q.overdue === 'true') tasks = tasks.filter(isTaskOverdueServer);
  return { tasks, companies, users };
}

app.post('/api/tasks/bulk-advanced', async (req, res) => {
  try {
    ensureDb();
    const rawCompanyIds = Array.isArray(req.body.companyIds) ? req.body.companyIds : (Array.isArray(req.body.company_ids) ? req.body.company_ids : [req.body.companyId || req.body.company_id].filter(Boolean));
    const rawAssigneeIds = Array.isArray(req.body.assigneeIds) ? req.body.assigneeIds : (Array.isArray(req.body.assignee_ids) ? req.body.assignee_ids : [req.body.assigneeId || req.body.assignee_id].filter(Boolean));
    const companyIds = [...new Set(rawCompanyIds.map(id => cleanText(id)).filter(Boolean))];
    const assigneeIds = [...new Set(rawAssigneeIds.map(id => cleanText(id)).filter(Boolean))];
    if (!companyIds.length) return res.status(400).json({ ok: false, error: 'Kamida bitta korxona tanlang' });
    if (!assigneeIds.length) return res.status(400).json({ ok: false, error: 'Kamida bitta xodim tanlang' });
    if (companyIds.length * assigneeIds.length > 1000) return res.status(400).json({ ok: false, error: 'Bir martada 1000 tagacha topshiriq yaratish mumkin' });
    const base = taskFromBody(req.body, true);
    if (!base.title) return res.status(400).json({ ok: false, error: 'Topshiriq nomi majburiy' });
    delete base.company_id;
    delete base.assignee_id;
    const now = new Date().toISOString();
    const rows = [];
    for (const companyId of companyIds) {
      for (const assigneeId of assigneeIds) {
        rows.push({ ...base, company_id: companyId, assignee_id: assigneeId, completed_at: base.status === 'Bajarildi' ? now : null });
      }
    }
    const { data, error } = await supabase.from('tasks').insert(rows).select('*');
    if (error) throw error;
    const actorId = req.body.actorId || req.body.actor_id || base.created_by || null;
    const historyRows = (data || []).map(task => ({
      task_id: task.id,
      user_id: actorId,
      action: task.is_quick ? 'Ommaviy tezkor topshiriq yaratildi' : 'Ommaviy topshiriq yaratildi',
      old_status: null,
      new_status: task.status,
      note: task.description || null
    }));
    if (historyRows.length) {
      const { error: historyError } = await supabase.from('task_history').insert(historyRows);
      if (historyError) console.warn('Bulk advanced task history failed:', historyError.message);
    }
    (data || []).forEach(task => notifyTaskCreatedAsync(task));
    return res.json({ ok: true, count: (data || []).length, data: (data || []).map(taskToClient) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/reports/tasks.xls', async (req, res) => {
  try {
    const { tasks, companies, users } = await getReportRowsFromDb(req.query || {});
    const summary = {
      total: tasks.length,
      done: tasks.filter(t => isTaskDoneServer(t.status)).length,
      overdue: tasks.filter(isTaskOverdueServer).length,
      returned: tasks.filter(t => t.status === 'Qayta ishlashga qaytarildi').length
    };
    const tableRows = tasks.map(t => {
      const c = companies.get(t.company_id) || {};
      const u = users.get(t.assignee_id) || {};
      return `<tr><td>${htmlEscape(c.tin || '')}</td><td>${htmlEscape(c.name || '')}</td><td>${htmlEscape(t.title || '')}</td><td>${htmlEscape(t.type || '')}</td><td>${htmlEscape(t.priority || '')}</td><td>${htmlEscape(u.full_name || '')}</td><td>${htmlEscape(taskDeadlineTextServer(t))}</td><td>${htmlEscape(t.status || '')}</td><td>${t.is_active ? 'Faol' : 'To‘xtatilgan'}</td><td>${t.is_quick ? 'Ha' : 'Yo‘q'}</td><td>${isTaskOverdueServer(t) ? 'Ha' : 'Yo‘q'}</td><td>${htmlEscape(t.description || '')}</td><td>${htmlEscape(t.employee_note || '')}</td><td>${htmlEscape(t.director_note || '')}</td><td>${htmlEscape(t.created_at || '')}</td><td>${htmlEscape(t.completed_at || '')}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif}h1{font-size:20px}.summary td{font-weight:bold;background:#eef3ff}table{border-collapse:collapse;width:100%}th{background:#4850b8;color:#fff}td,th{border:1px solid #b7c2dd;padding:7px;font-size:12px}.green{background:#e8f8ef}.red{background:#fdecec}.yellow{background:#fff6df}</style></head><body><h1>Ijro nazorati — topshiriqlar hisoboti</h1><table class="summary"><tr><td>Jami</td><td>${summary.total}</td><td>Bajarilgan</td><td class="green">${summary.done}</td><td>Kechikkan</td><td class="red">${summary.overdue}</td><td>Qaytarilgan</td><td class="yellow">${summary.returned}</td></tr></table><br><table><thead><tr><th>Korxona STIR</th><th>Korxona</th><th>Topshiriq</th><th>Turi</th><th>Muhimlik</th><th>Mas’ul xodim</th><th>Muddat</th><th>Status</th><th>Faol</th><th>Tezkor</th><th>Kechikkan</th><th>Topshiriq mazmuni</th><th>Xodim izohi</th><th>Direktor izohi</th><th>Yaratilgan sana</th><th>Bajarilgan sana</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ijro_nazorati_topshiriqlar.xls"');
    return res.send(html);
  } catch (err) {
    return handleError(res, err);
  }
});

const reminderSentKeys = new Map();
const REMINDER_MODE = (process.env.REMINDER_MODE || 'scheduled').toLowerCase();
const REMINDER_TIMEZONE = process.env.REMINDER_TIMEZONE || 'Asia/Tashkent';
const REMINDER_SCHEDULE_WINDOW_MINUTES = Math.max(1, Number(process.env.REMINDER_SCHEDULE_WINDOW_MINUTES || 3));
const REMINDER_DIGEST_ENABLED = process.env.REMINDER_DIGEST_ENABLED !== 'false';
const REMINDER_OVERDUE_EVERY_TIME = process.env.REMINDER_OVERDUE_EVERY_TIME !== 'false';
const WEEKLY_DIGEST_ENABLED = process.env.WEEKLY_DIGEST_ENABLED === 'true';
const WEEKLY_DIGEST_DAY = (process.env.WEEKLY_DIGEST_DAY || 'FRIDAY').toUpperCase();
const WEEKLY_DIGEST_TIME = process.env.WEEKLY_DIGEST_TIME || '17:30';
const WEEKLY_DIGEST_TIMEZONE = process.env.WEEKLY_DIGEST_TIMEZONE || REMINDER_TIMEZONE;

function cleanupReminderCache() {
  const now = Date.now();
  for (const [key, value] of reminderSentKeys.entries()) if (now - value > 14 * 24 * 60 * 60 * 1000) reminderSentKeys.delete(key);
}
function reminderThresholdLabel(minutes) {
  const m = Number(minutes || 0);
  if (m % 1440 === 0) return `${m / 1440} kun qoldi`;
  if (m % 60 === 0) return `${m / 60} soat qoldi`;
  return `${m} minut qoldi`;
}
function reminderThresholdsConfig() {
  const raw = String(process.env.REMINDER_THRESHOLDS_MINUTES || '1440,180,60');
  const values = raw.split(',').map(x => Number(String(x).trim())).filter(x => Number.isFinite(x) && x > 0);
  const unique = [...new Set(values.length ? values : [1440, 180, 60])];
  return unique.sort((a, b) => a - b).map(minutes => ({ key: `${minutes}m`, minutes, ms: minutes * 60 * 1000, label: reminderThresholdLabel(minutes) }));
}
function reminderTimesConfig() {
  const raw = String(process.env.REMINDER_TIMES || '09:00,13:00,17:30');
  return [...new Set(raw.split(',').map(x => cleanText(x)).filter(x => /^\d{1,2}:\d{2}$/.test(x)).map(x => {
    const p = parseHm(x);
    return String(p.h).padStart(2,'0') + ':' + String(p.m).padStart(2,'0');
  }))];
}
function reminderLevelForTask(task) {
  const d = taskDeadlineDateServer(task);
  if (!d || isTaskDoneServer(task.status) || task.status === 'Bekor qilindi' || task.status === 'Bajarilmadi') return null;
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return null;
  return reminderThresholdsConfig().find(level => ms <= level.ms) || null;
}
function sameIso(dateIso, task) { return String(task?.deadline || '').slice(0,10) === String(dateIso || '').slice(0,10); }
function taskNotFinalServer(task) { return !isTaskDoneServer(task.status) && task.status !== 'Bekor qilindi' && task.status !== 'Bajarilmadi'; }
function dueWithinServer(task, hours) {
  const d = taskDeadlineDateServer(task);
  if (!d || !taskNotFinalServer(task)) return false;
  const ms = d.getTime() - Date.now();
  return ms >= 0 && ms <= Number(hours || 1) * 60 * 60 * 1000;
}
function topTaskLines(tasks, companies, limit = 5) {
  const rows = (tasks || []).slice(0, limit);
  if (!rows.length) return 'Topshiriq yo‘q';
  return rows.map((t, i) => `${i + 1}. ${(companies.get(t.company_id) || {}).name || '-'} — ${t.title || '-'}`).join('\n');
}
function weeklyDayNumber(name) {
  return { SUNDAY:0, MONDAY:1, TUESDAY:2, WEDNESDAY:3, THURSDAY:4, FRIDAY:5, SATURDAY:6 }[String(name || '').toUpperCase()] ?? 5;
}
function scheduledTimeInWindow(targetHm, now = new Date(), timeZone = REMINDER_TIMEZONE, windowMinutes = REMINDER_SCHEDULE_WINDOW_MINUTES) {
  const p = getTzParts(now, timeZone);
  const nowMin = p.hour * 60 + p.minute;
  const targetMin = hmToMinutes(targetHm);
  const diff = Math.abs(nowMin - targetMin);
  return diff <= windowMinutes ? { ok: true, dateIso: isoFromTzParts(p), hm: String(parseHm(targetHm).h).padStart(2,'0') + ':' + String(parseHm(targetHm).m).padStart(2,'0'), parts: p } : { ok: false, dateIso: isoFromTzParts(p), hm: targetHm, parts: p };
}
function digestTextForTime(scheduleTime, tasks, companies) {
  const today = todayIsoServer();
  const active = (tasks || []).filter(t => t.is_active !== false);
  const todayTasks = active.filter(t => sameIso(today, t));
  const overdue = active.filter(isTaskOverdueServer);
  const urgent = active.filter(t => dueWithinServer(t, 1));
  const notDoneToday = todayTasks.filter(taskNotFinalServer);
  const notStartedToday = todayTasks.filter(t => t.status === 'Yangi' || t.status === 'Qabul qilindi');
  const doneToday = todayTasks.filter(t => isTaskDoneServer(t.status));
  const review = active.filter(t => t.status === 'Bajarildi');
  const important = todayTasks.filter(taskNotFinalServer).sort((a,b)=>(isTaskOverdueServer(b)-isTaskOverdueServer(a)) || String(taskDeadlineTextServer(a)).localeCompare(String(taskDeadlineTextServer(b))));
  if (scheduleTime === '09:00') {
    return [`📌 Bugungi ijro rejasi`, '', `Bugun muddati tugaydigan topshiriqlar: ${todayTasks.length} ta`, `Shoshilinch: ${urgent.length} ta`, `Kechikkan: ${overdue.length} ta`, '', `Eng muhim topshiriqlar:`, topTaskLines(important, companies, 5)].join('\n');
  }
  if (scheduleTime === '13:00') {
    return [`⏳ Kunduzgi ijro nazorati`, '', `Bugungi topshiriqlardan bajarilmaganlari: ${notDoneToday.length} ta`, `Hali boshlanmagan: ${notStartedToday.length} ta`, `1 soatdan kam qolgan: ${urgent.length} ta`, '', topTaskLines(notDoneToday, companies, 5)].join('\n');
  }
  if (scheduleTime === '17:30') {
    return [`📊 Kun yakuni`, '', `Bugun bajarilgan: ${doneToday.length} ta`, `Bajarilmagan: ${notDoneToday.length} ta`, `Kechikkan: ${overdue.length} ta`, `Tasdiqlash kutayotgan topshiriqlar: ${review.length} ta`, '', topTaskLines(notDoneToday.concat(review), companies, 5)].join('\n');
  }
  if (scheduleTime === '20:00') {
    return [`🚨 Kechikkan topshiriqlar`, '', `Jami kechikkan: ${overdue.length} ta`, '', topTaskLines(overdue, companies, 8)].join('\n');
  }
  return [`📌 Ijro nazorati digest`, '', `Bugungi topshiriqlar: ${todayTasks.length} ta`, `Bajarilmagan: ${notDoneToday.length} ta`, `Kechikkan: ${overdue.length} ta`, `Tasdiqlash kutayotgan: ${review.length} ta`, '', topTaskLines(notDoneToday.concat(overdue), companies, 5)].join('\n');
}
async function sendToActiveDirectors(text) {
  const directorsRes = await supabase.from('app_users').select('*').eq('role', 'director').eq('is_active', true).not('telegram_chat_id', 'is', null);
  if (directorsRes.error) throw directorsRes.error;
  const targets = [...new Set((directorsRes.data || []).map(d => d.telegram_chat_id).filter(Boolean))];
  await Promise.all(targets.map(chatId => sendTelegramMessage(chatId, text).catch(err => console.warn('Digest telegram failed:', err.message))));
  return targets.length;
}
async function checkAndSendScheduledDigest() {
  if (process.env.TELEGRAM_REMINDERS_ENABLED === 'false') return { sent: 0, skipped: true };
  if (!REMINDER_DIGEST_ENABLED) return { sent: 0, skipped: true, reason: 'digest_disabled' };
  ensureDb();
  cleanupReminderCache();
  const times = reminderTimesConfig();
  const matched = times.map(t => scheduledTimeInWindow(t, new Date(), REMINDER_TIMEZONE)).find(x => x.ok);
  if (!matched) return { sent: 0, mode: 'scheduled', checked: true };
  const cacheKey = `digest|${matched.dateIso}|${matched.hm}`;
  if (reminderSentKeys.has(cacheKey)) return { sent: 0, mode: 'scheduled', duplicate: true };
  const [tasksRes, companiesRes] = await Promise.all([
    fetchAllRowsResult('tasks', '*', { eq: [['is_active', true]] }),
    fetchAllRowsResult('companies', '*')
  ]);
  for (const r of [tasksRes, companiesRes]) if (r.error) throw r.error;
  const companies = new Map((companiesRes.data || []).map(c => [c.id, c]));
  const text = digestTextForTime(matched.hm, tasksRes.data || [], companies);
  const sent = await sendToActiveDirectors(text);
  reminderSentKeys.set(cacheKey, Date.now());
  if (WEEKLY_DIGEST_ENABLED) await checkAndSendWeeklyDigest(tasksRes.data || [], companies).catch(err => console.warn('Weekly digest failed:', err.message));
  return { sent, mode: 'scheduled', scheduleTime: matched.hm };
}
async function checkAndSendWeeklyDigest(preloadedTasks = null, preloadedCompanies = null) {
  if (!WEEKLY_DIGEST_ENABLED) return { sent: 0, skipped: true };
  const matched = scheduledTimeInWindow(WEEKLY_DIGEST_TIME, new Date(), WEEKLY_DIGEST_TIMEZONE, REMINDER_SCHEDULE_WINDOW_MINUTES);
  if (!matched.ok) return { sent: 0, checked: true };
  const localNoon = dateFromTashkentLocal(matched.dateIso, '12:00') || new Date();
  if (localNoon.getUTCDay() !== weeklyDayNumber(WEEKLY_DIGEST_DAY)) return { sent: 0, checked: true };
  const cacheKey = `weekly|${matched.dateIso}|${WEEKLY_DIGEST_DAY}|${WEEKLY_DIGEST_TIME}`;
  if (reminderSentKeys.has(cacheKey)) return { sent: 0, duplicate: true };
  ensureDb();
  let tasks = preloadedTasks;
  let companies = preloadedCompanies;
  if (!tasks || !companies) {
    const [tasksRes, companiesRes] = await Promise.all([fetchAllRowsResult('tasks', '*', { eq: [['is_active', true]] }), fetchAllRowsResult('companies', '*')]);
    for (const r of [tasksRes, companiesRes]) if (r.error) throw r.error;
    tasks = tasksRes.data || [];
    companies = new Map((companiesRes.data || []).map(c => [c.id, c]));
  }
  const done = tasks.filter(t => isTaskDoneServer(t.status)).length;
  const overdue = tasks.filter(isTaskOverdueServer).length;
  const returned = tasks.filter(t => t.status === 'Qayta ishlashga qaytarildi').length;
  const text = [`📊 Haftalik ijro hisoboti`, '', `Jami topshiriqlar: ${tasks.length} ta`, `Bajarilgan: ${done} ta`, `Kechikkan: ${overdue} ta`, `Qaytarilgan: ${returned} ta`, '', `Eng muhim topshiriqlar:`, topTaskLines(tasks.filter(taskNotFinalServer).sort((a,b)=>String(taskDeadlineTextServer(a)).localeCompare(String(taskDeadlineTextServer(b)))), companies, 5)].join('\n');
  const sent = await sendToActiveDirectors(text);
  reminderSentKeys.set(cacheKey, Date.now());
  return { sent, mode: 'weekly' };
}
async function checkAndSendThresholdReminders() {
  if (process.env.TELEGRAM_REMINDERS_ENABLED === 'false') return { sent: 0, skipped: true };
  ensureDb();
  cleanupReminderCache();
  const [tasksRes, companiesRes, usersRes, directorsRes] = await Promise.all([
    fetchAllRowsResult('tasks', '*', { eq: [['is_active', true]] }),
    fetchAllRowsResult('companies', '*'),
    fetchAllRowsResult('app_users', '*'),
    supabase.from('app_users').select('*').eq('role', 'director').eq('is_active', true).not('telegram_chat_id', 'is', null)
  ]);
  for (const r of [tasksRes, companiesRes, usersRes, directorsRes]) if (r.error) throw r.error;
  const companies = new Map((companiesRes.data || []).map(c => [c.id, c]));
  const users = new Map((usersRes.data || []).map(u => [u.id, u]));
  let sent = 0;
  for (const task of tasksRes.data || []) {
    const level = reminderLevelForTask(task);
    if (!level) continue;
    const cacheKey = `${task.id}|${level.key}|${task.deadline}|${extractTaskTimeServer(task)}|${task.updated_at || ''}`;
    if (reminderSentKeys.has(cacheKey)) continue;
    const company = companies.get(task.company_id) || {};
    const assignee = users.get(task.assignee_id) || {};
    const text = [`⏰ Eslatma: ${level.label}`, '', `Korxona: ${company.name || '-'}`, `Topshiriq: ${task.title || '-'}`, `Muddat: ${taskDeadlineTextServer(task) || '-'}`, `Muhimlik: ${task.priority || '-'}`, `Status: ${task.status || '-'}`].join('\n');
    const targets = [];
    if (assignee.telegram_chat_id) targets.push(assignee.telegram_chat_id);
    for (const d of directorsRes.data || []) if (d.telegram_chat_id) targets.push(d.telegram_chat_id);
    const uniqueTargets = [...new Set(targets.filter(Boolean))];
    await Promise.all(uniqueTargets.map(chatId => sendTelegramMessage(chatId, text).catch(err => console.warn('Reminder telegram failed:', err.message))));
    reminderSentKeys.set(cacheKey, Date.now());
    sent += uniqueTargets.length;
  }
  return { sent, mode: 'threshold' };
}
async function checkAndSendTaskReminders() {
  if (REMINDER_MODE === 'scheduled') return checkAndSendScheduledDigest();
  return checkAndSendThresholdReminders();
}
app.get('/api/reminders/config', (req, res) => {
  return res.json({ ok: true, mode: REMINDER_MODE, scanMinutes: reminderScanMinutes, thresholdsMinutes: reminderThresholdsConfig().map(x => x.minutes), times: reminderTimesConfig(), timezone: REMINDER_TIMEZONE, scheduleWindowMinutes: REMINDER_SCHEDULE_WINDOW_MINUTES, digestEnabled: REMINDER_DIGEST_ENABLED, overdueEveryTime: REMINDER_OVERDUE_EVERY_TIME, weeklyDigest: { enabled: WEEKLY_DIGEST_ENABLED, day: WEEKLY_DIGEST_DAY, time: WEEKLY_DIGEST_TIME, timezone: WEEKLY_DIGEST_TIMEZONE }, envExample: { REMINDER_MODE, REMINDER_SCAN_MINUTES: String(reminderScanMinutes), REMINDER_THRESHOLDS_MINUTES: reminderThresholdsConfig().map(x => x.minutes).join(','), REMINDER_TIMES: reminderTimesConfig().join(','), REMINDER_TIMEZONE, REMINDER_SCHEDULE_WINDOW_MINUTES: String(REMINDER_SCHEDULE_WINDOW_MINUTES), REMINDER_DIGEST_ENABLED: String(REMINDER_DIGEST_ENABLED), REMINDER_OVERDUE_EVERY_TIME: String(REMINDER_OVERDUE_EVERY_TIME) } });
});

app.post('/api/reminders/check', async (req, res) => {
  try {
    const result = await checkAndSendTaskReminders();
    return res.json({ ok: true, ...result });
  } catch (err) {
    return handleError(res, err);
  }
});
const reminderScanMinutes = Math.max(1, Number(process.env.REMINDER_SCAN_MINUTES || 5));
setInterval(() => {
  checkAndSendTaskReminders().catch(err => console.warn('Reminder scan failed:', err.message));
}, reminderScanMinutes * 60 * 1000);



// ================= Stage 8.0 — customer completion notice and printable PDF reports =================
// Baza strukturasini o'zgartirmaydi. Telegram guruhga yakuniy xabar group_id -> company_id env xaritasi orqali yuboriladi.
// Stage 8.3.1 update: mijoz Telegram guruhiga xabar faqat direktor tasdiqlash paytida belgilasa yuboriladi.
function envBool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined || v === null || String(v).trim() === '') return !!fallback;
  return ['1','true','yes','ha','on'].includes(String(v).trim().toLowerCase());
}
function customerDoneNotifyRequested(body = {}) {
  const keys = ['notifyCustomer','notify_customer','customerDoneNotify','customer_done_notify','sendCustomerTelegram','send_customer_telegram'];
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(body, k)) return body[k] === true || body[k] === 1 || String(body[k]).toLowerCase() === 'true';
  }
  return envBool('CUSTOMER_DONE_NOTIFY_DEFAULT', false);
}
function telegramGroupIdForCompany(companyId) {
  const map = telegramCompanyMap();
  for (const [chatId, mappedCompanyId] of Object.entries(map || {})) {
    if (String(mappedCompanyId) === String(companyId)) return String(chatId);
  }
  return '';
}
function taskDoneCustomerText(task, company = {}, assignee = {}) {
  return [
    '✅ Topshiriq bajarildi va tasdiqlandi',
    '',
    `Korxona: ${company.name || '-'}`,
    `Topshiriq: ${task.title || '-'}`,
    `Mas’ul: ${assignee.full_name || '-'}`,
    `Muddat: ${taskDeadlineTextServer(task) || '-'}`,
    task.employee_note ? `Xodim izohi: ${task.employee_note}` : '',
    `Tasdiq vaqti: ${new Date().toLocaleString('uz-UZ')}`,
    '',
    'Rahmat. Topshiriq ijrosi tizimda yakunlandi.'
  ].join('\n');
}
async function notifyCustomerTaskDone(task) {
  try {
    if (process.env.CUSTOMER_DONE_NOTIFY_ENABLED === 'false') return { ok: false, skipped: true };
    if (!task || task.status !== 'Direktor tasdiqladi') return { ok: false, skipped: true };
    const groupId = telegramGroupIdForCompany(task.company_id);
    if (!groupId) return { ok: false, skipped: true, reason: 'group_not_mapped' };
    const [company, assignee] = await Promise.all([
      getById('companies', task.company_id).catch(() => null),
      getById('app_users', task.assignee_id).catch(() => null)
    ]);
    const result = await sendTelegramMessage(groupId, taskDoneCustomerText(task, company || {}, assignee || {}));
    await addTaskHistory(task.id, null, 'Mijoz Telegram guruhiga bajarildi xabari yuborildi', task.status, task.status, `Guruh ID: ${groupId}`);
    return result;
  } catch (err) {
    console.warn('Customer done telegram failed:', err.message);
    return { ok: false, error: err.message };
  }
}
function reportPrintableHtml(tasks, companies, users, title = 'Ijro nazorati hisoboti') {
  const summary = {
    total: tasks.length,
    done: tasks.filter(t => isTaskDoneServer(t.status)).length,
    overdue: tasks.filter(isTaskOverdueServer).length,
    returned: tasks.filter(t => t.status === 'Qayta ishlashga qaytarildi').length,
    inProgress: tasks.filter(t => ['Yangi','Qabul qilindi','Bajarilmoqda'].includes(t.status)).length
  };
  const companyStats = new Map();
  const employeeStats = new Map();
  for (const t of tasks) {
    const c = companies.get(t.company_id) || {};
    const u = users.get(t.assignee_id) || {};
    const ck = c.name || '-';
    const uk = u.full_name || '-';
    if (!companyStats.has(ck)) companyStats.set(ck, { name: ck, total: 0, done: 0, overdue: 0 });
    if (!employeeStats.has(uk)) employeeStats.set(uk, { name: uk, total: 0, done: 0, overdue: 0, returned: 0 });
    const cs = companyStats.get(ck); cs.total++; if (isTaskDoneServer(t.status)) cs.done++; if (isTaskOverdueServer(t)) cs.overdue++;
    const es = employeeStats.get(uk); es.total++; if (isTaskDoneServer(t.status)) es.done++; if (isTaskOverdueServer(t)) es.overdue++; if (t.status === 'Qayta ishlashga qaytarildi') es.returned++;
  }
  const statCards = `<div class="cards"><div><span>Jami</span><b>${summary.total}</b></div><div><span>Bajarilgan</span><b>${summary.done}</b></div><div><span>Jarayonda</span><b>${summary.inProgress}</b></div><div><span>Kechikkan</span><b>${summary.overdue}</b></div><div><span>Qaytarilgan</span><b>${summary.returned}</b></div></div>`;
  const companyRows = [...companyStats.values()].sort((a,b)=>b.total-a.total).slice(0,15).map(x=>`<tr><td>${htmlEscape(x.name)}</td><td>${x.total}</td><td>${x.done}</td><td>${x.overdue}</td></tr>`).join('');
  const employeeRows = [...employeeStats.values()].sort((a,b)=>b.done-a.done || a.overdue-b.overdue).slice(0,15).map(x=>`<tr><td>${htmlEscape(x.name)}</td><td>${x.total}</td><td>${x.done}</td><td>${x.overdue}</td><td>${x.returned}</td></tr>`).join('');
  const taskRows = tasks.map(t => {
    const c = companies.get(t.company_id) || {};
    const u = users.get(t.assignee_id) || {};
    return `<tr><td>${htmlEscape(c.tin || '')}</td><td>${htmlEscape(c.name || '')}</td><td>${htmlEscape(t.title || '')}</td><td>${htmlEscape(t.priority || '')}</td><td>${htmlEscape(u.full_name || '')}</td><td>${htmlEscape(taskDeadlineTextServer(t))}</td><td>${htmlEscape(t.status || '')}</td><td>${isTaskOverdueServer(t) ? 'Ha' : 'Yo‘q'}</td><td>${htmlEscape((t.description || '').slice(0,500))}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(title)}</title><style>
    @page{size:A4 landscape;margin:12mm}body{font-family:Arial, sans-serif;color:#172033;margin:0}h1{font-size:22px;margin:0 0 6px}h2{font-size:16px;margin:22px 0 8px}.muted{color:#5f6b85;font-size:12px}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:14px 0}.cards div{border:1px solid #cbd5e1;background:#f4f7fb;border-radius:10px;padding:10px}.cards span{display:block;font-size:11px;color:#64748b}.cards b{font-size:22px}table{border-collapse:collapse;width:100%;margin-bottom:14px}th{background:#4850b8;color:#fff}td,th{border:1px solid #b8c2d6;padding:6px 7px;font-size:11px;text-align:left;vertical-align:top}.printbar{display:flex;justify-content:flex-end;margin-bottom:12px}.printbtn{background:#4850b8;color:#fff;border:0;border-radius:10px;padding:10px 14px;font-weight:bold;cursor:pointer}@media print{.printbar{display:none}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="printbar"><button class="printbtn" onclick="window.print()">PDF saqlash / Chop etish</button></div><h1>${htmlEscape(title)}</h1><div class="muted">Shakllangan vaqt: ${new Date().toLocaleString('uz-UZ')}</div>${statCards}<h2>Korxonalar reytingi</h2><table><thead><tr><th>Korxona</th><th>Jami</th><th>Bajarilgan</th><th>Kechikkan</th></tr></thead><tbody>${companyRows || '<tr><td colspan="4">Ma’lumot yo‘q</td></tr>'}</tbody></table><h2>Xodimlar reytingi</h2><table><thead><tr><th>Xodim</th><th>Jami</th><th>Bajarilgan</th><th>Kechikkan</th><th>Qaytarilgan</th></tr></thead><tbody>${employeeRows || '<tr><td colspan="5">Ma’lumot yo‘q</td></tr>'}</tbody></table><h2>Topshiriqlar ro‘yxati</h2><table><thead><tr><th>STIR</th><th>Korxona</th><th>Topshiriq</th><th>Muhimlik</th><th>Mas’ul</th><th>Muddat</th><th>Status</th><th>Kechikkan</th><th>Izoh</th></tr></thead><tbody>${taskRows || '<tr><td colspan="9">Topshiriq topilmadi</td></tr>'}</tbody></table></body></html>`;
}
app.get('/api/reports/tasks.print', async (req, res) => {
  try {
    const { tasks, companies, users } = await getReportRowsFromDb(req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(reportPrintableHtml(tasks, companies, users, 'Ijro nazorati — PDF/Print hisobot'));
  } catch (err) {
    return handleError(res, err);
  }
});
app.get('/api/reports/tasks.pdf', async (req, res) => {
  try {
    const { tasks, companies, users } = await getReportRowsFromDb(req.query || {});
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(reportPrintableHtml(tasks, companies, users, 'Ijro nazorati — PDF hisobot'));
  } catch (err) {
    return handleError(res, err);
  }
});


// ================= Stage 8.4.1 — My Soliq Monitoring Integration =================
const UZ_CYR_TO_LAT = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'sh','ъ':'','ы':'i','ь':'','э':'e','ю':'yu','я':'ya','қ':'q','ғ':'g','ҳ':'h','ў':'o'
};
function normalizeMonitorText(value) {
  return String(value || '').toLowerCase().split('').map(ch => UZ_CYR_TO_LAT[ch] ?? ch).join('')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ʻʼ’‘`´]/g, "'").replace(/[^a-z0-9'\-\s/.:]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function monitorDateIso(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const dateIso = `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const time = `${String(m[4] || '00').padStart(2,'0')}:${String(m[5] || '00').padStart(2,'0')}`;
  const d = dateFromTashkentLocal(dateIso, time);
  if (!d) return null;
  if (m[6]) d.setUTCSeconds(Number(m[6]));
  return d.toISOString();
}
const MONITOR_MONTHS = {
  yanvar:1, januar:1, january:1, январ:1,
  fevral:2, februar:2, february:2, феврал:2,
  mart:3, march:3, март:3,
  aprel:4, april:4, апрел:4,
  may:5, mayis:5, май:5,
  iyun:6, june:6, июн:6,
  iyul:7, july:7, июл:7,
  avgust:8, august:8, август:8,
  sentabr:9, sentyabr:9, september:9, сентябр:9,
  oktabr:10, october:10, октябр:10,
  noyabr:11, november:11, ноябр:11,
  dekabr:12, december:12, декабр:12
};
function monitoringPeriodToMonth(value) {
  const n = normalizeMonitorText(value);
  const year = Number(n.match(/\b(20\d{2})\b/)?.[1] || 0);
  if (!year) return '';
  let month = 0;
  const numeric = n.match(/(?:20\d{2})\s*[\/.\-]\s*(\d{1,2})/) || n.match(/\b(\d{1,2})\s*[\/.\-]\s*(?:20\d{2})\b/);
  if (numeric) month = Number(numeric[1]);
  if (!month) for (const [name, no] of Object.entries(MONITOR_MONTHS)) if (n.includes(name)) { month = no; break; }
  return month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2,'0')}` : '';
}
function monitoringStatusGroup(status) {
  const n = normalizeMonitorText(status);
  if (!n) return 'unknown';
  if (n.includes('rad') || n.includes('xato') || n.includes('qabul qilinm') || n.includes('error') || n.includes('rejected') || n.includes('bekor')) return 'problem';
  if ((n.includes('qabul qilin') || n.includes('accepted')) && (n.includes("o'z vaqtida") || n.includes('oz vaqtida') || n.includes('on time'))) return 'accepted_on_time';
  if ((n.includes('qabul qilin') || n.includes('accepted')) && (n.includes('kech') || n.includes('late'))) return 'accepted_late';
  if (n.includes('qabul qilin') || n.includes('accepted')) return 'accepted';
  if (n.includes('tekshiril') || n.includes('kutil') || n.includes('pending') || n.includes('jarayon')) return 'pending';
  return 'unknown';
}
function monitoringMonthFromIso(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SOLIQ_MONITOR_CONTROL_TIMEZONE, year:'numeric', month:'2-digit' }).formatToParts(d);
    const y = parts.find(x => x.type === 'year')?.value;
    const m = parts.find(x => x.type === 'month')?.value;
    return y && m ? `${y}-${m}` : '';
  } catch (_) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }
}
function monitoringControlMonth(report = {}) {
  if (SOLIQ_MONITOR_CONTROL_MONTH_MODE === 'report_period') return report.period || monitoringMonthFromIso(report.sentAt) || monitoringMonthFromIso(report.checkedAt);
  // Default: Nazorat jadvali bajarish/topshirish oyini ko'rsatadi. Masalan Avgust hisoboti 11-sentabrda topshirilsa -> Sentabr jadvali.
  return monitoringMonthFromIso(report.sentAt) || monitoringMonthFromIso(report.checkedAt) || report.period || '';
}
function monitoringAcceptedGroup(group) {
  return ['accepted_on_time','accepted','accepted_late'].includes(String(group || ''));
}
function parseSoliqMonitoringText(text) {
  const raw = String(text || '').replace(/\r\n/g,'\n').replace(/\r/g,'\n').trim();
  if (!raw) return null;
  const tin = (raw.match(/(?:STIR|ИНН|TIN)\s*[:№#-]?\s*(\d{9,12})/i) || [])[1] || '';
  if (!tin) return null;
  const firstLines = raw.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,5);
  let companyName = '';
  for (const line of firstLines) {
    const m = line.match(/(?:hisobotlar|отч[её]т[^—-]*)\s*[—-]\s*(.+)$/i);
    if (m) { companyName = cleanText(m[1]); break; }
  }
  const reportBlocks = raw.match(/(?:^|\n)\s*\d+\.\s*[\s\S]*?(?=(?:\n\s*\d+\.\s*)|$)/g) || [];
  const reports = [];
  for (const chunk of reportBlocks) {
    const lines = chunk.replace(/^\s*\d+\.\s*/, '').split('\n').map(x=>x.trim()).filter(Boolean);
    if (!lines.length) continue;
    const name = cleanText(lines.shift());
    let periodRaw = '', sentRaw = '', status = '', checkedRaw = '';
    for (const line of lines) {
      const norm = normalizeMonitorText(line);
      const val = line.includes(':') ? line.slice(line.indexOf(':') + 1).trim() : '';
      if (/^(yil\s*\/\s*davr|yil davr|period|davr)\b/.test(norm)) periodRaw = val;
      else if (/^(jo'?natilgan sana|yuborilgan sana|sent date)\b/.test(norm)) sentRaw = val;
      else if (/^(holati|status)\b/.test(norm)) status = val;
      else if (/^(tekshirilgan sana|tekshirildi|checked date)\b/.test(norm)) checkedRaw = val;
    }
    const period = monitoringPeriodToMonth(periodRaw);
    reports.push({ name, periodRaw, period, sentAt: monitorDateIso(sentRaw), sentRaw, status, statusGroup: monitoringStatusGroup(status), checkedAt: monitorDateIso(checkedRaw), checkedRaw, rawBlock: chunk.trim() });
  }
  if (!reports.length) return null;
  return { tin, companyName, reports, rawText: raw };
}
function monitoringForwardBotId(message = {}) {
  const origin = message.forward_origin || {};
  return String(origin?.sender_user?.is_bot ? origin.sender_user.id : message.forward_from?.is_bot ? message.forward_from.id : '');
}
function monitoringSourceAllowed(message = {}) {
  const chatId = String(message.chat?.id || '');
  const senderBotId = String(message.from?.is_bot ? message.from.id : '');
  const forwardBotId = monitoringForwardBotId(message);
  if (SOLIQ_MONITOR_CHAT_IDS.length && !SOLIQ_MONITOR_CHAT_IDS.includes(chatId)) return false;
  if (SOLIQ_MONITOR_SOURCE_BOT_IDS.length) return SOLIQ_MONITOR_SOURCE_BOT_IDS.includes(senderBotId) || SOLIQ_MONITOR_SOURCE_BOT_IDS.includes(forwardBotId);
  if (senderBotId) return true;
  if (SOLIQ_MONITOR_ALLOW_USER_FORWARD && forwardBotId) return true;
  return false;
}
function isMonitoringTextCandidate(text) {
  const n = normalizeMonitorText(text);
  return !!(n && /(?:stir|inn|tin)\s*:?\s*\d{9,12}/.test(n) && (n.includes('hisobot') || n.includes('otchet')) && (n.includes('holati') || n.includes('status')));
}
function monitoringDedupeKey(meta, tin, report) {
  if (meta?.eventId) return createHash('sha256').update(`direct-event|${String(meta.eventId)}`).digest('hex');
  const base = [meta.source || 'telegram', meta.chatId || '', meta.messageId || '', tin || '', normalizeMonitorText(report.name), report.period || '', report.sentAt || report.sentRaw || '', normalizeMonitorText(report.status)].join('|');
  return createHash('sha256').update(base).digest('hex');
}
function monitoringTableMissing(error) {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  return error?.code === '42P01' || error?.code === 'PGRST205' || msg.includes('monitoring_imports') && (msg.includes('not found') || msg.includes('does not exist'));
}
async function monitoringMappings() {
  const { data, error } = await supabase.from('monitoring_report_mappings').select('*').eq('is_active', true).order('priority', { ascending: true });
  if (error) {
    if (monitoringTableMissing(error)) return [];
    throw error;
  }
  return data || [];
}
function monitoringMappingMatches(mapping, reportName) {
  const name = normalizeMonitorText(reportName);
  const pattern = normalizeMonitorText(mapping.report_pattern || '');
  if (!pattern) return false;
  const mode = String(mapping.match_mode || 'contains').toLowerCase();
  if (mode === 'exact') return name === pattern;
  if (mode === 'regex') { try { return new RegExp(mapping.report_pattern, 'i').test(reportName); } catch (_) { return false; } }
  return name.includes(pattern);
}
function chooseAutoControlItem(reportName, items) {
  const report = normalizeMonitorText(reportName);
  const arr = Array.isArray(items) ? items : [];
  const scored = arr.map(item => {
    const itemName = normalizeMonitorText(item.name);
    let score = 0;
    if (report.includes('jismoniy shaxslardan') && report.includes('ijtimoiy soliq') && (itemName.includes('jshods') || itemName.includes('ijtimoiy'))) score = 100;
    else if (report.includes('aylanmadan olinadigan soliq') && (itemName.includes('aylanma') || itemName.includes('ediniy'))) score = 95;
    else if ((report.includes("qo'shilgan qiymat") || report.includes('qqs') || report.includes('nds')) && (itemName.includes('qqs') || itemName.includes('nds') || itemName.includes("qo'shilgan qiymat"))) score = 95;
    else if (!report.includes('ijarasi') && report.includes('mol-mulk soligi') && itemName.includes('mol-mulk')) score = 90;
    else if (report.includes('yer soligi') && itemName.includes('yer soligi')) score = 90;
    else if ((report.includes('suv resurs') || report.includes('suv soligi')) && itemName.includes('suv')) score = 90;
    else if (itemName.length > 4 && (report.includes(itemName) || itemName.includes(report.slice(0, Math.min(report.length, 30))))) score = 50;
    return { item, score };
  }).sort((a,b)=>b.score-a.score);
  return scored[0]?.score >= 50 ? scored[0].item : null;
}
async function matchMonitoringControlItem(reportName) {
  const items = await readControlItems().catch(() => normalizeControlItems(DEFAULT_CONTROL_ITEMS));
  const mappings = await monitoringMappings();
  const mapping = mappings.find(m => monitoringMappingMatches(m, reportName)) || null;
  let item = null;
  if (mapping) {
    item = items.find(x => mapping.control_item_id && String(x.id) === String(mapping.control_item_id)) ||
      items.find(x => mapping.control_item_name && normalizeMonitorText(x.name) === normalizeMonitorText(mapping.control_item_name)) ||
      items.find(x => mapping.control_item_name && normalizeMonitorText(x.name).includes(normalizeMonitorText(mapping.control_item_name)));
  }
  if (!item) item = chooseAutoControlItem(reportName, items);
  return { item, mapping };
}
async function findMonitoringCompany(tin) {
  const { data, error } = await supabase.from('companies').select('*').eq('tin', String(tin || '')).maybeSingle();
  if (error) throw error;
  return data || null;
}
function monitoringAssigneeAllowed(user) {
  if (!user) return false;
  if (SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS.length && SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS.includes(String(user.id))) return true;
  if (!SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES.length && !SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS.length) return true;
  const name = normalizeMonitorText(user.full_name || '');
  return SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES.some(x => name.includes(normalizeMonitorText(x)));
}
async function monitoringDefaultAssignee() {
  if (SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS.length) {
    for (const id of SOLIQ_MONITOR_AUTO_ASSIGNEE_IDS) {
      const user = await getById('app_users', id).catch(()=>null);
      if (user?.is_active) return user;
    }
  }
  const users = await fetchAllRows('app_users', '*', { eq: [['role','employee'], ['is_active', true]], order: { column: 'created_at', ascending: true } });
  return users.find(monitoringAssigneeAllowed) || null;
}
async function findMonitoringTask(companyId, item, period) {
  const tasks = await fetchAllRows('tasks', '*', { eq: [['company_id', companyId]], order: { column: 'created_at', ascending: false } });
  const itemNorm = normalizeMonitorText(item?.name || '');
  const exact = tasks.filter(t => {
    const marker = extractControlMarkerParts([t.director_note, t.description, t.title].filter(Boolean).join('\n'));
    if (!marker || marker.month !== period) return false;
    if (item?.id && marker.bandId && String(marker.bandId) === String(item.id)) return true;
    return itemNorm && normalizeMonitorText(marker.band || '').includes(itemNorm);
  });
  const fallback = exact.length ? exact : tasks.filter(t => {
    const title = normalizeMonitorText(`${t.title || ''} ${t.type || ''}`);
    return t.deadline?.startsWith(period) && itemNorm && (title.includes(itemNorm) || itemNorm.includes(normalizeMonitorText(t.type || '')));
  });
  return fallback.sort((a,b) => {
    const ad = isTaskDoneServer(a.status) ? 1 : 0, bd = isTaskDoneServer(b.status) ? 1 : 0;
    return ad - bd || String(b.created_at || '').localeCompare(String(a.created_at || ''));
  })[0] || null;
}
function monitoringControlMarker(period, item) {
  return ['[NazoratJadvali]', `Oy: ${period}`, `Band: ${item.name}`, `BandID: ${item.id}`, 'Manba: My Soliq Monitoring'].join('\n');
}
function monitoringDefaultDeadline(period, item) {
  const [y,m] = String(period || '').split('-').map(Number);
  if (!y || !m) return null;
  const maxDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2,'0')}-${String(Math.min(maxDay, Math.max(1, Number(item?.defaultDay || 15)))).padStart(2,'0')}`;
}
async function createMonitoringTask(company, item, period, assignee, report) {
  const actorId = await defaultActorId().catch(()=>null);
  const marker = monitoringControlMarker(period, item);
  const note = `${marker}\nHisobot davri: ${report.period || report.periodRaw || '-'}\nTashqi holat: ${report.status || '-'}\nJo‘natilgan: ${report.sentRaw || report.sentAt || '-'}\nTekshirilgan: ${report.checkedRaw || report.checkedAt || '-'}`;
  const payload = {
    company_id: company.id, assignee_id: assignee?.id || null, template_id: null,
    title: `[Nazorat] ${item.name} — ${company.name}`, type: item.name,
    deadline: monitoringDefaultDeadline(period, item), priority: 'Muhim', status: 'Yangi',
    description: `My Soliq Monitoring orqali aniqlangan nazorat topshirig‘i. Davr: ${period}.`,
    employee_note: '', director_note: note, is_quick: false, is_active: true,
    created_by: actorId || null, completed_at: null
  };
  const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
  if (error) throw error;
  await addTaskHistory(data.id, actorId, 'My Soliq Monitoring orqali nazorat topshirig‘i yaratildi', null, data.status, report.status || '');
  return data;
}
function monitoringHistoryNote(report) {
  return [`My Soliq Monitoring`, `Hisobot: ${report.name}`, `Davr: ${report.period || report.periodRaw || '-'}`, `Tashqi holat: ${report.status || '-'}`, `Jo‘natilgan: ${report.sentRaw || report.sentAt || '-'}`, `Tekshirilgan: ${report.checkedRaw || report.checkedAt || '-'}`].join('\n');
}
async function autoCompleteMonitoringTask(task, report) {
  const oldStatus = task.status;
  if (isTaskDoneServer(oldStatus) && (oldStatus === SOLIQ_MONITOR_AUTO_STATUS || oldStatus === 'Direktor tasdiqladi')) return { task, action: 'already_done' };
  const marker = extractControlMarkerBlockFromTask(task);
  const sourceNote = monitoringHistoryNote(report);
  const directorNote = appendControlMarkerIfMissing([stripMonitoringAutoNote(task.director_note || ''), sourceNote].filter(Boolean).join('\n\n'), marker);
  const payload = { status: SOLIQ_MONITOR_AUTO_STATUS, director_note: directorNote, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('tasks').update(payload).eq('id', task.id).select('*').single();
  if (error) throw error;
  await addTaskHistory(task.id, task.assignee_id || null, 'My Soliq Monitoring orqali avtomatik bajarildi/tasdiqlandi', oldStatus, data.status, sourceNote);
  if (SOLIQ_MONITOR_NOTIFY_CUSTOMER && data.status === 'Direktor tasdiqladi') notifyCustomerTaskDone(data).catch(()=>{});
  return { task: data, action: data.status === 'Direktor tasdiqladi' ? 'auto_approved' : 'auto_completed' };
}
function stripMonitoringAutoNote(note) {
  const raw = String(note || '');
  const idx = raw.indexOf('\nMy Soliq Monitoring\n');
  return idx >= 0 ? raw.slice(0, idx).trim() : raw.trim();
}
async function notifyMonitoringProblem({ company, task, assignee, report }) {
  if (!SOLIQ_MONITOR_NOTIFY_PROBLEMS) return;
  const directorsRes = await supabase.from('app_users').select('*').eq('role','director').eq('is_active',true).not('telegram_chat_id','is',null);
  const text = ['🚨 My Soliq Monitoring — muammoli holat', '', `Korxona: ${company?.name || '-'}`, `STIR: ${company?.tin || '-'}`, `Hisobot: ${report.name || '-'}`, `Davr: ${report.period || report.periodRaw || '-'}`, `Holat: ${report.status || '-'}`, task ? `Topshiriq: ${task.title}` : 'Topshiriq: mos topshiriq topilmadi', assignee ? `Mas’ul: ${assignee.full_name}` : 'Mas’ul: aniqlanmadi'].join('\n');
  const targets = new Set();
  if (assignee?.telegram_chat_id) targets.add(String(assignee.telegram_chat_id));
  for (const d of directorsRes.data || []) if (d.telegram_chat_id) targets.add(String(d.telegram_chat_id));
  await Promise.all([...targets].map(id => sendTelegramMessage(id, text).catch(()=>{})));
  if (task) await addTaskHistory(task.id, null, 'My Soliq Monitoring muammoli holat haqida ogohlantirdi', task.status, task.status, monitoringHistoryNote(report));
}
async function upsertMonitoringImportBase(meta, parsed, report, force = false) {
  const dedupeKey = monitoringDedupeKey(meta, parsed.tin, report);
  const existingRes = await supabase.from('monitoring_imports').select('*').eq('dedupe_key', dedupeKey).maybeSingle();
  if (existingRes.error) {
    if (monitoringTableMissing(existingRes.error)) throw new Error('Stage 8.4.1 Supabase migration bajarilmagan: monitoring_imports jadvali topilmadi');
    throw existingRes.error;
  }
  if (existingRes.data && !force) return { row: existingRes.data, duplicate: true };
  const base = {
    source: meta.source || 'telegram', source_chat_id: meta.chatId || null, source_message_id: meta.messageId ? String(meta.messageId) : null,
    source_sender_id: meta.senderId ? String(meta.senderId) : null, company_tin: parsed.tin, company_name_raw: parsed.companyName || null,
    event_type: 'accepted_report', event_id: meta.eventId || null,
    report_name_raw: report.name, report_period: report.period || null, control_month: monitoringControlMonth(report) || null, sent_at: report.sentAt || null, checked_at: report.checkedAt || null,
    external_status: report.status || null, status_group: report.statusGroup || 'unknown', raw_text: parsed.rawText,
    raw_payload: meta.rawPayload || {}, dedupe_key: dedupeKey, processed_at: null, auto_action: 'received', error_message: null
  };
  if (existingRes.data) {
    const { data, error } = await supabase.from('monitoring_imports').update(base).eq('id', existingRes.data.id).select('*').single();
    if (error) throw error;
    return { row: data, duplicate: false };
  }
  const { data, error } = await supabase.from('monitoring_imports').insert(base).select('*').single();
  if (error) {
    if (error.code === '23505') {
      const d = await supabase.from('monitoring_imports').select('*').eq('dedupe_key', dedupeKey).maybeSingle();
      return { row: d.data, duplicate: true };
    }
    throw error;
  }
  return { row: data, duplicate: false };
}
async function updateMonitoringImport(id, patch) {
  const { data, error } = await supabase.from('monitoring_imports').update({ ...patch, processed_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}
async function processMonitoringReport(meta, parsed, report, { force = false } = {}) {
  const base = await upsertMonitoringImportBase(meta, parsed, report, force);
  if (base.duplicate && !force) return { duplicate: true, import: base.row };
  const row = base.row;
  try {
    const company = await findMonitoringCompany(parsed.tin);
    if (!company) return { import: await updateMonitoringImport(row.id, { auto_action:'company_not_found', error_message:`STIR ${parsed.tin} bo‘yicha korxona topilmadi` }) };
    const { item, mapping } = await matchMonitoringControlItem(report.name);
    if (!item) return { import: await updateMonitoringImport(row.id, { matched_company_id:company.id, auto_action:'mapping_not_found', error_message:'Hisobot Nazorat jadvali bandiga mapping qilinmadi' }) };

    // Nazorat jadvali oyi default bo'yicha real topshirilgan sana oyidan olinadi.
    // Masalan: 2026/Avgust hisobot 11.09.2026 da topshirilgan -> 2026-09 Nazorat jadvali.
    const controlMonth = monitoringControlMonth(report);
    let task = await findMonitoringTask(company.id, item, controlMonth);
    let assignee = task?.assignee_id ? await getById('app_users', task.assignee_id).catch(()=>null) : null;
    let created = false;
    if (!task && SOLIQ_MONITOR_CREATE_MISSING_TASK && controlMonth) {
      assignee = await monitoringDefaultAssignee();
      // Qabul qilingan fakt Nazorat jadvalida aks etishi uchun default xodim topilmasa ham tizim topshirig'ini assigneesiz yarata oladi.
      task = await createMonitoringTask(company, item, controlMonth, assignee, report);
      created = true;
    }
    if (!task) return { import: await updateMonitoringImport(row.id, { matched_company_id:company.id, matched_control_item_id:item.id, matched_control_item_name:item.name, mapping_id:mapping?.id || null, auto_action:'task_not_found', error_message:`Mos nazorat topshirig‘i topilmadi (Nazorat oyi: ${controlMonth || '-'})` }) };
    if (!assignee && task.assignee_id) assignee = await getById('app_users', task.assignee_id).catch(()=>null);
    const common = { matched_company_id:company.id, matched_control_item_id:item.id, matched_control_item_name:item.name, mapping_id:mapping?.id || null, matched_task_id:task.id, assignee_id:assignee?.id || null, control_month:controlMonth || null };

    // Hotfix 2: My Soliq tashqi manbada hisobot qabul qilingan bo'lsa, bu bajarilganlikning faktik tasdig'i.
    // Shuning uchun topshiriq kimga biriktirilganidan qat'i nazar Nazorat jadvalida Tasdiqlandi bo'ladi; mas'ul xodim o'zgartirilmaydi.
    if (monitoringAcceptedGroup(report.statusGroup)) {
      if (!SOLIQ_MONITOR_ACCEPTED_SYNC_ANY_ASSIGNEE && !monitoringAssigneeAllowed(assignee)) {
        return { import: await updateMonitoringImport(row.id, { ...common, auto_action:'assignee_mismatch', error_message:`Topshiriq ${assignee?.full_name || 'boshqa xodim'}ga biriktirilgan; ENV bo‘yicha avtomatik tasdiqlash cheklangan` }) };
      }
      const done = await autoCompleteMonitoringTask(task, report);
      const lateNote = report.statusGroup === 'accepted_late' ? 'Hisobot qabul qilingan, lekin kechikib topshirilgan' : null;
      const syncNote = controlMonth && report.period && controlMonth !== report.period ? `Hisobot davri ${report.period}; Nazorat jadvali oyi ${controlMonth} (jo‘natilgan sana bo‘yicha)` : null;
      return { import: await updateMonitoringImport(row.id, { ...common, auto_action: created ? `created_${done.action}` : done.action, error_message: [lateNote, syncNote].filter(Boolean).join(' · ') || null }), task: done.task, controlMonth };
    }

    // Muammoli hisobot bo'lsa aynan biriktirilgan xodim va direktor ogohlantiriladi.
    if (report.statusGroup === 'problem') {
      await notifyMonitoringProblem({ company, task, assignee, report });
      return { import: await updateMonitoringImport(row.id, { ...common, auto_action:'problem_notified', error_message:report.status || 'Muammoli holat' }), controlMonth };
    }
    return { import: await updateMonitoringImport(row.id, { ...common, auto_action:'no_status_action', error_message:`Tashqi holat avtomatik yopish uchun yetarli emas. Nazorat oyi: ${controlMonth || '-'}` }), controlMonth };
  } catch (err) {
    await updateMonitoringImport(row.id, { auto_action:'error', error_message:err.message || 'Import xatosi' }).catch(()=>{});
    throw err;
  }
}
async function processSoliqMonitoringText(text, meta = {}, options = {}) {
  const parsed = parseSoliqMonitoringText(text);
  if (!parsed) return { ok:false, handled:false, reason:'format_not_recognized' };
  const results = [];
  for (const report of parsed.reports) results.push(await processMonitoringReport(meta, parsed, report, options));
  invalidateBootstrapCache();
  return { ok:true, handled:true, tin:parsed.tin, companyName:parsed.companyName, reports:parsed.reports.length, results };
}
async function maybeProcessSoliqMonitoringTelegram(message, update = {}) {
  if (!SOLIQ_MONITOR_ENABLED) return { handled:false, reason:'disabled' };
  const text = telegramMessageText(message);
  if (!isMonitoringTextCandidate(text)) return { handled:false, reason:'not_monitoring_text' };
  if (!monitoringSourceAllowed(message)) return { handled:true, ok:false, reason:'source_not_allowed' };
  return await processSoliqMonitoringText(text, {
    source:'telegram', chatId:String(message.chat?.id || ''), messageId:String(message.message_id || ''), senderId:String(message.from?.id || monitoringForwardBotId(message) || ''), rawPayload:update
  });
}
function monitorImportSecretAllowed(req) {
  if (!SOLIQ_MONITOR_IMPORT_SECRET) return true;
  return String(req.headers['x-soliq-monitor-secret'] || req.body?.secret || '') === SOLIQ_MONITOR_IMPORT_SECRET;
}
app.get('/api/soliq-monitor/summary', async (req, res) => {
  try {
    ensureDb();
    const since = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const groups = ['accepted_on_time','accepted','accepted_late','problem','pending','unknown','paid','rejected'];
    const queries = groups.map(g => supabase.from('monitoring_imports').select('id',{count:'exact',head:true}).gte('created_at',since).eq('status_group',g));
    const [totalRes, ...groupRes] = await Promise.all([supabase.from('monitoring_imports').select('id',{count:'exact',head:true}).gte('created_at',since), ...queries]);
    if (totalRes.error) throw totalRes.error;
    const counts = Object.fromEntries(groups.map((g,i)=>[g, groupRes[i]?.count || 0]));
    const { count: unmatched = 0 } = await supabase.from('monitoring_imports').select('id',{count:'exact',head:true}).gte('created_at',since).is('matched_task_id',null);
    return res.json({ ok:true, data:{ enabled:SOLIQ_MONITOR_ENABLED, periodDays:30, total:totalRes.count||0, ...counts, unmatched, autoStatus:SOLIQ_MONITOR_AUTO_STATUS, createMissingTask:SOLIQ_MONITOR_CREATE_MISSING_TASK, autoAssigneeNames:SOLIQ_MONITOR_AUTO_ASSIGNEE_NAMES, controlMonthMode:SOLIQ_MONITOR_CONTROL_MONTH_MODE, acceptedSyncAnyAssignee:SOLIQ_MONITOR_ACCEPTED_SYNC_ANY_ASSIGNEE } });
  } catch (err) { return handleError(res, err); }
});
app.post('/api/soliq-monitor/sync-accepted', async (req, res) => {
  try {
    ensureDb();
    const limit = Math.min(2000, Math.max(10, Number(req.body?.limit || 1000)));
    const { data, error } = await supabase.from('monitoring_imports').select('*')
      .in('status_group', ['accepted_on_time','accepted','accepted_late'])
      .order('created_at', { ascending:false }).limit(limit);
    if (error) throw error;
    const unique = new Map();
    for (const row of data || []) {
      if (!row.raw_text) continue;
      const key = `${row.source || ''}|${row.source_chat_id || ''}|${row.source_message_id || ''}|${createHash('sha1').update(String(row.raw_text)).digest('hex')}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    let messages = 0, reports = 0, failed = 0;
    const errors = [];
    for (const row of unique.values()) {
      try {
        const result = await processSoliqMonitoringText(row.raw_text, {
          source:row.source || 'resync', chatId:row.source_chat_id || '', messageId:row.source_message_id || row.id,
          senderId:row.source_sender_id || '', rawPayload:row.raw_payload || {}
        }, { force:true });
        if (result?.handled) { messages++; reports += Number(result.reports || 0); }
      } catch (err) {
        failed++; if (errors.length < 10) errors.push(err.message || String(err));
      }
    }
    invalidateBootstrapCache();
    return res.json({ ok:true, messages, reports, failed, errors, controlMonthMode:SOLIQ_MONITOR_CONTROL_MONTH_MODE });
  } catch (err) { return handleError(res, err); }
});

app.get('/api/soliq-monitor/imports', async (req, res) => {
  try {
    ensureDb();
    const limit = Math.min(500, Math.max(10, Number(req.query.limit || 200)));
    let q = supabase.from('monitoring_imports').select('*').order('created_at',{ascending:false}).limit(limit);
    if (req.query.statusGroup) q = q.eq('status_group', cleanText(req.query.statusGroup));
    if (req.query.tin) q = q.eq('company_tin', onlyDigits(req.query.tin));
    const { data, error } = await q;
    if (error) throw error;
    return res.json({ ok:true, data:data || [] });
  } catch (err) { return handleError(res, err); }
});
app.post('/api/soliq-monitor/import-text', async (req, res) => {
  try {
    ensureDb();
    if (!monitorImportSecretAllowed(req)) return res.status(403).json({ok:false,error:'Import siri noto‘g‘ri'});
    const text = String(req.body?.text || '');
    const result = await processSoliqMonitoringText(text, { source:'manual', chatId:'manual', messageId:String(Date.now()), senderId:req.body?.actorId || '', rawPayload:{manual:true} }, { force:!!req.body?.force });
    if (!result.handled) return res.status(400).json({ok:false,error:'My Soliq Monitoring formati aniqlanmadi'});
    return res.json(result);
  } catch (err) { return handleError(res, err); }
});
app.post('/api/soliq-monitor/imports/:id/reprocess', async (req, res) => {
  try {
    ensureDb();
    const { data, error } = await supabase.from('monitoring_imports').select('*').eq('id',req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ok:false,error:'Import yozuvi topilmadi'});
    let result;
    if (String(data.event_type || '') === 'tax_payment' && data.raw_payload && typeof data.raw_payload === 'object') {
      result = await processDirectSoliqEvent(data.raw_payload, { force:true });
    } else if (String(data.source || '') === 'direct_api' && data.raw_payload && typeof data.raw_payload === 'object') {
      result = await processDirectSoliqEvent(data.raw_payload, { force:true });
    } else {
      result = await processSoliqMonitoringText(data.raw_text || '', { source:data.source || 'reprocess', chatId:data.source_chat_id || '', messageId:data.source_message_id || data.id, senderId:data.source_sender_id || '', rawPayload:data.raw_payload || {} }, { force:true });
    }
    return res.json(result);
  } catch (err) { return handleError(res, err); }
});
app.get('/api/soliq-monitor/mappings', async (req, res) => {
  try {
    ensureDb();
    const { data, error } = await supabase.from('monitoring_report_mappings').select('*').order('priority',{ascending:true}).order('created_at',{ascending:true});
    if (error) throw error;
    return res.json({ok:true,data:data || []});
  } catch (err) { return handleError(res, err); }
});
app.post('/api/soliq-monitor/mappings', async (req, res) => {
  try {
    ensureDb();
    const payload = {
      report_pattern: cleanText(req.body?.reportPattern || req.body?.report_pattern),
      match_mode: ['contains','exact','regex'].includes(String(req.body?.matchMode || req.body?.match_mode || 'contains')) ? String(req.body?.matchMode || req.body?.match_mode || 'contains') : 'contains',
      control_item_id: cleanText(req.body?.controlItemId || req.body?.control_item_id) || null,
      control_item_name: cleanText(req.body?.controlItemName || req.body?.control_item_name) || null,
      is_active: req.body?.isActive === undefined ? true : !!req.body.isActive,
      priority: Number(req.body?.priority || 100), updated_at:new Date().toISOString()
    };
    if (!payload.report_pattern) return res.status(400).json({ok:false,error:'Hisobot patterni kerak'});
    let query;
    if (req.body?.id) query = supabase.from('monitoring_report_mappings').update(payload).eq('id',req.body.id).select('*').single();
    else query = supabase.from('monitoring_report_mappings').insert(payload).select('*').single();
    const { data, error } = await query;
    if (error) throw error;
    return res.json({ok:true,data});
  } catch (err) { return handleError(res, err); }
});
app.delete('/api/soliq-monitor/mappings/:id', async (req, res) => {
  try {
    ensureDb();
    const { error } = await supabase.from('monitoring_report_mappings').delete().eq('id',req.params.id);
    if (error) throw error;
    return res.json({ok:true});
  } catch (err) { return handleError(res, err); }
});


// ================= Stage 8.4.2 — Unified Soliq Integration / Direct API =================
function directEventStatusGroup(eventType, value) {
  const n = normalizeMonitorText(value);
  if (eventType === 'tax_payment') {
    if (n.includes('rad') || n.includes('rejected') || n.includes('bekor') || n.includes('xato')) return 'rejected';
    if (n.includes("to'langan") || n.includes('tolangan') || n.includes('тўланган') || n.includes('туланган') || n.includes('paid') || n.includes('оплачен')) return 'paid';
    if (n.includes('kutil') || n.includes('pending') || n.includes('jarayon')) return 'pending';
    return 'unknown';
  }
  return monitoringStatusGroup(value);
}
function directDateOnly(value) {
  const raw = String(value || '').trim();
  const iso = raw.match(/^(20\d{2})-(\d{2})-(\d{2})/)?.[0];
  if (iso) return iso;
  const m = raw.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})/);
  return m ? `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}` : '';
}
function directControlMonthFromDate(value) {
  const d = directDateOnly(value);
  return d ? d.slice(0,7) : '';
}
function directEventId(event) {
  const supplied = cleanText(event?.event_id || event?.eventId || '');
  if (supplied) return supplied;
  return createHash('sha256').update(JSON.stringify(event || {})).digest('hex');
}
function directEventCompany(event) {
  const c = event?.company || {};
  return {
    tin: cleanText(c.tin || c.stir || event?.company_tin || event?.tin || ''),
    name: cleanText(c.name || event?.company_name || '')
  };
}
function structuredReportFromEvent(event) {
  const d = event?.data || {};
  const year = cleanText(d.year || '');
  const periodName = cleanText(d.period || '');
  const periodRaw = [year, periodName].filter(Boolean).join(' / ');
  let period = monitoringPeriodToMonth(periodRaw);
  if (!period && /^20\d{2}-\d{2}$/.test(periodName)) period = periodName;
  const sentRaw = cleanText(d.sent_at_raw || d.sent_at || '');
  const checkedRaw = cleanText(d.checked_at_raw || d.checked_at || '');
  const sentAt = d.sent_at && /^20\d{2}-/.test(String(d.sent_at)) ? String(d.sent_at) : monitorDateIso(sentRaw);
  const checkedAt = d.checked_at && /^20\d{2}-/.test(String(d.checked_at)) ? String(d.checked_at) : monitorDateIso(checkedRaw);
  const status = cleanText(d.external_status || d.status || '');
  return {
    name: cleanText(d.name || d.report_name || ''), periodRaw, period,
    sentAt: sentAt || null, sentRaw: sentRaw || String(d.sent_at || ''), status,
    statusGroup: cleanText(d.status_group || '') || monitoringStatusGroup(status),
    checkedAt: checkedAt || null, checkedRaw: checkedRaw || String(d.checked_at || ''),
    rawBlock: JSON.stringify(d)
  };
}
async function monitoringTaxMappings() {
  const { data, error } = await supabase.from('monitoring_tax_mappings').select('*').eq('is_active', true).order('priority', { ascending:true }).order('created_at',{ascending:true});
  if (error) {
    if (monitoringTableMissing(error) || String(error?.message || '').includes('monitoring_tax_mappings')) return [];
    throw error;
  }
  return data || [];
}
function chooseAutoTaxControlItem(taxCode, taxName, items) {
  const code = String(taxCode || '').replace(/^0+/, '') || '0';
  const name = normalizeMonitorText(taxName || '');
  const arr = Array.isArray(items) ? items : [];
  const scoreItem = (item) => {
    const x = normalizeMonitorText(item.name || '');
    if (['46','36'].includes(code) && x.includes('jshods') && x.includes('ijtimoiy') && (x.includes("to'lov") || x.includes('tolov'))) return 120;
    if (code === '100' && x.includes('aylanma') && (x.includes("to'lov") || x.includes('tolov'))) return 115;
    if (code === '1' && (x.includes('nds') || x.includes('qqs') || x.includes("qo'shilgan qiymat"))) return 110;
    if (code === '44' && x.includes('mol-mulk')) return 105;
    if (code === '53' && x.includes('yer solig')) return 105;
    if (code === '52' && x.includes('suv')) return 105;
    if (code === '32' && x.includes('foyda')) return 105;
    if (name && x.length > 4 && (name.includes(x) || x.includes(name.slice(0, Math.min(name.length, 24))))) return 50;
    return 0;
  };
  const ranked = arr.map(item=>({item,score:scoreItem(item)})).sort((a,b)=>b.score-a.score);
  return ranked[0]?.score >= 50 ? ranked[0].item : null;
}
async function matchTaxPaymentControlItem(taxCode, taxName) {
  const code = String(taxCode || '').replace(/^0+/, '') || '0';
  const items = await readControlItems().catch(() => normalizeControlItems(DEFAULT_CONTROL_ITEMS));
  const mappings = await monitoringTaxMappings();
  const mapping = mappings.find(m => String(m.tax_code || '').replace(/^0+/, '') === code) || null;
  let item = null;
  if (mapping) {
    item = items.find(x => mapping.control_item_id && String(x.id) === String(mapping.control_item_id)) ||
      items.find(x => mapping.control_item_name && normalizeMonitorText(x.name) === normalizeMonitorText(mapping.control_item_name)) ||
      items.find(x => mapping.control_item_name && normalizeMonitorText(x.name).includes(normalizeMonitorText(mapping.control_item_name)));
  }
  if (!item) item = chooseAutoTaxControlItem(code, taxName, items);
  const requiredCodes = Array.isArray(mapping?.required_codes) && mapping.required_codes.length
    ? mapping.required_codes.map(x => String(x).replace(/^0+/, '') || '0')
    : (['46','36'].includes(code) ? ['46','36'] : [code]);
  return { item, mapping, requiredCodes, groupKey: mapping?.group_key || (['46','36'].includes(code) ? 'payroll_taxes' : `tax_${code}`) };
}
function paymentEvidenceNote(data, requiredCodes = []) {
  return [
    'My Soliq Monitoring · Soliq to‘lovi',
    `Soliq: ${data.tax_code || '-'} — ${data.tax_name || '-'}`,
    `Topshiriqnoma: ${data.payment_no || '-'}`,
    `To‘lov sanasi: ${data.payment_date || '-'}`,
    `Summa: ${data.amount_raw || data.amount || '-'}`,
    `Holat: ${data.external_status || '-'}`,
    requiredCodes.length > 1 ? `To‘liq tasdiq uchun kodlar: ${requiredCodes.join(', ')}` : ''
  ].filter(Boolean).join('\n');
}
async function upsertTaxPaymentImport(event, meta, companyInfo, data, statusGroup, controlMonth) {
  const eventId = directEventId(event);
  const dedupeKey = createHash('sha256').update(`direct-event|${eventId}`).digest('hex');
  const existing = await supabase.from('monitoring_imports').select('*').eq('dedupe_key',dedupeKey).maybeSingle();
  if (existing.error) throw existing.error;
  const base = {
    source: meta.source || 'direct_api', source_chat_id:null, source_message_id:eventId, source_sender_id:'soliq-monitor',
    event_type:'tax_payment', event_id:eventId,
    company_tin:companyInfo.tin, company_name_raw:companyInfo.name || null,
    report_name_raw:data.tax_name || `Soliq kodi ${data.tax_code || '-'}`, report_period:controlMonth || null, control_month:controlMonth || null,
    sent_at:data.payment_date ? `${data.payment_date}T00:00:00+05:00` : null, checked_at:event.observed_at || new Date().toISOString(),
    external_status:data.external_status || null, status_group:statusGroup,
    tax_code:String(data.tax_code || ''), tax_name_raw:data.tax_name || null, payment_no:data.payment_no || null,
    payment_date:data.payment_date || null, amount:data.amount === null || data.amount === undefined ? null : Number(data.amount), amount_raw:data.amount_raw || null,
    raw_text:JSON.stringify(event), raw_payload:event, dedupe_key:dedupeKey, processed_at:null, auto_action:'received', error_message:null
  };
  if (existing.data) {
    return { row:existing.data, duplicate:true };
  }
  const { data:row, error } = await supabase.from('monitoring_imports').insert(base).select('*').single();
  if (error) {
    if (error.code === '23505') {
      const dup = await supabase.from('monitoring_imports').select('*').eq('dedupe_key',dedupeKey).maybeSingle();
      return { row:dup.data, duplicate:true };
    }
    throw error;
  }
  return { row, duplicate:false };
}
async function latestTaxPaymentState(companyId, item, controlMonth, requiredCodes) {
  let q = supabase.from('monitoring_imports').select('tax_code,status_group,external_status,payment_no,payment_date,amount,amount_raw,created_at,id')
    .eq('event_type','tax_payment').eq('matched_company_id',companyId).eq('control_month',controlMonth)
    .order('created_at',{ascending:false}).limit(500);
  if (item?.id) q = q.eq('matched_control_item_id',String(item.id));
  else if (item?.name) q = q.eq('matched_control_item_name',String(item.name));
  const { data, error } = await q;
  if (error) throw error;
  const latest = new Map();
  for (const row of data || []) {
    const code = String(row.tax_code || '').replace(/^0+/, '') || '0';
    if (!latest.has(code)) latest.set(code,row);
  }
  const details = requiredCodes.map(code=>({code,row:latest.get(String(code)) || null}));
  const paidCount = details.filter(x=>x.row?.status_group === 'paid').length;
  return { details, paidCount, total:requiredCodes.length, complete:requiredCodes.length > 0 && paidCount === requiredCodes.length };
}
async function markTaskPartialFromTax(task, data, progress) {
  const oldStatus = task.status;
  let updated = task;
  if (!isTaskDoneServer(oldStatus) && ['Yangi','Qabul qilindi'].includes(oldStatus)) {
    const { data:row, error } = await supabase.from('tasks').update({status:'Bajarilmoqda',updated_at:new Date().toISOString()}).eq('id',task.id).select('*').single();
    if (error) throw error;
    updated = row;
  }
  const note = `${paymentEvidenceNote(data)}\nQisman: ${progress.paidCount}/${progress.total}`;
  await addTaskHistory(task.id, task.assignee_id || null, 'My Soliq Monitoring: soliq to‘lovi qisman bajarildi', oldStatus, updated.status, note);
  return updated;
}
async function processMonitoringTaxPayment(event, meta = {}, {force=false} = {}) {
  const companyInfo = directEventCompany(event);
  const d = event?.data || {};
  const data = {
    payment_no:cleanText(d.payment_no || ''), payment_date:directDateOnly(d.payment_date || d.order_date_raw || ''),
    tax_code:String(d.tax_code || '').replace(/^0+/, '') || '0', tax_name:cleanText(d.tax_name || ''),
    amount:d.amount === null || d.amount === undefined ? null : Number(d.amount), amount_raw:cleanText(d.amount_raw || ''),
    external_status:cleanText(d.external_status || d.status || ''), status_group:cleanText(d.status_group || '')
  };
  const statusGroup = ['paid','rejected','pending','unknown'].includes(data.status_group) ? data.status_group : directEventStatusGroup('tax_payment',data.external_status);
  const controlMonth = directControlMonthFromDate(data.payment_date || event.observed_at) || monitoringMonthFromIso(event.observed_at) || '';
  const base = await upsertTaxPaymentImport(event,meta,companyInfo,data,statusGroup,controlMonth);
  if (base.duplicate && !force && base.row?.processed_at) return {duplicate:true,import:base.row};
  const row = base.row;
  try {
    if (!companyInfo.tin) return { import: await updateMonitoringImport(row.id,{auto_action:'company_not_found',error_message:'STIR berilmagan'}) };
    const company = await findMonitoringCompany(companyInfo.tin);
    if (!company) return { import: await updateMonitoringImport(row.id,{auto_action:'company_not_found',error_message:`STIR ${companyInfo.tin} bo‘yicha korxona topilmadi`}) };
    const {item,mapping,requiredCodes,groupKey} = await matchTaxPaymentControlItem(data.tax_code,data.tax_name);
    if (!item) return { import: await updateMonitoringImport(row.id,{matched_company_id:company.id,auto_action:'mapping_not_found',error_message:`Soliq kodi ${data.tax_code} Nazorat bandiga mapping qilinmadi`}) };
    let task = await findMonitoringTask(company.id,item,controlMonth);
    let assignee = task?.assignee_id ? await getById('app_users',task.assignee_id).catch(()=>null) : null;
    let created=false;
    const pseudoReport={name:`Soliq to‘lovi: ${data.tax_code} — ${data.tax_name}`,period:controlMonth,periodRaw:controlMonth,status:data.external_status,statusGroup,sentAt:data.payment_date?`${data.payment_date}T00:00:00+05:00`:null,sentRaw:data.payment_date,checkedAt:event.observed_at||new Date().toISOString(),checkedRaw:event.observed_at||''};
    if (!task && SOLIQ_MONITOR_CREATE_MISSING_TASK && controlMonth) {
      assignee = await monitoringDefaultAssignee();
      task = await createMonitoringTask(company,item,controlMonth,assignee,pseudoReport);
      created=true;
    }
    if (!task) return { import: await updateMonitoringImport(row.id,{matched_company_id:company.id,matched_control_item_id:item.id,matched_control_item_name:item.name,tax_group_key:groupKey,auto_action:'task_not_found',error_message:`Mos nazorat topshirig‘i topilmadi (Nazorat oyi: ${controlMonth || '-'})`}) };
    if (!assignee && task.assignee_id) assignee=await getById('app_users',task.assignee_id).catch(()=>null);
    const common={matched_company_id:company.id,matched_control_item_id:item.id,matched_control_item_name:item.name,mapping_id:null,tax_mapping_id:mapping?.id||null,tax_group_key:groupKey,matched_task_id:task.id,assignee_id:assignee?.id||null,control_month:controlMonth};
    await updateMonitoringImport(row.id,{...common,auto_action:'received',error_message:null});
    if (statusGroup === 'rejected') {
      await notifyMonitoringProblem({company,task,assignee,report:pseudoReport});
      return {import:await updateMonitoringImport(row.id,{...common,auto_action:'payment_rejected_notified',error_message:data.external_status||'Bank tomonidan rad etilgan'}),controlMonth};
    }
    if (statusGroup !== 'paid') return {import:await updateMonitoringImport(row.id,{...common,auto_action:'payment_pending',error_message:`To‘lov holati: ${data.external_status||statusGroup}`}),controlMonth};
    const progress = await latestTaxPaymentState(company.id,item,controlMonth,requiredCodes);
    if (!progress.complete) {
      const updatedTask=await markTaskPartialFromTax(task,data,progress);
      return {import:await updateMonitoringImport(row.id,{...common,auto_action:`payment_partial_${progress.paidCount}_${progress.total}`,error_message:`Majburiy soliq kodlari: ${requiredCodes.join(', ')}. To‘langan: ${progress.paidCount}/${progress.total}`}),task:updatedTask,progress,controlMonth};
    }
    pseudoReport.status=`Bank tomonidan to‘langan · ${requiredCodes.join('+')}`;
    const done=await autoCompleteMonitoringTask(task,pseudoReport);
    return {import:await updateMonitoringImport(row.id,{...common,auto_action:created?`created_payment_${done.action}`:`payment_${done.action}`,error_message:`Tasdiqlangan soliq kodlari: ${requiredCodes.join(', ')}`}),task:done.task,progress,controlMonth};
  } catch (err) {
    await updateMonitoringImport(row.id,{auto_action:'error',error_message:err.message||'Tax payment import xatosi'}).catch(()=>{});
    throw err;
  }
}
async function processDirectSoliqEvent(event,{force=false}={}) {
  if (!event || typeof event !== 'object') throw new Error('Event JSON obyekt bo‘lishi kerak');
  const eventType=cleanText(event.event_type||event.type||'');
  const companyInfo=directEventCompany(event);
  if (!companyInfo.tin) throw new Error('company.tin/STIR kerak');
  const meta={source:'direct_api',eventId:directEventId(event),messageId:directEventId(event),senderId:'soliq-monitor',rawPayload:event};
  if (eventType === 'accepted_report') {
    const report=structuredReportFromEvent(event);
    if (!report.name) throw new Error('accepted_report uchun data.name kerak');
    const parsed={tin:companyInfo.tin,companyName:companyInfo.name,reports:[report],rawText:JSON.stringify(event)};
    const result=await processMonitoringReport(meta,parsed,report,{force});
    invalidateBootstrapCache();
    return {ok:true,eventType,eventId:meta.eventId,result};
  }
  if (eventType === 'tax_payment') {
    const result=await processMonitoringTaxPayment(event,meta,{force});
    invalidateBootstrapCache();
    return {ok:true,eventType,eventId:meta.eventId,result};
  }
  throw new Error(`Qo‘llab-quvvatlanmaydigan event_type: ${eventType || '-'}`);
}
app.get('/api/integrations/soliq-monitor/health', async (req,res)=>{
  try {
    if (!monitorImportSecretAllowed(req)) return res.status(401).json({ok:false,error:'Unauthorized'});
    ensureDb();
    const [maps,taxMaps]=await Promise.all([monitoringMappings().catch(()=>[]),monitoringTaxMappings().catch(()=>[])]);
    return res.json({ok:true,stage:'8.4.2',integration:'Unified Soliq Integration',directApi:true,reportMappings:maps.length,taxMappings:taxMaps.length,serverTime:new Date().toISOString()});
  } catch(err){ return handleError(res,err); }
});
app.post('/api/integrations/soliq-monitor/events', async (req,res)=>{
  try {
    if (!monitorImportSecretAllowed(req)) return res.status(401).json({ok:false,error:'Unauthorized'});
    ensureDb();
    const events=Array.isArray(req.body?.events)?req.body.events:[req.body];
    if (!events.length || !events[0]) return res.status(400).json({ok:false,error:'Event kerak'});
    const results=[];
    for (const event of events.slice(0,200)) results.push(await processDirectSoliqEvent(event));
    return res.json({ok:true,processed:results.length,results});
  } catch(err){ return handleError(res,err); }
});
app.get('/api/soliq-monitor/tax-mappings', async (req,res)=>{
  try { ensureDb(); const {data,error}=await supabase.from('monitoring_tax_mappings').select('*').order('priority',{ascending:true}).order('created_at',{ascending:true}); if(error) throw error; return res.json({ok:true,data:data||[]}); }
  catch(err){ return handleError(res,err); }
});
app.post('/api/soliq-monitor/tax-mappings', async (req,res)=>{
  try {
    ensureDb();
    const code=String(req.body?.taxCode||req.body?.tax_code||'').replace(/\D/g,'').replace(/^0+/,'') || '';
    if(!code) return res.status(400).json({ok:false,error:'Soliq kodi kerak'});
    const required=Array.isArray(req.body?.requiredCodes||req.body?.required_codes)?(req.body.requiredCodes||req.body.required_codes):String(req.body?.requiredCodes||'').split(',');
    const payload={tax_code:code,tax_name:cleanText(req.body?.taxName||req.body?.tax_name)||null,control_item_id:cleanText(req.body?.controlItemId||req.body?.control_item_id)||null,control_item_name:cleanText(req.body?.controlItemName||req.body?.control_item_name)||null,group_key:cleanText(req.body?.groupKey||req.body?.group_key)||`tax_${code}`,required_codes:required.map(x=>String(x).replace(/\D/g,'').replace(/^0+/,'')).filter(Boolean),is_active:req.body?.isActive===undefined?true:!!req.body.isActive,priority:Number(req.body?.priority||100),updated_at:new Date().toISOString()};
    if(!payload.required_codes.length) payload.required_codes=[code];
    let query=req.body?.id?supabase.from('monitoring_tax_mappings').update(payload).eq('id',req.body.id).select('*').single():supabase.from('monitoring_tax_mappings').insert(payload).select('*').single();
    const {data,error}=await query; if(error) throw error; return res.json({ok:true,data});
  } catch(err){ return handleError(res,err); }
});
app.delete('/api/soliq-monitor/tax-mappings/:id', async(req,res)=>{
  try{ensureDb();const {error}=await supabase.from('monitoring_tax_mappings').delete().eq('id',req.params.id);if(error)throw error;return res.json({ok:true});}catch(err){return handleError(res,err);}
});


app.listen(PORT, () => {
  console.log(`Ijro nazorati backend Stage 8.4.2 running on port ${PORT}`);
});
