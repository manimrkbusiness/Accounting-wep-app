-- Track whether a profile's phone number has been verified by SMS OTP.
-- Phase 1 (email OTP) does not set this; it is here so the later phone-OTP phase can flip it,
-- and so farmer phone-matching can prefer verified numbers. Backward-compatible (default false).
alter table public.profiles
  add column if not exists phone_verified boolean not null default false;
