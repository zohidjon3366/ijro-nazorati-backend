import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json({ limit: '5mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.MAX_ATTACHMENT_SIZE_MB || 25) * 1024 * 1024,
    files: 1
  }
});

const PORT = process.env.PORT || 3000;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
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

app.get('/health', (_, res) => res.json({ ok: true, supabase: !!supabase }));

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
    await notifyTaskCreated(data);
    return res.json({ ok: true, data: taskToClient(data) });
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

app.listen(PORT, () => {
  console.log(`Ijro nazorati backend running on port ${PORT}`);
});
