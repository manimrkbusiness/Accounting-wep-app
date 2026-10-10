-- Coconut harvesting: the trader's harvesting teams, who is in them, and a daily record
-- of coconuts harvested. Each harvesting entry is the amount the trader pays that team
-- (booked automatically as a harvesting-labor expense) and can be linked to the purchase
-- of those coconuts. This is separate from the "deduct harvesting" on a purchase, which
-- decides whether the farmer or the trader bears the cost.

-- ---------------------------------------------------------------------------
-- Teams and members
-- ---------------------------------------------------------------------------

create table if not exists public.harvesting_teams (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trader_id, name)
);

create index if not exists harvesting_teams_trader_idx on public.harvesting_teams (trader_id, name);

create table if not exists public.harvesting_team_members (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  team_id bigint not null references public.harvesting_teams (id) on delete cascade,
  employee_id bigint not null references public.employees (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (team_id, employee_id)
);

create index if not exists harvesting_team_members_team_idx on public.harvesting_team_members (team_id);
create index if not exists harvesting_team_members_trader_idx on public.harvesting_team_members (trader_id);

-- ---------------------------------------------------------------------------
-- Daily harvesting entries
-- ---------------------------------------------------------------------------

create table if not exists public.harvesting_entries (
  id bigint generated always as identity primary key,
  trader_id uuid not null references auth.users (id) on delete cascade,
  harvest_date date not null default current_date,
  team_id bigint references public.harvesting_teams (id) on delete set null,
  coconut_quantity numeric(14, 2) not null check (coconut_quantity > 0),
  rate_per_1000 numeric(14, 2) not null default 0 check (rate_per_1000 >= 0),
  purchase_id bigint references public.coconut_trades (id) on delete set null,
  notes text,
  total_cost numeric(14, 2) generated always as ((coconut_quantity / 1000) * rate_per_1000) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists harvesting_entries_trader_date_idx on public.harvesting_entries (trader_id, harvest_date desc, id desc);
create index if not exists harvesting_entries_purchase_idx on public.harvesting_entries (purchase_id);

alter table public.expenses
  add column if not exists harvesting_entry_id bigint references public.harvesting_entries (id) on delete cascade;

create index if not exists expenses_harvesting_entry_idx on public.expenses (harvesting_entry_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

drop trigger if exists set_harvesting_teams_updated_at on public.harvesting_teams;
create trigger set_harvesting_teams_updated_at before update on public.harvesting_teams
for each row execute function public.set_updated_at();

drop trigger if exists set_harvesting_entries_updated_at on public.harvesting_entries;
create trigger set_harvesting_entries_updated_at before update on public.harvesting_entries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ownership validation for links
-- ---------------------------------------------------------------------------

create or replace function public.validate_harvesting_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('harvesting_teams', new.team_id, new.trader_id);
  perform public.assert_trader_owns('employees', new.employee_id, new.trader_id);
  return new;
end;
$$;

drop trigger if exists validate_harvesting_team_member on public.harvesting_team_members;
create trigger validate_harvesting_team_member before insert or update on public.harvesting_team_members
for each row execute function public.validate_harvesting_team_member();

create or replace function public.validate_harvesting_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('harvesting_teams', new.team_id, new.trader_id);
  perform public.assert_trader_owns('coconut_trades', new.purchase_id, new.trader_id);
  return new;
end;
$$;

drop trigger if exists validate_harvesting_entry on public.harvesting_entries;
create trigger validate_harvesting_entry before insert or update on public.harvesting_entries
for each row execute function public.validate_harvesting_entry();

-- ---------------------------------------------------------------------------
-- Keep a harvesting-labor expense in step with each harvesting entry
-- ---------------------------------------------------------------------------

create or replace function public.sync_harvesting_expense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  team_name text;
begin
  select name into team_name from public.harvesting_teams where id = new.team_id;
  if new.total_cost > 0 then
    if exists (select 1 from public.expenses where harvesting_entry_id = new.id) then
      update public.expenses
      set expense_date = new.harvest_date,
          amount = new.total_cost,
          category = 'harvesting_labor',
          scope = 'coconut',
          purchase_id = new.purchase_id,
          description = 'Harvesting' || coalesce(' by ' || team_name, '') || ' on ' || to_char(new.harvest_date, 'DD Mon YYYY')
      where harvesting_entry_id = new.id and trader_id = new.trader_id;
    else
      insert into public.expenses (trader_id, expense_date, category, scope, amount, purchase_id, harvesting_entry_id, description)
      values (new.trader_id, new.harvest_date, 'harvesting_labor', 'coconut', new.total_cost, new.purchase_id, new.id,
        'Harvesting' || coalesce(' by ' || team_name, '') || ' on ' || to_char(new.harvest_date, 'DD Mon YYYY'));
    end if;
  else
    delete from public.expenses where harvesting_entry_id = new.id and trader_id = new.trader_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_harvesting_expense on public.harvesting_entries;
create trigger sync_harvesting_expense after insert or update on public.harvesting_entries
for each row execute function public.sync_harvesting_expense();

-- Expense link validation now covers harvesting entries too.
create or replace function public.validate_expense_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_trader_owns('employees', new.employee_id, new.trader_id);
  perform public.assert_trader_owns('vehicles', new.vehicle_id, new.trader_id);
  perform public.assert_trader_owns('coconut_trades', new.purchase_id, new.trader_id);
  perform public.assert_trader_owns('sales', new.sale_id, new.trader_id);
  perform public.assert_trader_owns('stock_entries', new.stock_entry_id, new.trader_id);
  perform public.assert_trader_owns('harvesting_entries', new.harvesting_entry_id, new.trader_id);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.harvesting_teams enable row level security;
alter table public.harvesting_team_members enable row level security;
alter table public.harvesting_entries enable row level security;

drop policy if exists "Traders manage their harvesting teams" on public.harvesting_teams;
create policy "Traders manage their harvesting teams" on public.harvesting_teams for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their harvesting team members" on public.harvesting_team_members;
create policy "Traders manage their harvesting team members" on public.harvesting_team_members for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());

drop policy if exists "Traders manage their harvesting entries" on public.harvesting_entries;
create policy "Traders manage their harvesting entries" on public.harvesting_entries for all
using (trader_id = auth.uid()) with check (trader_id = auth.uid());
