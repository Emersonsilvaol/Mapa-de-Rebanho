BEGIN;
SET LOCAL statement_timeout='8s';
DO $test$
DECLARE actor uuid; base jsonb; rev bigint; changes jsonb; outcome jsonb; started timestamptz; unauthorized_blocked boolean:=false; duplicate_blocked boolean:=false; n integer; elapsed_ms numeric;
BEGIN
 SELECT p.id INTO actor FROM public.profiles p
 WHERE p.ativo=true AND lower(coalesce(p.email,'')) NOT IN ('emerson.oliveira@fazendabodoquena.com.br','emersontec13@gmail.com')
 AND (coalesce(p.permissions->'nascimentos','[]') @> '["ver","editar"]'::jsonb OR coalesce(p.permissions->'movimentacoes','[]') @> '["ver","editar"]'::jsonb) LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Operador de teste não encontrado'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF mapa_private.is_owner() THEN RAISE EXCEPTION 'Teste exige operador'; END IF;
 SELECT payload,revision INTO base,rev FROM public.mapa_rebanho_estado WHERE id='principal' FOR UPDATE;
 SELECT jsonb_build_object(
 'movimentacoes',jsonb_agg(jsonb_build_object('id','teste-import-m-'||i,'set',jsonb_build_object('tipo','Nascimento','data','2026-11-26','quantidade',1,'sisbov','07699999'||lpad(i::text,7,'0'),'animalId','teste-import-a-'||i,'sexo','Fêmea','raca','NE','nascimento','2026-11-26','setorOrigem','Bela Vista','setorDestino','Bela Vista','brinco','','chip','')) ORDER BY i),
 'animais',jsonb_agg(jsonb_build_object('id','teste-import-a-'||i,'set',jsonb_build_object('origem','nascimento','sisbov','07699999'||lpad(i::text,7,'0'),'sexo','Fêmea','raca','NE','nascimento','2026-11-26','setorInicial','Bela Vista','brinco','','chip','')) ORDER BY i)
 ) INTO changes FROM generate_series(1,223) i;
 started=clock_timestamp();
 outcome=public.mapa_salvar(jsonb_build_object('_operatorChanges',changes),rev,'Teste de lote 223 — transação revertida');
 elapsed_ms=extract(epoch FROM clock_timestamp()-started)*1000;
 IF outcome->>'ok' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Falha no teste: %',outcome; END IF;
 SELECT jsonb_array_length(payload->'movimentacoes') INTO n FROM public.mapa_rebanho_estado WHERE id='principal';
 IF n<>jsonb_array_length(base->'movimentacoes')+223 THEN RAISE EXCEPTION 'Contagem divergente'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
  PERFORM mapa_private.merge_operator_edits(base,jsonb_build_object('movimentacoes','[]'::jsonb,'animais',jsonb_build_array(jsonb_build_object('id','tentativa-sem-mov','set',jsonb_build_object('origem','nascimento','sisbov','076999990000999')))));
 EXCEPTION WHEN insufficient_privilege THEN unauthorized_blocked=true; END;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 IF NOT unauthorized_blocked THEN RAISE EXCEPTION 'Falha na proteção de sessão'; END IF;
 BEGIN
  PERFORM public.mapa_salvar(jsonb_build_object('_operatorChanges',jsonb_build_object('movimentacoes',jsonb_build_array(jsonb_build_object('id','teste-duplicado','set',(changes->'movimentacoes'->0->'set'))),'animais','[]'::jsonb)),(outcome->>'revision')::bigint,'Teste duplicado — revertido');
 EXCEPTION WHEN unique_violation OR raise_exception THEN duplicate_blocked=true; END;
 IF NOT duplicate_blocked THEN RAISE EXCEPTION 'Falha na trava de duplicidade'; END IF;
 RAISE NOTICE '223 nascimentos salvos em % ms; duplicidade bloqueada=%; sessão inválida bloqueada=%; tudo será revertido',round(elapsed_ms),duplicate_blocked,unauthorized_blocked;
END $test$;
ROLLBACK;
SELECT revision,jsonb_array_length(payload->'animais') AS animais,jsonb_array_length(payload->'movimentacoes') AS movimentos,position('old_by_id' IN (SELECT prosrc FROM pg_proc WHERE oid='mapa_private.merge_operator_edits(jsonb,jsonb)'::regprocedure))>0 AS rotina_otimizada FROM public.mapa_rebanho_estado WHERE id='principal';
