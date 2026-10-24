-- Let a trader schedule a cancellation: the subscription stays active until the paid period ends,
-- then the webhook moves it to 'cancelled'. This flag records that an end-of-cycle cancel is pending.
alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;
