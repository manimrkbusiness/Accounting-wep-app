-- In-app notifications: admins broadcast announcements; each trader tracks what they have read.
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.announcement_reads (
  announcement_id bigint not null references public.announcements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_reads_user_idx on public.announcement_reads (user_id);

alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;

-- Any signed-in trader may read live announcements. Writing them is service-role only (admin panel),
-- so there is deliberately no insert/update/delete policy here.
drop policy if exists "announcements_read_active" on public.announcements;
create policy "announcements_read_active" on public.announcements
  for select to authenticated using (active = true);

-- A trader can see and create only their own read-marks.
drop policy if exists "reads_select_own" on public.announcement_reads;
create policy "reads_select_own" on public.announcement_reads
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "reads_insert_own" on public.announcement_reads;
create policy "reads_insert_own" on public.announcement_reads
  for insert to authenticated with check (user_id = auth.uid());
