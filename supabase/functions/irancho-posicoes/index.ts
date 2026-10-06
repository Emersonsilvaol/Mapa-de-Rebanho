import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

import { normalizarAnimal } from './positions.js';
const OWNER = 'emerson.oliveira@fazendabodoquena.com.br';
const ORIGIN = 'https://mapa-de-rebanho.vercel.app';
const headers = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET','POST'].includes(req.method)) return json({ error: 'Use GET para consultar ou POST para revalidar.' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return json({ error: 'Faça login no Mapa de Rebanho.' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authError } = await db.auth.getUser(auth.slice(7));
  if (authError || !user) return json({ error: 'Sessão inválida.' }, 401);
  const { data: profile, error: profileError } = await db.from('profiles').select('ativo').eq('id', user.id).single();
  if (user.email?.toLowerCase() !== OWNER || profileError || profile?.ativo !== true) return json({ error: 'Consulta exclusiva do proprietário ativo.' }, 403);
  const token = Deno.env.get('IRANCHO_API_TOKEN')?.trim();
  if (!token) return json({ error: 'Token iRancho ainda não configurado no servidor.', code: 'IRANCHO_TOKEN_PENDENTE' }, 503);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  // Verified live: iRancho uses 1-based page numbers despite Swagger describing SQL offset.
  const pagina = async (offset:number) => {
    for(let tentativa=0;tentativa<2;tentativa++){
      try{
        const response=await fetch(`https://api.irancho.com.br/api/animal?limite=500&pagina=${offset/500+1}&column=id_animal&order=ascending`, {headers:{accept:'application/json','x-access-token-ws':token},redirect:'error',signal:AbortSignal.timeout(25000)});
        if(!response.ok){if(tentativa===0&&[429,502,503,504].includes(response.status)){await new Promise(r=>setTimeout(r,1000));continue;}throw Error('iRancho recusou a consulta dos animais ('+response.status+').');}
        const raw=await response.json();if(!Array.isArray(raw)||raw.length>500)throw Error('Resposta de animais incompatível.');
        return raw.map(normalizarAnimal);
      }catch(e){if(e instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(e.name)){if(tentativa===0)continue;throw Error('O iRancho demorou a responder. Consulte novamente; nenhuma movimentação foi realizada.');}throw e;}
    }
    throw Error('iRancho indisponível. Consulte novamente.');
  };
  try {
    if(req.method==='GET'){
      const offset=Number(new URL(req.url).searchParams.get('offset')||0);
      if(!Number.isInteger(offset)||offset<0||offset>30000||offset%500!==0)return json({error:'Página inválida.'},400);
      const posicoes=await pagina(offset),consultado_em=new Date().toISOString();
      if(posicoes.length){const {error}=await admin.from('mapa_irancho_posicoes').upsert(posicoes.map(p=>({id_animal:p.id_animal,sisbov:p.sisbov,payload:p,offset_api:offset,consultado_em,verificado_em:null})));if(error)throw Error('Não foi possível registrar a consulta para conferência.');}
      return json({posicoes,consultado_em,proximo_offset:posicoes.length===500?offset+500:null,somente_consulta:true});
    }
    const input=await req.json(),ids=input?.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'))return json({error:'Selecione de 1 a 100 animais.'},400);
    const {data:cache,error}=await admin.from('mapa_irancho_posicoes').select('*').in('id_animal',ids);
    if(error||cache?.length!==ids.length)throw Error('Atualize a conferência antes de aprovar.');
    const current=new Map();
    for(const offset of new Set(cache.map(c=>c.offset_api))){for(const p of await pagina(offset))current.set(p.id_animal,p);}
    for(const c of cache){if(JSON.stringify(c.payload)!==JSON.stringify(current.get(c.id_animal))) {
      // JSONB changes key order; compare normalized fields rather than serialized object order.
      const p=current.get(c.id_animal);if(!p||Object.keys(p).some(k=>JSON.stringify(c.payload[k])!==JSON.stringify(p[k])))throw Error('A posição no iRancho mudou. Atualize a conferência antes de aprovar.');
    }}
    const r=await fetch('https://api.irancho.com.br/api/fazenda/subdivisao',{headers:{accept:'application/json','x-access-token-ws':token},redirect:'error',signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw Error('Não foi possível validar a seção do local no iRancho.');
    const catalogo=await r.json();if(!Array.isArray(catalogo))throw Error('Catálogo de locais inválido.');
    for(const c of cache){const p=current.get(c.id_animal),loc=catalogo.find(v=>String(v.id_fazenda_subdivisao)===p.local_codigo);
      if(!p.ativo||!/^\d{15}$/.test(p.sisbov)||!p.secao_gestao||!p.lote||!loc||Number(loc.id_fazenda)!==p.fazenda_id||String(loc.no_subdivisao||'').trim()!==p.local)throw Error('Posição incompleta ou seção e local divergentes no iRancho. Revise a origem.');
    }
    const verificado_em=new Date().toISOString();
    const saved=await admin.from('mapa_irancho_posicoes').upsert(cache.map(c=>({id_animal:c.id_animal,sisbov:c.sisbov,payload:current.get(c.id_animal),offset_api:c.offset_api,consultado_em:verificado_em,verificado_em})));
    if(saved.error)throw Error('Não foi possível registrar a revalidação.');
    return json({ok:true,verificado_em});
  }catch(e){return json({error:e instanceof Error?e.message:'Não foi possível consultar o iRancho.'},502);}
});
