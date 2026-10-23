-- Record consent captured at sign-up / onboarding: when the user accepted the Terms & Privacy
-- Policy (required), and whether they opted in to marketing (optional). Backward-compatible.
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists marketing_consent boolean not null default false;
