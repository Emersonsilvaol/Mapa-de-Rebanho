const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
function between(start,end){return html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));}
const confirmacao=between('function confirmarImportMov(res){','/* ============================== MOTOR DE RECONSTRUÇÃO');
const engine=between('function calcularMapaOtimizado(DB, refISO) {','function calcularEstadoAte(');
function ambiente(){
 const messages=[],button={isConnected:true},calls={save:0,sync:0,backup:0};
 const ctx={DB:{animais:[],movimentacoes:[],setores:[],config:{}},DB_GENERATION:4,LOCAL_DIRTY:false,SYNC_ERRO:'Tempo de salvamento excedido',PENDING_REASON:'',
  separarMovimentacoesNovas:lista=>({novas:lista.filter(m=>!ctx.DB.movimentacoes.some(x=>x.id===m.id)),duplicadas:[]}),
  analisarLoteMov:()=>({erros:[],avisos:[]}),prepararLoteMov:lista=>({...ctx.DB,movimentacoes:ctx.DB.movimentacoes.concat(lista)}),
  alertaAlteracaoGrande:()=>'',comparacaoAntesConfirmar:()=>'',previaImportacaoMov:()=>'',formatBR:x=>x,
  confirmarAlteracaoGrande:()=>true,confirmarBackupImportacao:async()=>{calls.backup++;return true;},
  saveDB:async()=>{calls.save++;ctx.DB_GENERATION+=2;ctx.LOCAL_DIRTY=true;return true;},
  sincronizarSupabase:async()=>{calls.sync++;if(calls.sync===1)return false;ctx.LOCAL_DIRTY=false;return true;},
  toast:msg=>messages.push(msg),renderAll(){},closeModal(){ctx.closed=true;},openModal(title,body,buttons){ctx.buttons=buttons;},
  document:{querySelector:()=>button}
 };
 vm.createContext(ctx);vm.runInContext(confirmacao,ctx);
 return {ctx,calls,messages,button};
}
const lote=()=>({validos:Array.from({length:223},(_,i)=>({id:'mov'+i,tipo:'Nascimento',data:'2026-11-26',sisbov:'076'+String(i).padStart(12,'0')})),erros:[]});
test('falha de nuvem e nova tentativa preservam 223 movimentos sem invalidar a própria prévia',async()=>{
 const {ctx,calls,messages,button}=ambiente();ctx.confirmarImportMov(lote());
 const confirmar=ctx.buttons[1].onClick;
 await confirmar();assert.equal(ctx.DB.movimentacoes.length,223);assert.equal(ctx.closed,undefined);
 assert.equal(button.textContent,'Tentar salvar novamente');
 await confirmar();assert.equal(ctx.DB.movimentacoes.length,223);assert.equal(calls.save,1);assert.equal(calls.sync,2);assert.equal(calls.backup,1);assert.equal(ctx.closed,true);
 assert.ok(!messages.some(m=>m.includes('A base mudou')));
});
test('clique duplo durante salvamento não aplica nem salva o lote duas vezes',async()=>{
 const {ctx,calls}=ambiente();let release;ctx.sincronizarSupabase=()=>new Promise(r=>release=r);
 ctx.confirmarImportMov(lote());const confirmar=ctx.buttons[1].onClick;
 const first=confirmar();await new Promise(r=>setImmediate(r));await confirmar();
 assert.equal(ctx.DB.movimentacoes.length,223);assert.equal(calls.save,1);release(true);await first;
});
test('mudança externa depois de uma falha impede salvar uma prévia desatualizada',async()=>{
 const {ctx,calls,messages}=ambiente();ctx.confirmarImportMov(lote());const confirmar=ctx.buttons[1].onClick;
 await confirmar();ctx.DB_GENERATION++;await confirmar();assert.equal(calls.sync,1);assert.match(messages.at(-1),/novas alterações/);
});
test('prévia do operador calcula 223 nascimentos mesmo quando o mapa do servidor é uma fotografia',()=>{
 const ctx={AUTH_ADMIN:false,MAPA_SERVIDOR:{animais:[{id:'foto',status:'ATIVO'}]},todayISO:()=> '2026-11-26'};
 vm.createContext(ctx);
 // The calculation and preview are the actual production functions.
 vm.runInContext(engine+between('function mapaParaPrevia(base){','function comparacaoAntesConfirmar(')+between('function saldoPrevia(base){','function previaImportacaoMov('),ctx);
 const base={config:{dataMapaInicial:'2026-10-01'},setores:['Bela Vista'],animais:[{id:'inicial',origem:'inicial',sisbov:'105000000000001',setorInicial:'Bela Vista',nascimento:'2020-01-01',sexo:'Fêmea'}],movimentacoes:[]};
 const candidate=structuredClone(base);
 for(let i=0;i<223;i++){
  const a={id:'a'+i,origem:'nascimento',sisbov:'076'+String(i).padStart(12,'0'),setorInicial:'Bela Vista',sexo:'Fêmea',nascimento:'2026-11-26'};
  candidate.animais.push(a);candidate.movimentacoes.push({id:'m'+i,animalId:a.id,sisbov:a.sisbov,tipo:'Nascimento',data:'2026-11-26',quantidade:1,setorDestino:'Bela Vista',sexo:a.sexo,nascimento:a.nascimento});
 }
 assert.equal(ctx.saldoPrevia(base),1);assert.equal(ctx.saldoPrevia(candidate),224);assert.equal(base.animais.length,1);
});
