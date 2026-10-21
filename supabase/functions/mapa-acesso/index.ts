import {dono,pode,MODULES,projetar} from './access.js';
const cors={'Access-Control-Allow-Origin':'https://mapa-de-rebanho.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
async function db(path,init={}){
 const r=await fetch(url+'/rest/v1/'+path,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers}});
 if(!r.ok)throw Error('Falha no serviço de dados.');const txt=await r.text();return txt?JSON.parse(txt):null;
}
Deno.serve(async req=>{
 const reply=(data,status=200)=>Response.json(data,{status,headers:cors});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Método não permitido.'},405);
 try{
  const token=req.headers.get('Authorization');if(!token)return reply({error:'Sessão inválida.'},401);
  const ar=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:token}});
  if(!ar.ok){
   if(ar.status===401||ar.status===403)return reply({error:'Sessão expirada.'},401);
   return reply({error:'Serviço de autenticação temporariamente indisponível. Tente novamente.'},503);
  }
  const user=await ar.json();
  if(!user?.id)return reply({error:'Sessão inválida.'},401);
  const profile=(await db('profiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,nome,email,role,ativo,permissions'))?.[0];
  if(!profile||profile.ativo!==true)return reply({error:'Usuário bloqueado ou sem perfil.'},403);
  const body=await req.json(),action=body.action||'read';
  if(action==='session')return reply({profile,owner:dono(user,profile)});
  if(action==='export'){
   const module=body.module;
   if(!pode(user,profile,module,'exportar')||(module==='configuracoes'&&!dono(user,profile)))return reply({error:'Exportação não autorizada.'},403);
   await db('mapa_access_audit',{method:'POST',body:JSON.stringify({actor_id:user.id,actor_email:user.email,action:'EXPORTAR',module,details:{formato:String(body.format||'').slice(0,20)}})});
   return reply({ok:true});
  }
  if(action==='audit'){
   if(!dono(user,profile))return reply({error:'Acesso exclusivo do proprietário.'},403);
   return reply({logs:await db('mapa_access_audit?select=*&order=created_at.desc&limit=500')});
  }
  if(action!=='read')return reply({error:'Ação inválida.'},400);
  if(!MODULES.some(m=>pode(user,profile,m)))return reply({error:'Nenhum módulo autorizado.'},403);
  const ref=body.ref||new Date().toLocaleDateString('en-CA',{timeZone:'America/Campo_Grande'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(ref)||!Number.isFinite(Date.parse(ref+'T00:00:00Z')))return reply({error:'Data inválida.'},400);
  const row=(await db('mapa_rebanho_estado?id=eq.principal&select=payload,updated_at,revision'))?.[0];
  if(!row)return reply({error:'Base central indisponível.'},503);
  return reply({...projetar(row.payload,user,profile,ref),updated_at:row.updated_at,revision:row.revision,profile,owner:dono(user,profile)});
 }catch(e){console.error('mapa-acesso',e);return reply({error:'Não foi possível validar o acesso. Tente novamente.'},503);}
});
