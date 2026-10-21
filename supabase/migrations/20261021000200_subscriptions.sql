-- Billing: a 14-day free trial per trader, then a Razorpay ₹499/month subscription.
-- Status is written only by the server (service role) after verifying payment; traders can read
-- their own row but never write it, so no one can self-activate without paying.

create table if not exists public.subscriptions (
  trader_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'cancelled', 'halted')),
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  razorpay_customer_id text,
  razorpay_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_rzp_sub_idx on public.subscriptions (razorpay_subscription_id);

alter table public.subscriptions enable row level security;

-- Traders may read their own subscription; all writes go through the server with the service role.
drop policy if exists "Traders read their subscription" on public.subscriptions;
create policy "Traders read their subscription" on public.subscriptions for select
  using (trader_id = auth.uid());
