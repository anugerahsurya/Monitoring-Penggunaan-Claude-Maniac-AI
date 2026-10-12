-- Monitoring Claude — skema Supabase
-- Jalankan sekali di Supabase Dashboard → SQL Editor.

-- Ringkasan pemakaian per jam (UTC). Baris dengan model = '' hanya membawa jumlah prompt.
create table if not exists public.usage_hourly (
  member          text        not null,
  hour            timestamptz not null,
  project         text        not null,
  model           text        not null,
  entry           text        not null,
  subagent        boolean     not null default false,
  calls           integer     not null default 0,
  prompts         integer     not null default 0,
  input           bigint      not null default 0,
  output          bigint      not null default 0,
  thinking        bigint      not null default 0,
  cache_read      bigint      not null default 0,
  cache_write_5m  bigint      not null default 0,
  cache_write_1h  bigint      not null default 0,
  web_search      integer     not null default 0,
  cost            double precision not null default 0,
  primary key (member, hour, project, model, entry, subagent)
);

create table if not exists public.tool_hourly (
  member    text        not null,
  hour      timestamptz not null,
  project   text        not null,
  model     text        not null,
  entry     text        not null,
  subagent  boolean     not null default false,
  tool      text        not null,
  count     integer     not null default 0,
  primary key (member, hour, project, model, entry, subagent, tool)
);

create table if not exists public.sessions (
  member         text        not null,
  session_id     text        not null,
  title          text,
  project        text,
  entry          text,
  models         text,
  started_at     timestamptz,
  ended_at       timestamptz,
  prompts        integer     not null default 0,
  calls          integer     not null default 0,
  tokens         bigint      not null default 0,
  cost           double precision not null default 0,
  lines_added    integer     not null default 0,
  lines_removed  integer     not null default 0,
  compactions    integer     not null default 0,
  version        text,
  branch         text,
  primary key (member, session_id)
);

-- Jendela batas 5 jam per anggota (dihitung oleh collector dari waktu pesan yang tepat).
create table if not exists public.usage_windows (
  member       text        not null,
  started_at   timestamptz not null,
  ends_at      timestamptz not null,
  last_at      timestamptz not null,
  calls        integer     not null default 0,
  prompts      integer     not null default 0,
  input        bigint      not null default 0,
  output       bigint      not null default 0,
  cache_read   bigint      not null default 0,
  cache_write  bigint      not null default 0,
  cost         double precision not null default 0,
  primary key (member, started_at)
);

-- Token unggah per anggota. Token terikat ke satu nama, jadi tidak bisa mengirim atas nama orang lain.
create table if not exists public.ingest_tokens (
  token   text primary key default encode(gen_random_bytes(24), 'hex'),
  member  text not null unique
);

create index if not exists usage_hourly_hour_idx on public.usage_hourly (hour);
create index if not exists tool_hourly_hour_idx  on public.tool_hourly (hour);
create index if not exists sessions_started_idx  on public.sessions (started_at);

-- Akses: dashboard hanya boleh MEMBACA. Menulis hanya lewat fungsi ingest_usage.
alter table public.usage_hourly  enable row level security;
alter table public.tool_hourly   enable row level security;
alter table public.sessions      enable row level security;
alter table public.usage_windows enable row level security;
alter table public.ingest_tokens enable row level security;   -- tanpa policy = tertutup total

drop policy if exists "baca publik" on public.usage_hourly;
drop policy if exists "baca publik" on public.tool_hourly;
drop policy if exists "baca publik" on public.sessions;
drop policy if exists "baca publik" on public.usage_windows;
create policy "baca publik" on public.usage_hourly for select to anon, authenticated using (true);
create policy "baca publik" on public.tool_hourly  for select to anon, authenticated using (true);
create policy "baca publik" on public.sessions     for select to anon, authenticated using (true);
create policy "baca publik" on public.usage_windows for select to anon, authenticated using (true);

