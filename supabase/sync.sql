begin;
create table public.rebanho_publicacao (
  id integer primary key check (id = 1),
  payload jsonb not null,
  hash text not null,
  atualizado_em timestamptz not null default now(),
  conferido_em timestamptz not null default now()
);
alter table public.rebanho_publicacao enable row level security;
revoke all on public.rebanho_publicacao from anon, authenticated;
grant all on public.rebanho_publicacao, public.rebanho_importacoes, public.rebanho_mapas,
  public.rebanho_movimentacoes, public.rebanho_setores to service_role;

create function public.rebanho_sincronizar(p_data jsonb, p_hash text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_id text := 'github-' || p_hash;
  v_current text;
begin
  perform pg_advisory_xact_lock(71892101);
  select hash into v_current from public.rebanho_publicacao where id=1;
  if v_current = p_hash then
    update public.rebanho_publicacao set conferido_em=now() where id=1;
    return jsonb_build_object('changed',false);
  end if;
  if jsonb_array_length(p_data->'inicial') <> (p_data->'totais'->>'inicial')::integer
     or jsonb_array_length(p_data->'final') <> (p_data->'totais'->>'final')::integer
     or jsonb_array_length(p_data->'mov') <> (p_data->'totais'->>'mov')::integer then
    raise exception 'Totais do arquivo divergentes';
  end if;
  insert into public.rebanho_importacoes
    (id,fazenda,data_inicial,data_mapa_final,fonte,saldo_inicial,saldo_final,total_movimentacoes,status)
  values (v_id,'Fazenda Bodoquena',(p_data->>'dataInicial')::date,(p_data->>'dataFinal')::date,
    'GitHub Emersonsilvaol/Mapa-de-Rebanho/dados/rebanho.json',
    jsonb_array_length(p_data->'inicial'),jsonb_array_length(p_data->'final'),
    jsonb_array_length(p_data->'mov'),'importando') on conflict(id) do nothing;
  insert into public.rebanho_setores
    select v_id,value from jsonb_array_elements_text(p_data->'setores') on conflict do nothing;
  insert into public.rebanho_mapas
    select v_id,t.tipo,n,v->>0,v->>1,v->>2,v->>3,v->>4,nullif(v->>5,'')::date
    from (values ('inicial'),('final')) as t(tipo),
      lateral jsonb_array_elements(p_data->t.tipo) with ordinality as a(v,n)
    on conflict do nothing;
  insert into public.rebanho_movimentacoes
    select v_id,n,nullif(v->>0,'')::date,v->>1,v->>2,v->>3,v->>4,v->>5
    from jsonb_array_elements(p_data->'mov') with ordinality as a(v,n)
    on conflict do nothing;
  update public.rebanho_importacoes set status='concluido' where id=v_id;
  insert into public.rebanho_publicacao(id,payload,hash)
    values(1,p_data,p_hash)
    on conflict(id) do update set payload=excluded.payload,hash=excluded.hash,
      atualizado_em=now(),conferido_em=now();
  return jsonb_build_object('changed',true,'importacao',v_id);
end;
$$;
revoke all on function public.rebanho_sincronizar(jsonb,text) from public, anon, authenticated;
grant execute on function public.rebanho_sincronizar(jsonb,text) to service_role;
commit;
