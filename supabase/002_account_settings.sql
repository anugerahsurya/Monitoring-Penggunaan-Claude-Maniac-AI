-- Monitoring Claude — tambahan: kalibrasi batas & reset mingguan AKUN bersama.
-- Satu akun Claude dipakai bergantian oleh semua anggota di perangkat masing-masing,
-- jadi batas 5 jam & mingguan berlaku untuk gabungan pemakaian semua perangkat.
-- Jalankan sekali di Supabase → SQL Editor (setelah schema.sql).

drop function if exists public.save_member_settings(text, text, timestamptz, bigint, bigint);
drop table if exists public.member_settings;

create table if not exists public.account_settings (
  id           text primary key default 'team',
  week_anchor  timestamptz not null,       -- salah satu waktu reset mingguan akun
  limit_5h     bigint      not null,       -- batas sesi 5 jam (token terhitung)
  limit_week   bigint      not null,       -- batas mingguan (token terhitung)
  updated_at   timestamptz not null default now(),
  updated_by   text
);

alter table public.account_settings enable row level security;
drop policy if exists "baca publik" on public.account_settings;
create policy "baca publik" on public.account_settings for select to anon, authenticated using (true);

-- Disimpan lewat token unggah anggota mana pun; nama pengubah dicatat.
create or replace function public.save_account_settings(
  p_token text, p_week_anchor timestamptz, p_limit_5h bigint, p_limit_week bigint
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member text;
begin
  select member into v_member from ingest_tokens where token = p_token;
  if v_member is null then
    raise exception 'Token unggah tidak dikenal' using errcode = '28000';
  end if;
  if p_limit_5h <= 0 or p_limit_week <= 0 then
    raise exception 'Batas harus lebih dari 0';
  end if;

  insert into account_settings (id, week_anchor, limit_5h, limit_week, updated_at, updated_by)
  values ('team', p_week_anchor, p_limit_5h, p_limit_week, now(), v_member)
  on conflict (id) do update set
    week_anchor = excluded.week_anchor, limit_5h = excluded.limit_5h, limit_week = excluded.limit_week,
    updated_at = now(), updated_by = excluded.updated_by;

  return jsonb_build_object('member', v_member);
end;
$$;

revoke all on function public.save_account_settings(text, timestamptz, bigint, bigint) from public;
grant execute on function public.save_account_settings(text, timestamptz, bigint, bigint) to anon, authenticated;
