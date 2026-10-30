-- Free trial shortened from 14 to 9 days. Only affects newly created trial rows; existing trials keep
-- whatever end date they already have.
alter table public.subscriptions alter column trial_ends_at set default (now() + interval '9 days');
