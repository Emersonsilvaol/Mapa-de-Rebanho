-- Modelo: substituir PROJECT_REF e OWNER_EMAIL antes de aplicar em outro projeto.
create extension if not exists pg_net with schema extensions;
create table public.mapa_email_config (
  id smallint primary key check (id=1),
  enabled boolean not null default false,
  test_until date,
  sender text not null,
  reply_to text not null,
  owner_email text not null,
  domain_verified boolean not null default false,
  token_hash text not null,
  signature_base64 text,
  signature_text text
);
create table public.mapa_email_recipients (
  email text primary key check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  enabled boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create table public.mapa_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  email text not null references public.mapa_email_recipients(email),
  revision bigint not null,
  source_updated_at timestamptz not null,
  status text not null check (status in ('sending','sent','failed','uncertain')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(report_date,email)
);
alter table public.mapa_email_config enable row level security;
alter table public.mapa_email_recipients enable row level security;
alter table public.mapa_email_deliveries enable row level security;
revoke all on public.mapa_email_config, public.mapa_email_recipients, public.mapa_email_deliveries from anon, authenticated;
grant all on public.mapa_email_config, public.mapa_email_recipients, public.mapa_email_deliveries to service_role;
do $body$
declare token text;
begin
  token := encode(extensions.gen_random_bytes(32),'hex');
  perform vault.create_secret(token,'mapa_email_cron_token','Autenticação privada do envio de mapa');
  insert into public.mapa_email_config(id,test_until,sender,reply_to,owner_email,token_hash)
  values(1,null,'Responsável <onboarding@resend.dev>','<OWNER_EMAIL>','<OWNER_EMAIL>',encode(extensions.digest(token,'sha256'),'hex'));
end;
$body$;
-- Cadastrar destinatários autorizados separadamente, em configuração privada.
select cron.schedule('mapa-rebanho-email-07-campo-grande','0 11 * * *',
  $cron$
  select net.http_post(
    url:='https://<PROJECT_REF>.supabase.co/functions/v1/mapa-email',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='mapa_email_cron_token')),
    body:='{"mode":"scheduled"}'::jsonb,
    timeout_milliseconds:=120000
  ) where (select enabled and (test_until is null or (now() at time zone 'America/Campo_Grande')::date<=test_until) from public.mapa_email_config where id=1);
  $cron$);
