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
