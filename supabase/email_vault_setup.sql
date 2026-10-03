-- Apenas estrutura de acesso. Salvar a chave no Vault separadamente.
create schema if not exists mapa_email_private;
revoke all on schema mapa_email_private from public, anon, authenticated;
grant usage on schema mapa_email_private to service_role;
create view mapa_email_private.resend_credential with (security_barrier=true)
as select decrypted_secret as api_key from vault.decrypted_secrets where name='mapa_email_resend_api_key';
revoke all on mapa_email_private.resend_credential from public, anon, authenticated;
grant select on mapa_email_private.resend_credential to service_role;
create function public.mapa_email_resend_key() returns text language sql security invoker set search_path=''
as $$ select api_key from mapa_email_private.resend_credential limit 1 $$;
revoke all on function public.mapa_email_resend_key() from public, anon, authenticated;
grant execute on function public.mapa_email_resend_key() to service_role;
