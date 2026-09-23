-- Ijro Nazorati Stage 8.4.1 — cumulative Supabase schema upgrade
-- Mavjud ma'lumotlarni O'CHIRMAYDI. DROP/TRUNCATE/DELETE yo'q.
-- Stage 8.4 va 8.4.1 uchun kerakli yangi jadvallar/indekslarni idempotent yaratadi.

create extension if not exists pgcrypto;

-- ===== Stage 8.4 bazaviy takomillashtirish =====
create table if not exists public.archive_snapshots (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  stage text,
  table_count integer default 0,
  row_count integer default 0,
  created_by uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_archive_snapshots_created_at on public.archive_snapshots(created_at desc);
create index if not exists idx_archive_snapshots_created_by on public.archive_snapshots(created_by);

create table if not exists public.control_items (
  id text primary key,
  name text not null,
  default_day integer not null default 15 check (default_day between 1 and 31),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_control_items_active_order on public.control_items(active, sort_order, name);

create table if not exists public.control_not_required_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  item_id text not null,
  item_name text,
  note text,
  source text not null default 'director',
  is_active boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, item_id)
);
create index if not exists idx_control_not_required_company on public.control_not_required_rules(company_id, is_active);
create index if not exists idx_control_not_required_item on public.control_not_required_rules(item_id, is_active);

create table if not exists public.company_status_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  status text not null default 'active' check (status in ('active','paused','terminated')),
  note text,
  updated_by uuid null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_company_status_profiles_status on public.company_status_profiles(status, updated_at desc);

-- ===== Stage 8.4.1 — My Soliq Monitoring =====
create table if not exists public.monitoring_report_mappings (
  id uuid primary key default gen_random_uuid(),
  report_pattern text not null,
  match_mode text not null default 'contains' check (match_mode in ('contains','exact','regex')),
  control_item_id text null,
  control_item_name text null,
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_pattern, match_mode)
);
create index if not exists idx_monitoring_mapping_active_priority on public.monitoring_report_mappings(is_active, priority, created_at);

create table if not exists public.monitoring_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'telegram',
  source_chat_id text null,
  source_message_id text null,
  source_sender_id text null,
  company_tin text not null,
  company_name_raw text null,
  report_name_raw text not null,
  report_period text null,
  sent_at timestamptz null,
  checked_at timestamptz null,
  external_status text null,
  status_group text not null default 'unknown' check (status_group in ('accepted_on_time','accepted','accepted_late','problem','pending','unknown')),
  matched_company_id uuid null references public.companies(id) on delete set null,
  matched_control_item_id text null,
  matched_control_item_name text null,
  mapping_id uuid null references public.monitoring_report_mappings(id) on delete set null,
  matched_task_id uuid null references public.tasks(id) on delete set null,
  assignee_id uuid null references public.app_users(id) on delete set null,
  auto_action text null,
  error_message text null,
  dedupe_key text not null unique,
  raw_text text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists idx_monitoring_imports_created on public.monitoring_imports(created_at desc);
create index if not exists idx_monitoring_imports_tin_period on public.monitoring_imports(company_tin, report_period, created_at desc);
create index if not exists idx_monitoring_imports_status on public.monitoring_imports(status_group, created_at desc);
create index if not exists idx_monitoring_imports_task on public.monitoring_imports(matched_task_id, created_at desc);
create index if not exists idx_monitoring_imports_company on public.monitoring_imports(matched_company_id, created_at desc);

-- Frontend yangi jadvallarga bevosita kirmaydi; backend service role orqali ishlaydi.
alter table public.monitoring_imports enable row level security;
alter table public.monitoring_report_mappings enable row level security;
alter table public.archive_snapshots enable row level security;

-- Default mappinglar. conflict bo'lsa mavjud sozlama saqlanadi.
insert into public.monitoring_report_mappings(report_pattern, match_mode, control_item_id, control_item_name, priority)
values
  ('jismoniy shaxslardan olinadigan daromad solig''i va ijtimoiy soliq', 'contains', null, 'JSHODS VA IJTIMOIY SOLIQ', 10),
  ('aylanmadan olinadigan soliq', 'contains', 'ctrl-ediniy-nalog', 'Ediniy nalog', 20),
  ('qo''shilgan qiymat solig''i', 'contains', 'ctrl-nds', 'NDS', 30),
  ('mol-mulk solig''i hisob-kitobi', 'contains', 'ctrl-mol-mulk', 'Mol-mulk solig‘i', 40),
  ('yer solig''i', 'contains', 'ctrl-yer-soligi', 'Yer solig‘i', 50),
  ('suv resurslaridan foydalanganlik uchun soliq', 'contains', 'ctrl-suv-soligi', 'Suv solig‘i', 60)
on conflict (report_pattern, match_mode) do nothing;

-- 1000+ topshiriqlar va monitoring matching tezligi uchun indekslar.
create index if not exists idx_tasks_company_created on public.tasks(company_id, created_at desc);
create index if not exists idx_tasks_company_deadline on public.tasks(company_id, deadline, created_at desc);
create index if not exists idx_tasks_assignee_status on public.tasks(assignee_id, status);
create index if not exists idx_tasks_deadline_status on public.tasks(deadline, status);
create index if not exists idx_tasks_active_created on public.tasks(is_active, created_at desc);
create index if not exists idx_companies_tin on public.companies(tin);
create index if not exists idx_task_history_task_created on public.task_history(task_id, created_at desc);
create index if not exists idx_task_attachments_task_created on public.task_attachments(task_id, created_at desc);

