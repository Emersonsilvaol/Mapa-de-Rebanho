CREATE OR REPLACE FUNCTION mapa_private.merge_operator_edits(base jsonb, changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE perms jsonb; item jsonb; old jsonb; merged jsonb; result jsonb:=base; arr jsonb; field text;
 old_by_id jsonb; merged_by_id jsonb; submitted_by_animal jsonb; id text; mod text; allowed boolean; rec record;
BEGIN
 SELECT permissions INTO perms FROM public.profiles p WHERE p.id=auth.uid() AND p.ativo=true;
 IF auth.uid() IS NULL OR perms IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado.' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(changes) IS DISTINCT FROM 'object' OR (changes - 'animais' - 'movimentacoes') <> '{}'::jsonb THEN RAISE EXCEPTION 'Alteração inválida.'; END IF;
 FOREACH field IN ARRAY ARRAY['movimentacoes','animais'] LOOP
  IF jsonb_typeof(coalesce(changes->field,'[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Alteração inválida.'; END IF;
  SELECT coalesce(jsonb_object_agg(value->>'id', value), '{}'::jsonb)
    INTO old_by_id FROM jsonb_array_elements(result->field)
    WHERE value->>'id' IS NOT NULL;
  merged_by_id='{}'::jsonb;
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(changes->field,'[]'::jsonb)) LOOP
   IF coalesce(item->>'id','')='' OR jsonb_typeof(item->'set') IS DISTINCT FROM 'object' OR item->'set' ? 'id' THEN RAISE EXCEPTION 'Registro inválido.'; END IF;
   id=item->>'id';
   IF merged_by_id ? id THEN RAISE EXCEPTION 'Identificador repetido no lote.'; END IF;
   old=old_by_id->id;
   merged=coalesce(old,jsonb_build_object('id',id))||(item->'set');
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
     FOR rec IN SELECT value AS m FROM jsonb_array_elements(coalesce(submitted_by_animal->id,'[]'::jsonb)) LOOP
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
   merged_by_id=merged_by_id||jsonb_build_object(id,merged);
  END LOOP;

  IF field='movimentacoes' THEN
   SELECT coalesce(jsonb_object_agg(animal_id, movements),'{}'::jsonb) INTO submitted_by_animal
   FROM (
    SELECT value->>'animalId' AS animal_id, jsonb_agg(value) AS movements
    FROM jsonb_each(merged_by_id)
    WHERE value->>'animalId' IS NOT NULL
    GROUP BY value->>'animalId'
   ) grouped;
  END IF;

  IF merged_by_id='{}'::jsonb THEN CONTINUE; END IF;
  SELECT coalesce(jsonb_agg(coalesce(merged_by_id->(value->>'id'),value) ORDER BY ord),'[]'::jsonb)
   INTO arr FROM jsonb_array_elements(result->field) WITH ORDINALITY AS existing(value,ord);
  SELECT arr||coalesce(jsonb_agg(merged_by_id->(value->>'id') ORDER BY ord),'[]'::jsonb)
   INTO arr FROM jsonb_array_elements(changes->field) WITH ORDINALITY AS submitted(value,ord)
   WHERE NOT old_by_id ? (value->>'id');
  result=jsonb_set(result,ARRAY[field],arr);
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION mapa_private.merge_operator_edits(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
