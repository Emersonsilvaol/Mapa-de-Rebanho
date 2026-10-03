import { snapshot, attachments, emailHTML, localDate } from './report.js';

const base = Deno.env.get('SUPABASE_URL')!;
const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers = {apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});
async function rest(path: string, method='GET', body?: unknown) {
  const result = await fetch(`${base}/rest/v1/${path}`, {method,headers:{...headers,Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  if (!result.ok) throw new Error(`database_${result.status}`);
  return result.status===204?null:await result.json();
}
function base64(bytes: Uint8Array) {let result='';for(let i=0;i<bytes.length;i+=16384) result+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(result);}
async function hash(value:string) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');}
function equal(a:string,b:string) {if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}

// Gateway JWT checking is disabled only because this handler verifies its own
// random 256-bit bearer token, held in Vault; its hash is service-role-only.
Deno.serve(async req => {
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  const token=req.headers.get('Authorization')?.match(/^Bearer (.{32,})$/)?.[1];
  if(!token) return json({error:'unauthorized'},401);
  try {
    const [config]=await rest('mapa_email_config?id=eq.1&select=*');
    if(!config || !equal(await hash(token),config.token_hash)) return json({error:'unauthorized'},401);
    const input=await req.json();
    if(!['preview','scheduled','send','cancel_scheduled'].includes(input.mode)) return json({error:'invalid_mode'},400);
    const key=Deno.env.get('RESEND_API_KEY') || await rest('rpc/mapa_email_resend_key','POST',{});
    if(input.mode==='cancel_scheduled') {
      if(!key) return json({error:'missing_resend_key'},503);
      if(!Array.isArray(input.ids) || input.ids.length>10 || input.ids.some(id=>!/^[-a-f0-9]{36}$/.test(id))) return json({error:'invalid_ids'},400);
      const results=[];
      for(const id of input.ids) {
        const response=await fetch(`https://api.resend.com/emails/${id}/cancel`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
        const result=await response.json();
        results.push({id,ok:response.ok,status:response.status,message:result.message||null});
      }
      return json({results});
    }
    const date=localDate();
    if(input.mode!=='preview' && (!config.enabled || (input.mode==='scheduled' && config.test_until && date>config.test_until))) return json({status:'paused',date});
    if(input.mode!=='preview' && !key) return json({error:'missing_RESEND_API_KEY'},503);
    const [row]=await rest('mapa_rebanho_estado?id=eq.principal&select=payload,updated_at,revision');
    if(!row) return json({error:'missing_source'},503);
    const data=snapshot(row,date);
    if(data.unknown || data.inconsistencies.length) return json({error:'map_inconsistencies',unknown:data.unknown,count:data.inconsistencies.length},409);
    const files=await attachments(data);
    const recipients=await rest('mapa_email_recipients?enabled=eq.true&select=email');
    const metadata={date,revision:row.revision,updated_at:row.updated_at,total:data.finalCount,files:files.map(f=>({filename:f.filename,bytes:f.bytes.length})),recipients:recipients.map(r=>r.email),resend_key_present:!!key,enabled:config.enabled,sender:config.sender,domain_verified:config.domain_verified};
    if(input.mode==='preview') return json({status:'preview',...metadata});
    if(!config.signature_base64) return json({error:'missing_signature'},503);
    const encoded=files.map(f=>({filename:f.filename,content:base64(f.bytes)}));
    encoded.push({filename:'assinatura-emerson.jpeg',content:config.signature_base64,content_id:'assinatura-emerson-branca'});
    const results=[];
    for(const recipient of recipients) {
      if(!config.domain_verified && recipient.email.toLowerCase()!==config.owner_email.toLowerCase()) {results.push({email:recipient.email,status:'domain_required'});continue;}
      // An atomic UNIQUE(date,email) reservation blocks simultaneous duplicates.
      // Ambiguous network failures remain reserved and must be reviewed before retry.
      let record;
      try { [record]=await rest('mapa_email_deliveries','POST',{report_date:date,email:recipient.email,revision:row.revision,source_updated_at:row.updated_at,status:'sending'}); }
      catch(e) {if(e.message==='database_409') {results.push({email:recipient.email,status:'already_reserved'});continue;}throw e;}
      let status='uncertain', error=null,providerId=null;
      try {
        const payload={from:config.sender,to:[recipient.email],reply_to:config.reply_to,subject:`Mapa de Rebanho — Bodoquena — ${date.split('-').reverse().join('/')}`,html:emailHTML(data),text:`Bom dia, pessoal. Seguem o mapa de rebanho atualizado e o detalhamento em Excel. Saldo atual: ${data.finalCount} animais. Base atualizada em ${row.updated_at}. Atenciosamente, ${config.signature_text || "Responsável pelo controle do rebanho"}.`,attachments:encoded};
        const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`mapa-${date}-${await hash(recipient.email)}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
        const sent=await response.json();
        if(response.ok && sent.id) {status='sent';providerId=sent.id;}
        else {status='failed';error=`resend_${response.status}: ${String(sent.message||'rejected').slice(0,300)}`;}
      } catch {error='network_or_provider_response_requires_review';}
      await rest(`mapa_email_deliveries?id=eq.${record.id}`,'PATCH',{status,error,provider_id:providerId,completed_at:new Date().toISOString()});
      results.push({email:recipient.email,status,error,id:providerId});
    }
    return json({status:results.every(r=>['sent','already_reserved'].includes(r.status))?'complete':'incomplete',...metadata,results});
  } catch {return json({error:'execution_failed'},500);}
});