drop function if exists public.ingest_usage(text, jsonb, jsonb, jsonb);
create or replace function public.ingest_usage(
  p_token text, p_hourly jsonb, p_tools jsonb, p_sessions jsonb, p_windows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member text;
  n_h int; n_t int; n_s int; n_w int;
begin
  select member into v_member from ingest_tokens where token = p_token;
  if v_member is null then
    raise exception 'Token unggah tidak dikenal' using errcode = '28000';
  end if;

  insert into usage_hourly as u
  select v_member, r.hour, r.project, r.model, r.entry, r.subagent, r.calls, r.prompts, r.input, r.output,
         r.thinking, r.cache_read, r.cache_write_5m, r.cache_write_1h, r.web_search, r.cost
  from jsonb_to_recordset(p_hourly) as r(
    hour timestamptz, project text, model text, entry text, subagent boolean, calls int, prompts int,
    input bigint, output bigint, thinking bigint, cache_read bigint, cache_write_5m bigint,
    cache_write_1h bigint, web_search int, cost double precision)
  on conflict (member, hour, project, model, entry, subagent) do update set
    calls = excluded.calls, prompts = excluded.prompts, input = excluded.input, output = excluded.output,
    thinking = excluded.thinking, cache_read = excluded.cache_read, cache_write_5m = excluded.cache_write_5m,
    cache_write_1h = excluded.cache_write_1h, web_search = excluded.web_search, cost = excluded.cost;
  get diagnostics n_h = row_count;

  insert into tool_hourly as t
  select v_member, r.hour, r.project, r.model, r.entry, r.subagent, r.tool, r.count
  from jsonb_to_recordset(p_tools) as r(
    hour timestamptz, project text, model text, entry text, subagent boolean, tool text, count int)
  on conflict (member, hour, project, model, entry, subagent, tool) do update set count = excluded.count;
  get diagnostics n_t = row_count;

  insert into sessions as s
  select v_member, r.session_id, r.title, r.project, r.entry, r.models, r.started_at, r.ended_at, r.prompts,
         r.calls, r.tokens, r.cost, r.lines_added, r.lines_removed, r.compactions, r.version, r.branch
  from jsonb_to_recordset(p_sessions) as r(
    session_id text, title text, project text, entry text, models text, started_at timestamptz,
    ended_at timestamptz, prompts int, calls int, tokens bigint, cost double precision,
    lines_added int, lines_removed int, compactions int, version text, branch text)
  on conflict (member, session_id) do update set
    title = excluded.title, project = excluded.project, entry = excluded.entry, models = excluded.models,
    started_at = excluded.started_at, ended_at = excluded.ended_at, prompts = excluded.prompts,
    calls = excluded.calls, tokens = excluded.tokens, cost = excluded.cost,
    lines_added = excluded.lines_added, lines_removed = excluded.lines_removed,
    compactions = excluded.compactions, version = excluded.version, branch = excluded.branch;
  get diagnostics n_s = row_count;

  -- jendela dihitung ulang penuh dari log yang ada; ganti semua jendela mulai dari jendela paling awal yang dikirim
  delete from usage_windows
  where member = v_member
    and started_at >= (select min((w->>'started_at')::timestamptz) from jsonb_array_elements(p_windows) w);
  insert into usage_windows
  select v_member, r.started_at, r.ends_at, r.last_at, r.calls, r.prompts, r.input, r.output, r.cache_read, r.cache_write, r.cost
  from jsonb_to_recordset(p_windows) as r(
    started_at timestamptz, ends_at timestamptz, last_at timestamptz, calls int, prompts int,
    input bigint, output bigint, cache_read bigint, cache_write bigint, cost double precision)
  on conflict (member, started_at) do update set
    ends_at = excluded.ends_at, last_at = excluded.last_at, calls = excluded.calls, prompts = excluded.prompts,
    input = excluded.input, output = excluded.output, cache_read = excluded.cache_read,
    cache_write = excluded.cache_write, cost = excluded.cost;
  get diagnostics n_w = row_count;

  return jsonb_build_object('member', v_member, 'hourly', n_h, 'tools', n_t, 'sessions', n_s, 'windows', n_w);
end;
$$;

revoke all on function public.ingest_usage(text, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.ingest_usage(text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;

-- Buat token untuk tiap anggota (jalankan sekali, lalu bagikan token masing-masing secara pribadi):
insert into public.ingest_tokens (member) values ('Rafi'), ('Surya'), ('Nisa'), ('Sofi')
on conflict (member) do nothing;
-- Lihat token:  select member, token from public.ingest_tokens order by member;
