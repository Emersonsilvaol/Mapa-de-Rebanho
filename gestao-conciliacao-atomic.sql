-- Integração Gestão Pecuária → Mapa: migrações aplicadas em 04/10/2026.
alter table public.gp_animal_positions add column if not exists cadastro_origem text, add column if not exists cadastro_usuario text, add column if not exists cadastro_em text, add column if not exists responsavel_manejo text;
alter table public.mapa_conciliacao_local add column if not exists detalhes jsonb not null default '{}'::jsonb;
create or replace function mapa_private.conciliar_gestao(p_payload jsonb,p_revision bigint,p_posicao jsonb,p_local_id uuid,p_antes jsonb,p_depois jsonb,p_mov_id text,p_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare pos public.gp_animal_positions%rowtype;loc public.mapa_locais_setores%rowtype;result jsonb;mv jsonb;begin
 if not mapa_private.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501';end if;
 if p_status is null or p_status not in ('movimentado','resolvido') then raise exception 'Decisão inválida.';end if;
 select * into pos from public.gp_animal_positions where sisbov=p_posicao->>'sisbov' for share;
 if not found then raise exception 'Leitura não encontrada.';end if;
 if pos.updated_at is distinct from (p_posicao->>'updated_at')::timestamptz or pos.data_posicao is distinct from (p_posicao->>'data_posicao')::timestamptz or coalesce(pos.local,'')<>coalesce(p_posicao->>'local','') or coalesce(pos.lote,'')<>coalesce(p_posicao->>'lote','') or coalesce(pos.secao_gestao,'')<>coalesce(p_posicao->>'secao_gestao','') then raise exception 'A Gestão alterou a leitura. Refaça a conferência.';end if;
 select * into loc from public.mapa_locais_setores where id=p_local_id and ativo for share;
 if not found or loc.local is distinct from p_depois->>'local' or loc.secao is distinct from p_depois->>'setor' then raise exception 'O vínculo local/setor mudou. Refaça a conferência.';end if;
 select m into mv from jsonb_array_elements(p_payload->'movimentacoes') m where m->>'id'=p_mov_id;
 if mv is null or nullif(mv->>'gestaoLeituraChave','') is null or (mv->>'quantidade')::numeric is distinct from 1 or mv->>'tipo' not in ('Transferência entre Seções','Movimentação entre Locais') or mv->>'local' is distinct from loc.local or mv->>'lote' is distinct from p_depois->>'lote' or mv->>'autorizadoPor' is distinct from auth.uid()::text then raise exception 'Movimentação de conciliação inválida.';end if;
 if exists(select 1 from public.mapa_rebanho_estado e cross join lateral jsonb_array_elements(e.payload->'movimentacoes') m where e.id='principal' and m->>'gestaoLeituraChave'=mv->>'gestaoLeituraChave') then raise exception 'Esta leitura já foi aplicada.';end if;
 result=mapa_private.save_state(p_payload,p_revision,'Conciliação Gestão Pecuária — '||pos.sisbov);
 if not coalesce((result->>'ok')::boolean,false) then return result;end if;
 insert into public.mapa_conciliacao_local(sisbov,local,lote,secao_mapa,secao_local,status,source_timestamp,decided_by,decided_at,updated_at,detalhes) values(pos.sisbov,loc.local,p_depois->>'lote',p_antes->>'setor',loc.secao,p_status,pos.data_posicao,auth.uid(),now(),now(),jsonb_build_object('antes',p_antes,'depois',p_depois,'movimentacaoId',p_mov_id,'leitura',to_jsonb(pos),'autorizadoPor',auth.uid()));
 return result;
end $$;
revoke all on function mapa_private.conciliar_gestao(jsonb,bigint,jsonb,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
create or replace function public.mapa_conciliar_gestao(p_payload jsonb,p_revision bigint,p_posicao jsonb,p_local_id uuid,p_antes jsonb,p_depois jsonb,p_mov_id text,p_status text) returns jsonb language sql security invoker set search_path='' as $$select mapa_private.conciliar_gestao(p_payload,p_revision,p_posicao,p_local_id,p_antes,p_depois,p_mov_id,p_status);$$;
grant execute on function mapa_private.conciliar_gestao(jsonb,bigint,jsonb,uuid,jsonb,jsonb,text,text) to authenticated;
revoke all on function public.mapa_conciliar_gestao(jsonb,bigint,jsonb,uuid,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.mapa_conciliar_gestao(jsonb,bigint,jsonb,uuid,jsonb,jsonb,text,text) to authenticated;

-- Aprovação única dos locais/lotes conferidos, sem transferência de setor.
create or replace function mapa_private.conciliar_gestao_grupo(p_payload jsonb,p_revision bigint,p_itens jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;pos public.gp_animal_positions%rowtype;loc public.mapa_locais_setores%rowtype;mv jsonb;movs jsonb;usadas jsonb;estado jsonb;rev bigint;result jsonb;n integer;
begin
 if not mapa_private.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' then raise exception 'Grupo inválido.';end if;
 n=jsonb_array_length(p_itens);if n<1 or n>30000 then raise exception 'Grupo vazio ou acima do limite.';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) i group by i->'posicao'->>'sisbov' having count(*)>1 or i->'posicao'->>'sisbov' is null) or exists(select 1 from jsonb_array_elements(p_itens) i group by i->>'mov_id' having count(*)>1 or i->>'mov_id' is null) then raise exception 'Leituras ou movimentos repetidos.';end if;
 -- Mesmo ordenamento em chamadas concorrentes evita inversão dos bloqueios.
 perform 1 from public.gp_animal_positions where sisbov in (select i->'posicao'->>'sisbov' from jsonb_array_elements(p_itens) i) order by sisbov for share;
 perform 1 from public.mapa_locais_setores where id in (select (i->>'local_id')::uuid from jsonb_array_elements(p_itens) i) order by id for share;
 select payload,revision into estado,rev from public.mapa_rebanho_estado where id='principal' for update;
 if p_revision is null or rev is distinct from p_revision then return jsonb_build_object('ok',false,'conflict',true,'revision',rev);end if;
 select coalesce(jsonb_object_agg(m->>'id',m),'{}'::jsonb) into movs from jsonb_array_elements(p_payload->'movimentacoes') m;
 select coalesce(jsonb_object_agg(m->>'gestaoLeituraChave',true),'{}'::jsonb) into usadas from jsonb_array_elements(estado->'movimentacoes') m where nullif(m->>'gestaoLeituraChave','') is not null;
 if jsonb_array_length(p_payload->'movimentacoes') is distinct from jsonb_array_length(estado->'movimentacoes')+n then raise exception 'Quantidade de movimentos incompatível com o grupo.';end if;
 for item in select i from jsonb_array_elements(p_itens) i order by i->'posicao'->>'sisbov' loop
  select * into pos from public.gp_animal_positions where sisbov=item->'posicao'->>'sisbov';
  if not found or pos.updated_at is distinct from (item->'posicao'->>'updated_at')::timestamptz or to_jsonb(pos) is distinct from item->'posicao' then raise exception 'A leitura % mudou. Refaça a conferência do grupo.',item->'posicao'->>'sisbov';end if;
  if pos.data_posicao is null or (pos.data_posicao at time zone 'America/Campo_Grande')::date>(now() at time zone 'America/Campo_Grande')::date or nullif(trim(pos.lote),'') is null or nullif(trim(pos.secao_gestao),'') is null then raise exception 'Data, lote ou setor não conferido: %.',pos.sisbov;end if;
  select * into loc from public.mapa_locais_setores where id=(item->>'local_id')::uuid and ativo;
  if not found or loc.local is distinct from item->'depois'->>'local' or loc.secao is distinct from item->'depois'->>'setor' or item->'antes'->>'setor' is distinct from item->'depois'->>'setor' or pos.lote is distinct from item->'depois'->>'lote' then raise exception 'O vínculo local/setor/lote mudou: %.',pos.sisbov;end if;
  if regexp_replace(translate(lower(pos.secao_gestao),'áàâãéèêíìîóòôõúùûç','aaaaeeeiiioooouuuc'),'[^a-z0-9]','','g') is distinct from regexp_replace(translate(lower(loc.secao),'áàâãéèêíìîóòôõúùûç','aaaaeeeiiioooouuuc'),'[^a-z0-9]','','g') then raise exception 'Setor da leitura divergente: %.',pos.sisbov;end if;
  mv=movs->(item->>'mov_id');
  if mv is null or nullif(mv->>'gestaoLeituraChave','') is null or (mv->>'quantidade')::numeric is distinct from 1 or mv->>'tipo' is distinct from 'Movimentação entre Locais' or coalesce(mv->>'setorDestino','')<>'' or mv->>'setorOrigem' is distinct from loc.secao or mv->>'local' is distinct from loc.local or mv->>'lote' is distinct from pos.lote or mv->>'autorizadoPor' is distinct from auth.uid()::text or mv->'gestaoOrigem'->>'sisbovLido' is distinct from pos.sisbov then raise exception 'Movimentação inválida: %.',pos.sisbov;end if;
  if usadas ? (mv->>'gestaoLeituraChave') then raise exception 'Leitura já aplicada: %.',pos.sisbov;end if;
  usadas=usadas||jsonb_build_object(mv->>'gestaoLeituraChave',true);

 end loop;
 result=mapa_private.save_state(p_payload,p_revision,'Conciliação Gestão Pecuária em grupo — '||n||' animais');
 if not coalesce((result->>'ok')::boolean,false) then return result;end if;
 insert into public.mapa_conciliacao_local(sisbov,local,lote,secao_mapa,secao_local,status,source_timestamp,decided_by,decided_at,updated_at,detalhes)
 select gp.sisbov,ls.local,gp.lote,ls.secao,ls.secao,'resolvido',gp.data_posicao,auth.uid(),now(),now(),jsonb_build_object('antes',i->'antes','depois',i->'depois','movimentacaoId',i->>'mov_id','leitura',to_jsonb(gp),'autorizadoPor',auth.uid(),'aprovacaoEmGrupo',true) from jsonb_array_elements(p_itens) i join public.gp_animal_positions gp on gp.sisbov=i->'posicao'->>'sisbov' join public.mapa_locais_setores ls on ls.id=(i->>'local_id')::uuid;
 return result||jsonb_build_object('atualizados',n);
end $$;
revoke all on function mapa_private.conciliar_gestao_grupo(jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function mapa_private.conciliar_gestao_grupo(jsonb,bigint,jsonb) to authenticated;
create or replace function public.mapa_conciliar_gestao_grupo(p_payload jsonb,p_revision bigint,p_itens jsonb) returns jsonb language sql security invoker set search_path='' as $$select mapa_private.conciliar_gestao_grupo(p_payload,p_revision,p_itens);$$;
revoke all on function public.mapa_conciliar_gestao_grupo(jsonb,bigint,jsonb) from public,anon;
grant execute on function public.mapa_conciliar_gestao_grupo(jsonb,bigint,jsonb) to authenticated;