comment on table public.monitoring_imports is 'Stage 8.4.1: My Soliq Monitoring xabarlaridan ajratilgan hisobotlar import jurnali va matching natijalari';
comment on table public.monitoring_report_mappings is 'Stage 8.4.1: tashqi soliq hisobot nomlarini Nazorat jadvali bandlariga mapping qilish';

-- ===== Stage 8.4.2 — Unified Soliq Integration / Direct API =====
-- Mavjud ma'lumotlar saqlanadi. Quyida faqat yangi ustun/jadval/indekslar qo'shiladi.

alter table public.monitoring_imports add column if not exists event_type text not null default 'accepted_report';
alter table public.monitoring_imports add column if not exists event_id text null;
alter table public.monitoring_imports add column if not exists control_month text null;
alter table public.monitoring_imports add column if not exists tax_code text null;
alter table public.monitoring_imports add column if not exists tax_name_raw text null;
alter table public.monitoring_imports add column if not exists payment_no text null;
alter table public.monitoring_imports add column if not exists payment_date date null;
alter table public.monitoring_imports add column if not exists amount numeric null;
alter table public.monitoring_imports add column if not exists amount_raw text null;
alter table public.monitoring_imports add column if not exists tax_mapping_id uuid null;
alter table public.monitoring_imports add column if not exists tax_group_key text null;

-- Stage 8.4.1 status_group CHECK soliq to'lov statuslarini bilmagan.
alter table public.monitoring_imports drop constraint if exists monitoring_imports_status_group_check;
alter table public.monitoring_imports add constraint monitoring_imports_status_group_check
  check (status_group in ('accepted_on_time','accepted','accepted_late','problem','pending','unknown','paid','rejected'));

create unique index if not exists idx_monitoring_imports_event_id_unique
  on public.monitoring_imports(event_id) where event_id is not null;
create index if not exists idx_monitoring_imports_event_type_created
  on public.monitoring_imports(event_type, created_at desc);
create index if not exists idx_monitoring_imports_tax_month
  on public.monitoring_imports(company_tin, control_month, tax_code, created_at desc)
  where event_type='tax_payment';

create table if not exists public.monitoring_tax_mappings (
  id uuid primary key default gen_random_uuid(),
  tax_code text not null unique,
  tax_name text null,
  control_item_id text null,
  control_item_name text null,
  group_key text not null,
  required_codes text[] not null default '{}'::text[],
  is_active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_monitoring_tax_mapping_active_priority
  on public.monitoring_tax_mappings(is_active, priority, created_at);
alter table public.monitoring_tax_mappings enable row level security;

-- FK ustun jadvaldan keyin xavfsiz qo'shiladi.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='monitoring_imports_tax_mapping_id_fkey'
  ) then
    alter table public.monitoring_imports
      add constraint monitoring_imports_tax_mapping_id_fkey
      foreign key (tax_mapping_id) references public.monitoring_tax_mappings(id) on delete set null;
  end if;
end $$;

-- Default mappinglar. Nazorat bandi IDsi topilmasa backend nom bo'yicha fuzzy moslaydi.
insert into public.monitoring_tax_mappings(tax_code,tax_name,control_item_id,control_item_name,group_key,required_codes,priority)
values
  ('46','Jismoniy shaxslardan olinadigan daromad solig‘i',null,'JSHODS VA IJTIMOIY SOLIQ TO‘LOVLARI','payroll_taxes',array['46','36'],10),
  ('36','Ijtimoiy soliq',null,'JSHODS VA IJTIMOIY SOLIQ TO‘LOVLARI','payroll_taxes',array['46','36'],11),
  ('1','Qo‘shilgan qiymat solig‘i','ctrl-nds','NDS','tax_vat',array['1'],20),
  ('100','Aylanmadan olinadigan soliq',null,'AYLANMADAN SOLIQ TO‘LOVI','tax_turnover',array['100'],30),
  ('44','Yuridik shaxslarning mol-mulk solig‘i','ctrl-mol-mulk','Mol-mulk solig‘i','tax_property',array['44'],40),
  ('53','Yuridik shaxslarning yer solig‘i','ctrl-yer-soligi','Yer solig‘i','tax_land',array['53'],50),
  ('52','Suv resurslaridan foydalanganlik uchun soliq/to‘lov','ctrl-suv-soligi','Suv solig‘i','tax_water',array['52'],60),
  ('32','Foyda solig‘i',null,'Foyda solig‘i','tax_profit',array['32'],70)
on conflict (tax_code) do nothing;

comment on table public.monitoring_tax_mappings is 'Stage 8.4.2: Soliq Monitor tax_code -> Nazorat jadvali bandi va kombinatsiya qoidalari';
comment on column public.monitoring_imports.event_type is 'accepted_report yoki tax_payment';
comment on column public.monitoring_imports.control_month is 'Nazorat jadvalida aks etadigan YYYY-MM oy';
