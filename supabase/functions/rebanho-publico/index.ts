// Public read-only site. The only writable source is this fixed GitHub URL.
const SOURCE = 'https://raw.githubusercontent.com/Emersonsilvaol/Mapa-de-Rebanho/main/dados/rebanho.json';
const TTL = 60000;
const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, OPTIONS'};
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(url+'/rest/v1/'+path, {...init, headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw new Error('Database request failed: '+r.status);
  const txt=await r.text();return txt?JSON.parse(txt):null;
}
function validate(d: any) {
  if(!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.dataInicial) || !/^\d{4}-\d{2}-\d{2}$/.test(d.dataFinal)) throw new Error('Invalid reference dates');
  if(!Array.isArray(d.setores)||!d.setores.length||d.setores.some((s:any)=>typeof s!=='string')||new Set(d.setores).size!==d.setores.length) throw new Error('Invalid sectors');
  for(const k of ['inicial','final','mov']) {
    if(!Array.isArray(d[k])||d[k].length>200000||d[k].length!==d.totais?.[k]) throw new Error('Invalid totals');
    for(const a of d[k]) if(!Array.isArray(a)||a.length!==6||a.some((v:any)=>typeof v!=='string')) throw new Error('Invalid record');
  }
  for(const k of ['inicial','final']) {
    if(new Set(d[k].map((a:string[])=>a[0])).size!==d[k].length) throw new Error('Duplicate SISBOV');
    if(d[k].some((a:string[])=>!d.setores.includes(a[4])||!['Fêmea','Macho'].includes(a[2]))) throw new Error('Invalid animal sector or sex');
  }
  if(!d.biomas || d.setores.some((s:string)=>!['Cerrado','Pantanal'].includes(d.biomas[s]))) throw new Error('Invalid biome');
}
function reply(body: unknown,status=200) {return Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store'}});}
Deno.serve(async(req: Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{headers:cors});
  if(req.method!=='GET')return reply({error:'Method not allowed'},405);
  let cached:any=null;
  try {
    cached=(await db('rebanho_publicacao?id=eq.1&select=*'))?.[0];
    if(!cached || Date.now()-new Date(cached.conferido_em).getTime()>TTL) {
      const r=await fetch(SOURCE,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error('GitHub data unavailable: '+r.status);
      const raw=await r.text();if(raw.length>25000000)throw new Error('Source exceeds limit');
      const d=JSON.parse(raw);validate(d);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))).map(b=>b.toString(16).padStart(2,'0')).join('');
      await db('rpc/rebanho_sincronizar',{method:'POST',body:JSON.stringify({p_data:d,p_hash:hash})});
      cached=(await db('rebanho_publicacao?id=eq.1&select=*'))[0];
    }
    const meta={hash:cached.hash,atualizadoEm:cached.atualizado_em,conferidoEm:cached.conferido_em,desatualizado:false};
    return reply({data: new URL(req.url).searchParams.get('hash')===cached.hash ? null : cached.payload,meta});
  } catch(e) {
    console.error('Rebanho sync:',e instanceof Error?e.message:'Unknown error');
    if(cached)return reply({data:cached.payload,meta:{hash:cached.hash,atualizadoEm:cached.atualizado_em,conferidoEm:cached.conferido_em,desatualizado:true}});
    return reply({error:'Não foi possível carregar os dados. Tente novamente em instantes.'},503);
  }
});
