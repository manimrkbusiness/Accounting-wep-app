-- MCP / OAuth 2.1 authorization-server storage.
--
-- BizzTrack acts as its own OAuth server so a signed-in trader can connect their account to Claude
-- or ChatGPT and read/write ONLY their own data. These three tables hold registered clients,
-- one-time authorization codes, and issued access/refresh tokens. Tokens and codes are stored ONLY
-- as SHA-256 hashes — the plaintext never touches the database.
--
-- Security: these tables are read/written exclusively by the server-side service role. RLS is
-- enabled with NO policies and all grants to anon/authenticated are revoked, so they are completely
-- unreachable through the public API; only the service role (which bypasses RLS) can touch them.

create table if not exists public.mcp_oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null default '{}',
  grant_types text[] not null default '{authorization_code,refresh_token}',
  token_endpoint_auth_method text not null default 'none',
  scope text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key,
  client_id text not null,
  trader_id uuid not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text,
  resource text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  trader_id uuid not null,
  access_token_hash text not null unique,
  refresh_token_hash text unique,
  scope text,
  resource text,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists mcp_oauth_tokens_access_idx on public.mcp_oauth_tokens (access_token_hash) where not revoked;
create index if not exists mcp_oauth_tokens_refresh_idx on public.mcp_oauth_tokens (refresh_token_hash) where not revoked;
create index if not exists mcp_oauth_tokens_trader_idx on public.mcp_oauth_tokens (trader_id);
create index if not exists mcp_oauth_codes_expires_idx on public.mcp_oauth_codes (expires_at);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_oauth_tokens enable row level security;
-- No RLS policies on purpose: only the service role may read/write these rows.

revoke all on public.mcp_oauth_clients from anon, authenticated;
revoke all on public.mcp_oauth_codes from anon, authenticated;
revoke all on public.mcp_oauth_tokens from anon, authenticated;
