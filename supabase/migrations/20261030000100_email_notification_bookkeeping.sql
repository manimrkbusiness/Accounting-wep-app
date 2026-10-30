-- Email notification bookkeeping on profiles.
-- welcome_email_at  : set once, when the one-time welcome email has been sent.
-- last_login_email_at: throttles the "new sign-in" security alert so repeated sign-ins
--                      in a short window don't send a burst of emails.
alter table public.profiles add column if not exists welcome_email_at timestamptz;
alter table public.profiles add column if not exists last_login_email_at timestamptz;

-- (No backfill: a bulk UPDATE re-runs the profile phone-identity trigger, which rejects rows that
-- share a phone number. New sign-ups get a welcome; any pre-existing account simply gets one welcome
-- on its next sign-in instead of a login alert — harmless, and nothing sends until Resend is set up.)
