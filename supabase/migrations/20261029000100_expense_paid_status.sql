-- Team payment tracking: let the trader mark each team's wages Paid or Pending.
-- Labor (and any other) expense rows get a paid flag the trader toggles from the
-- Team page and the Coconut Harvesting history. Existing rows default to unpaid.
--
-- The trader already has full row-level access to their own expenses
-- ("Traders manage their expenses"), so no new policy is needed to toggle these.
alter table public.expenses
  add column if not exists paid boolean not null default false,
  add column if not exists paid_at timestamptz;
