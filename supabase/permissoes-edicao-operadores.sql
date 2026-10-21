
CREATE OR REPLACE FUNCTION mapa_private.merge_operator_edits(base jsonb, changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE perms jsonb; item jsonb; old jsonb; merged jsonb; result jsonb:=base; arr jsonb; field text; mod text; allowed boolean; rec record;
BEGIN
 SELECT permissions INTO perms FROM public.profiles WHERE id=auth.uid() AND ativo=true;
 IF auth.uid() IS NULL OR perms IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(changes) IS DISTINCT FROM 'object' OR (changes - 'animais' - 'movimentacoes') <> '{}'::jsonb THEN RAISE EXCEPTION 'Alteração inválida.'; END IF;
 FOREACH field IN ARRAY ARRAY['movimentacoes','animais'] LOOP
  IF jsonb_typeof(coalesce(changes->field,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Alteração inválida.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(changes->field,'[]'::jsonb)) LOOP
   IF coalesce(item->>'id','')='' OR jsonb_typeof(item->'set') IS DISTINCT FROM 'object' OR item->'set' ? 'id' THEN RAISE EXCEPTION 'Registro inválido.'; END IF;
   SELECT value INTO old FROM jsonb_array_elements(result->field) WHERE value->>'id'=item->>'id';
   merged=coalesce(old,jsonb_build_object('id',item->>'id'))||(item->'set');
   IF field='movimentacoes' THEN
    FOR mod IN SELECT DISTINCT CASE v->>'tipo' WHEN 'Nascimento' THEN 'nascimentos' WHEN 'Morte' THEN 'mortalidade' WHEN 'Reidentificação' THEN 'reidentificacao' ELSE 'movimentacoes' END FROM (VALUES(old),(merged)) t(v) WHERE v IS NOT NULL LOOP
     IF NOT (coalesce(perms->'movimentacoes','[]') @> '["ver","editar"]'::jsonb OR coalesce(perms->mod,'[]') @> '["ver","editar"]'::jsonb) THEN RAISE EXCEPTION 'Sem permissão para editar ou lançar em %.',mod USING ERRCODE='42501'; END IF;
    END LOOP;
   ELSE
    allowed=coalesce(perms->'mapaInicial','[]') @> '["ver","editar"]'::jsonb;
    IF NOT allowed THEN
     IF ((item->'set') - ARRAY['sisbov','brinco','chip','sexo','raca','nascimento','setorInicial','origem','dataEntrada','updatedAt']) <> '{}'::jsonb THEN RAISE EXCEPTION 'Campo do cadastro não autorizado.' USING ERRCODE='42501'; END IF;
     -- Every animal edit must belong to an explicitly submitted, authorized movement.
     allowed=false;
     FOR rec IN SELECT m.value AS m FROM jsonb_array_elements(result->'movimentacoes') m JOIN jsonb_array_elements(coalesce(changes->'movimentacoes','[]')) c ON c.value->>'id'=m.value->>'id' WHERE m.value->>'animalId'=item->>'id' LOOP
      allowed=true;
      FOR mod IN SELECT jsonb_object_keys(item->'set') LOOP
       IF mod IN ('updatedAt') THEN CONTINUE; END IF;
       IF mod='origem' THEN
        IF old IS NOT NULL OR item->'set'->>mod NOT IN ('cadastro','compra','nascimento') THEN allowed=false; END IF;
       ELSIF mod='setorInicial' THEN
        IF old IS NOT NULL AND coalesce(old->>mod,'')<>'' THEN allowed=false;
        ELSIF item->'set'->>mod IS DISTINCT FROM coalesce(nullif(rec.m->>'setorOrigem',''),rec.m->>'setorDestino') THEN allowed=false; END IF;
       ELSIF mod='dataEntrada' THEN
        IF old IS NOT NULL OR item->'set'->>mod IS DISTINCT FROM rec.m->>'data' THEN allowed=false; END IF;
       ELSIF item->'set'->>mod IS DISTINCT FROM coalesce(rec.m->>(CASE mod WHEN 'sisbov' THEN CASE WHEN rec.m->>'tipo'='Reidentificação' THEN 'sisbovNovo' ELSE mod END WHEN 'brinco' THEN CASE WHEN rec.m->>'tipo'='Reidentificação' THEN 'brincoNovo' ELSE mod END ELSE mod END),'') THEN allowed=false;
       END IF;
      END LOOP;
      IF allowed THEN EXIT; END IF;
     END LOOP;
     IF NOT allowed THEN RAISE EXCEPTION 'Alteração do cadastro sem lançamento autorizado.' USING ERRCODE='42501'; END IF;
    END IF;
   END IF;
   SELECT coalesce(jsonb_agg(CASE WHEN value->>'id'=item->>'id' THEN merged ELSE value END),'[]'::jsonb) INTO arr FROM jsonb_array_elements(result->field);
   IF old IS NULL THEN arr=arr||jsonb_build_array(merged); END IF;
   result=jsonb_set(result,ARRAY[field],arr);
  END LOOP;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION mapa_private.merge_operator_edits(jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION mapa_private.save_state(p_payload jsonb, p_revision bigint, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  declare
    current_revision bigint;
    next_revision bigint;
    confirmed_updated_at timestamptz;
    clean_payload jsonb := p_payload;
    target_sisbov text;
    canonical_id text;
    keeper_id text;
    remap_ids text[];
    clean_animais jsonb;
    clean_movs jsonb;
    fixed_count int := 0;
  begin
    if auth.uid() is null then raise exception 'Sessão inválida.' using errcode='42501'; end if;

    if mapa_private.is_owner() and (jsonb_typeof(clean_payload->'animais') is distinct from 'array'
       or jsonb_typeof(clean_payload->'movimentacoes') is distinct from 'array'
       or jsonb_typeof(clean_payload->'setores') is distinct from 'array'
       or jsonb_typeof(clean_payload->'config') is distinct from 'object')
    then
      raise exception 'Base inválida.';
    end if;

    select revision into current_revision
    from public.mapa_rebanho_estado
    where id='principal'
    for update;

    if p_revision is null or current_revision is distinct from p_revision then
      return jsonb_build_object(
        'ok',false,
        'conflict',true,
        'revision',current_revision
      );
    end if;

    if not mapa_private.is_owner() then
      clean_payload=mapa_private.merge_operator_edits(
        (select payload from public.mapa_rebanho_estado where id='principal'),
        p_payload->'_operatorChanges'
      );
    end if;

    -- Corrige duplicidades de SISBOV somente quando esse SISBOV já possui
    -- exatamente um cadastro oficial na base central atual.
    for target_sisbov in
      select a->>'sisbov'
      from jsonb_array_elements(clean_payload->'animais') a
      where coalesce(a->>'sisbov','')<>''
      group by a->>'sisbov'
      having count(*)>1
    loop
      select o->>'id'
        into canonical_id
      from public.mapa_rebanho_estado e,
           jsonb_array_elements(e.payload->'animais') o
      where e.id='principal'
        and o->>'sisbov'=target_sisbov
      group by o->>'id'
      having (
        select count(*)
        from public.mapa_rebanho_estado e2,
             jsonb_array_elements(e2.payload->'animais') o2
        where e2.id='principal'
          and o2->>'sisbov'=target_sisbov
      )=1
      limit 1;

      if canonical_id is null then
        continue;
      end if;

      -- Prefere o próprio cadastro oficial se ele estiver no rascunho.
      select x->>'id'
        into keeper_id
      from jsonb_array_elements(clean_payload->'animais') with ordinality t(x,ord)
      where x->>'sisbov'=target_sisbov
      order by ((x->>'id')=canonical_id) desc, ord
      limit 1;

      select coalesce(array_agg(x->>'id'),'{}'::text[])
        into remap_ids
      from jsonb_array_elements(clean_payload->'animais') x
      where x->>'sisbov'=target_sisbov
        and x->>'id'<>canonical_id;

      select coalesce(jsonb_agg(
        case
          when x->>'sisbov'=target_sisbov and x->>'id'=keeper_id and keeper_id<>canonical_id
            then jsonb_set(x,'{id}',to_jsonb(canonical_id),true)
          else x
        end
      ),'[]'::jsonb)
      into clean_animais
      from jsonb_array_elements(clean_payload->'animais') x
      where not (
        x->>'sisbov'=target_sisbov
        and x->>'id'<>keeper_id
      );

      select coalesce(jsonb_agg(
        case
          when coalesce(m->>'animalId','')=any(remap_ids)
               or (keeper_id<>canonical_id and m->>'animalId'=keeper_id)
            then jsonb_set(m,'{animalId}',to_jsonb(canonical_id),true)
          else m
        end
      ),'[]'::jsonb)
      into clean_movs
      from jsonb_array_elements(clean_payload->'movimentacoes') m;

      clean_payload=jsonb_set(clean_payload,'{animais}',clean_animais,true);
      clean_payload=jsonb_set(clean_payload,'{movimentacoes}',clean_movs,true);
      fixed_count=fixed_count+1;
      canonical_id=null;
      keeper_id=null;
      remap_ids='{}'::text[];
    end loop;

    if exists(
      select 1 from jsonb_array_elements(clean_payload->'animais') a
      group by a->>'id'
      having count(*)>1 or a->>'id' is null
    ) or exists(
      select 1 from jsonb_array_elements(clean_payload->'movimentacoes') a
      group by a->>'id'
      having count(*)>1 or a->>'id' is null
    ) then
      raise exception 'Identificadores ausentes ou duplicados na base.';
    end if;

    perform set_config(
      'mapa.motivo',
      left(
        coalesce(p_reason,'') ||
        case when fixed_count>0 then ' | Deduplicação automática de SISBOV já existente na base oficial' else '' end,
        500
      ),
      true
    );

    update public.mapa_rebanho_estado
       set payload=clean_payload,
           updated_by=auth.uid()
     where id='principal'
     returning revision, updated_at
          into next_revision, confirmed_updated_at;

    return jsonb_build_object(
      'ok',true,
      'revision',next_revision,
      'updated_at',confirmed_updated_at,
      'deduplicated_groups',fixed_count
    );
  end
  $function$
;