import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const app = express();
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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
const TELEGRAM_PENDING_MINUTES = Math.max(1, Number(process.env.TELEGRAM_PENDING_MINUTES || 5));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_TRANSCRIPTION_MODEL = process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1';
const OPENAI_TRANSCRIPTION_LANGUAGE = process.env.OPENAI_TRANSCRIPTION_LANGUAGE || 'uz';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ATTACHMENTS_BUCKET = process.env.ATTACHMENTS_BUCKET || 'task-attachments';
const MAX_ATTACHMENT_SIZE_MB = Number(process.env.MAX_ATTACHMENT_SIZE_MB || 25);

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

function taskToClient(t) {
  if (!t) return null;
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

async function getBootstrapData() {
  ensureDb();
  const [usersRes, companiesRes, templatesRes, tasksRes] = await Promise.all([
    supabase.from('app_users').select('*').order('created_at', { ascending: true }),
    supabase.from('companies').select('*').order('created_at', { ascending: true }),
    supabase.from('task_templates').select('*').order('created_at', { ascending: true }),
    supabase.from('tasks').select('*').order('created_at', { ascending: false })
  ]);
  for (const r of [usersRes, companiesRes, templatesRes, tasksRes]) if (r.error) throw r.error;
  return {
    users: usersRes.data.map(userToClient),
    companies: companiesRes.data.map(companyToClient),
    taskTemplates: templatesRes.data.map(templateToClient),
    tasks: tasksRes.data.map(taskToClient)
  };
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
function isoDateFromDate(d) { return d.toISOString().slice(0, 10); }
function hhmmFromDate(d) { return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
function parseTelegramDeadline(text) {
  const src = cleanText(text);
  const now = new Date();
  let date = '';
  let time = '';
  let m = src.match(/(?:muddat|муддат|deadline)\s*[:\-]?\s*(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/i) || src.match(/(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?/);
  if (m) { date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`; if (m[4]) time = m[4]; }
  if (!date) {
    m = src.match(/(?:muddat|муддат|deadline)\s*[:\-]?\s*(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}:\d{2}))?/i) || src.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
    if (m) { date = `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; if (m[4]) time = m[4]; }
  }
  const timeMatch = src.match(/(?:soat|соат|time|vaqt)\s*[:\-]?\s*(\d{1,2}:\d{2})/i) || src.match(/\b(\d{1,2}:\d{2})\b/);
  if (!time && timeMatch) time = timeMatch[1];
  if (!date) {
    if (/\b(ertaga|эртага|tomorrow)\b/i.test(src)) { const d = new Date(now); d.setDate(d.getDate()+1); date = isoDateFromDate(d); }
    else if (/\b(bugun|бугун|today)\b/i.test(src)) { date = isoDateFromDate(now); }
  }
  if (!date && time) {
    const d = new Date(now);
    const [h, mi] = time.split(':').map(Number);
    d.setHours(h, mi, 0, 0);
    if (d.getTime() < now.getTime()) d.setDate(d.getDate()+1);
    date = isoDateFromDate(d);
  }
  if (!date) {
    const d = new Date(now.getTime() + TELEGRAM_DEFAULT_DEADLINE_HOURS * 60 * 60 * 1000);
    date = isoDateFromDate(d);
    if (!time) time = hhmmFromDate(d);
  }
  return { date, time };
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
  return new Date().toISOString().slice(0, 10);
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

    const data = await getBootstrapData();
    return res.json({ ok: true, user: userToClient(user), data });
  } catch (err) {
    return handleError(res, err);
  }
});

app.get('/api/bootstrap', async (_, res) => {
  try {
    return res.json({ ok: true, data: await getBootstrapData() });
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
    if (!payload.assignee_id) return res.status(400).json({ ok: false, error: 'Xodim tanlang' });
    if (!payload.title) return res.status(400).json({ ok: false, error: 'Topshiriq nomi majburiy' });
    if (payload.status === 'Bajarildi') payload.completed_at = new Date().toISOString();
    const { data, error } = await supabase.from('tasks').insert(payload).select('*').single();
    if (error) throw error;
    await addTaskHistory(data.id, payload.created_by, payload.is_quick ? 'Tezkor topshiriq yaratildi' : 'Topshiriq yaratildi', null, data.status, data.description);
    notifyTaskCreatedAsync(data);
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
    if (payload.status === 'Bajarildi' && !oldTask.completed_at) payload.completed_at = new Date().toISOString();
    if (payload.status && payload.status !== 'Bajarildi') payload.completed_at = null;
    const { data, error } = await supabase.from('tasks').update(payload).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    const actorId = req.body.actorId || req.body.actor_id || null;
    if (payload.status && payload.status !== oldTask.status) {
      await addTaskHistory(data.id, actorId, 'Status o‘zgardi', oldTask.status, data.status, data.employee_note || data.director_note || '');
      await notifyDirectorsTaskStatusChanged(data, oldTask.status);
      if (data.status === 'Direktor tasdiqladi' && oldTask.status !== 'Direktor tasdiqladi') notifyCustomerTaskDone(data).catch(err => console.warn('Customer done notify async failed:', err.message));
    } else {
      await addTaskHistory(data.id, actorId, 'Topshiriq tahrirlandi', oldTask.status, data.status, data.employee_note || data.director_note || '');
    }
    return res.json({ ok: true, data: taskToClient(data) });
  } catch (err) {
    return handleError(res, err);
  }
});

app.post('/api/tasks/:id/confirm', async (req, res) => {
  try {
    ensureDb();
    const oldTask = await getById('tasks', req.params.id);
    if (!oldTask) return res.status(404).json({ ok: false, error: 'Topshiriq topilmadi' });
    const note = cleanText(req.body.directorNote || oldTask.director_note || 'Tasdiqlandi.');
    const { data, error } = await supabase.from('tasks').update({
      status: 'Direktor tasdiqladi',
      director_note: note,
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    await addTaskHistory(data.id, req.body.actorId || null, 'Direktor tasdiqladi', oldTask.status, data.status, note);
    if (oldTask.status !== 'Direktor tasdiqladi') notifyCustomerTaskDone(data).catch(err => console.warn('Customer done notify async failed:', err.message));
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
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('*'),
      supabase.from('app_users').select('*')
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
  const d = new Date(String(task.deadline).slice(0, 10) + 'T' + time + ':00');
  return Number.isNaN(d.getTime()) ? null : d;
}
function taskDeadlineTextServer(task) {
  const time = extractTaskTimeServer(task);
  return `${task?.deadline || ''}${time ? ' ' + time : ''}`.trim();
}
async function getReportRowsFromDb(q = {}) {
  ensureDb();
  const [tasksRes, companiesRes, usersRes] = await Promise.all([
    supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    supabase.from('companies').select('*'),
    supabase.from('app_users').select('*')
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
function cleanupReminderCache() {
  const now = Date.now();
  for (const [key, value] of reminderSentKeys.entries()) if (now - value > 7 * 24 * 60 * 60 * 1000) reminderSentKeys.delete(key);
}
function reminderLevelForTask(task) {
  const d = taskDeadlineDateServer(task);
  if (!d || isTaskDoneServer(task.status) || task.status === 'Bekor qilindi' || task.status === 'Bajarilmadi') return null;
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return null;
  if (ms <= 60 * 60 * 1000) return { key: '1h', label: '1 soatdan kam vaqt qoldi' };
  if (ms <= 3 * 60 * 60 * 1000) return { key: '3h', label: '3 soatdan kam vaqt qoldi' };
  if (ms <= 24 * 60 * 60 * 1000) return { key: '24h', label: '1 kundan kam vaqt qoldi' };
  return null;
}
async function checkAndSendTaskReminders() {
  if (process.env.TELEGRAM_REMINDERS_ENABLED === 'false') return { sent: 0, skipped: true };
  ensureDb();
  cleanupReminderCache();
  const [tasksRes, companiesRes, usersRes, directorsRes] = await Promise.all([
    supabase.from('tasks').select('*').eq('is_active', true),
    supabase.from('companies').select('*'),
    supabase.from('app_users').select('*'),
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
    const text = [
      `⏰ Eslatma: ${level.label}`,
      '',
      `Korxona: ${company.name || '-'}`,
      `Topshiriq: ${task.title || '-'}`,
      `Muddat: ${taskDeadlineTextServer(task) || '-'}`,
      `Muhimlik: ${task.priority || '-'}`,
      `Status: ${task.status || '-'}`
    ].join('\n');
    const targets = [];
    if (assignee.telegram_chat_id) targets.push(assignee.telegram_chat_id);
    for (const d of directorsRes.data || []) if (d.telegram_chat_id) targets.push(d.telegram_chat_id);
    const uniqueTargets = [...new Set(targets.filter(Boolean))];
    await Promise.all(uniqueTargets.map(chatId => sendTelegramMessage(chatId, text).catch(err => console.warn('Reminder telegram failed:', err.message))));
    reminderSentKeys.set(cacheKey, Date.now());
    sent += uniqueTargets.length;
  }
  return { sent };
}
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

app.listen(PORT, () => {
  console.log(`Ijro nazorati backend running on port ${PORT}`);
});
