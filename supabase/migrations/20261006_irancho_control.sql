create table public.mapa_irancho_posicoes (
 id_animal uuid primary key, sisbov text not null, payload jsonb not null,
 offset_api integer not null check(offset_api>=0), consultado_em timestamptz not null,
 verificado_em timestamptz
);
alter table public.mapa_irancho_posicoes enable row level security;
revoke all on public.mapa_irancho_posicoes from anon,authenticated;
grant select on public.mapa_irancho_posicoes to authenticated;
create policy irancho_owner_read on public.mapa_irancho_posicoes for select to authenticated using(mapa_private.is_owner());
grant all on public.mapa_irancho_posicoes to service_role;

create function mapa_private.conciliar_irancho_grupo(p_payload jsonb,p_revision bigint,p_itens jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.mapa_rebanho_estado%rowtype; c public.mapa_irancho_posicoes%rowtype; l public.mapa_locais_setores%rowtype;
 t jsonb; m jsonb; a jsonb; esperado jsonb; novos jsonb:='[]'; alterados jsonb:='{}'; ids text[]:='{}'; keys text[]:='{}'; result jsonb; n integer;
begin
 if not mapa_private.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 100 then raise exception 'Selecione de 1 a 100 animais.';end if;
 select * into e from public.mapa_rebanho_estado where id='principal' for update;
 if e.revision is distinct from p_revision then return jsonb_build_object('ok',false,'conflict',true,'revision',e.revision);end if;
 esperado:=e.payload;
 for t in select value from jsonb_array_elements(p_itens) loop
  select * into c from public.mapa_irancho_posicoes where id_animal=(t->>'id_irancho')::uuid for share;
  if not found or c.verificado_em is null or c.verificado_em<now()-interval '2 minutes' or c.payload is distinct from t->'posicao' or not coalesce((c.payload->>'ativo')::boolean,false) then raise exception 'A posição no iRancho mudou ou venceu. Refaça a conferência.';end if;
  if c.sisbov !~ '^\d{15}$' or nullif(c.payload->>'lote','') is null or nullif(c.payload->>'secao_gestao','') is null then raise exception 'Posição incompleta no iRancho.';end if;
  if (select count(*) from public.mapa_irancho_posicoes where sisbov=c.sisbov and (payload->>'ativo')::boolean)=0 then raise exception 'SISBOV indisponível.';end if;
  if (select count(*) from public.mapa_irancho_posicoes where sisbov=c.sisbov and (payload->>'ativo')::boolean)>1 then raise exception 'SISBOV repetido no iRancho.';end if;
  select * into l from public.mapa_locais_setores where id=(t->>'local_id')::uuid and ativo for share;
  if not found or upper(btrim(l.local)) is distinct from upper(btrim(c.payload->>'local')) or l.secao is distinct from c.payload->>'secao_gestao' or t->'depois' is distinct from jsonb_build_object('setor',l.secao,'local',l.local,'lote',c.payload->>'lote') then raise exception 'O vínculo local, setor ou lote mudou.';end if;
  select value into m from jsonb_array_elements(p_payload->'movimentacoes') where value->>'id'=t->>'mov_id';
  select value into a from jsonb_array_elements(e.payload->'animais') where value->>'id'=m->>'animalId';
  if m is null or a is null or m->'iranchoPosicao' is distinct from c.payload or m->>'sisbov' is distinct from c.sisbov or m->>'autorizadoPor' is distinct from auth.uid()::text or (m->>'quantidade')::numeric is distinct from 1 or m->>'tipo' not in ('Transferência entre Seções','Movimentação entre Locais') or m->>'local' is distinct from l.local or m->>'lote' is distinct from c.payload->>'lote' or m->>'data' is distinct from (now() at time zone 'America/Campo_Grande')::date::text or nullif(m->>'iranchoPosicaoChave','') is null then raise exception 'Movimentação inválida.';end if;
  if m->>'setorOrigem' is distinct from t->'antes'->>'setor' or m->>'localOrigem' is distinct from t->'antes'->>'local' or (case when m->>'tipo'='Transferência entre Seções' then m->>'setorDestino' else m->>'setorOrigem' end) is distinct from l.secao then raise exception 'Origem ou destino inválido.';end if;
  if m->>'animalId'=any(ids) or m->>'iranchoPosicaoChave'=any(keys) or exists(select 1 from jsonb_array_elements(e.payload->'movimentacoes') v where v->>'iranchoPosicaoChave'=m->>'iranchoPosicaoChave' or v->>'id'=m->>'id') then raise exception 'Animal ou posição já aplicada.';end if;
  ids:=array_append(ids,m->>'animalId');keys:=array_append(keys,m->>'iranchoPosicaoChave');novos:=novos||jsonb_build_array(m);alterados:=alterados||jsonb_build_object(m->>'animalId',c.payload->>'lote');
 end loop;
 select jsonb_agg(case when alterados ? (v->>'id') then jsonb_set(v,'{loteAtual}',alterados->(v->>'id')) else v end order by ord) into a from jsonb_array_elements(e.payload->'animais') with ordinality as x(v,ord);
 esperado:=jsonb_set(jsonb_set(esperado,'{animais}',a),'{movimentacoes}',(e.payload->'movimentacoes')||novos);
 if (jsonb_set(esperado-'geradoEm','{config}',(esperado->'config')-'_centralUpdatedAt')) is distinct from (jsonb_set(p_payload-'geradoEm','{config}',(p_payload->'config')-'_centralUpdatedAt')) then raise exception 'O grupo contém alterações fora das posições aprovadas.';end if;
 result:=mapa_private.save_state(jsonb_set(p_payload,'{geradoEm}',to_jsonb(now())),p_revision,'Conferência iRancho — '||jsonb_array_length(p_itens)||' animais');
 if not coalesce((result->>'ok')::boolean,false) then return result;end if;
 for t in select value from jsonb_array_elements(p_itens) loop
  insert into public.mapa_conciliacao_local(sisbov,local,lote,secao_mapa,secao_local,status,source_timestamp,decided_by,decided_at,updated_at,detalhes)
  values(t->'posicao'->>'sisbov',t->'depois'->>'local',t->'depois'->>'lote',t->'antes'->>'setor',t->'depois'->>'setor','resolvido',now(),auth.uid(),now(),now(),jsonb_build_object('fonte','iRancho — posição atual revalidada','antes',t->'antes','depois',t->'depois','posicao',t->'posicao','movimentacaoId',t->>'mov_id','usuario',auth.uid()));
 end loop;
 return result;
end $$;
revoke all on function mapa_private.conciliar_irancho_grupo(jsonb,bigint,jsonb) from public,anon;
grant execute on function mapa_private.conciliar_irancho_grupo(jsonb,bigint,jsonb) to authenticated;
create function public.mapa_conciliar_irancho_grupo(p_payload jsonb,p_revision bigint,p_itens jsonb) returns jsonb language sql security invoker set search_path='' as $$select mapa_private.conciliar_irancho_grupo(p_payload,p_revision,p_itens)$$;
revoke all on function public.mapa_conciliar_irancho_grupo(jsonb,bigint,jsonb) from public,anon;
grant execute on function public.mapa_conciliar_irancho_grupo(jsonb,bigint,jsonb) to authenticated;
