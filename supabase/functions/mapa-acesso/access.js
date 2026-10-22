import {calcularMapa} from './engine.js';
export const OWNER='emerson.oliveira@fazendabodoquena.com.br';
export const MODULES=['dashboard','mapaInicial','mapaAtual','movimentacoes','nascimentos','mortalidade','reidentificacao','fichaAnimal','inventario','relatorios','configuracoes'];
export function dono(user,profile){return profile?.ativo===true && profile?.role==='admin' && [OWNER,'emersontec13@gmail.com'].includes(user?.email?.toLowerCase());}
export function pode(user,profile,module,action='ver'){
 if(module==='configuracoes'&&!dono(user,profile))return false;
 return profile?.ativo===true && MODULES.includes(module) && (dono(user,profile)|| (action!=='excluir'&&Array.isArray(profile.permissions?.[module])&&profile.permissions[module].includes('ver')&&profile.permissions[module].includes(action)));
}
export function projetar(payload,user,profile,ref){
 if(dono(user,profile))return {payload,full:true};
 const view=m=>pode(user,profile,m);
 const fullHistory=['dashboard','movimentacoes','fichaAnimal','relatorios'].some(view);
 const initial=view('mapaInicial')||view('relatorios')||view('dashboard');
 const current=['nascimentos','mortalidade','mapaAtual','inventario','fichaAnimal','dashboard','relatorios','reidentificacao'].some(view);
 const tipos=[];if(view('nascimentos'))tipos.push('Nascimento');if(view('mortalidade'))tipos.push('Morte');if(view('reidentificacao'))tipos.push('Reidentificação');
 const mov=fullHistory?(payload.movimentacoes||[]):(payload.movimentacoes||[]).filter(m=>tipos.includes(m.tipo));
 const calc=current?calcularMapa(payload,ref):null;
 const campos=['id','sisbov','brinco','chip','sexo','raca','nascimento','setorInicial','localInicial','localAtual','loteAtual','origem','status','setorAtual','categoria','idadeMeses','sintetico'];
 const clean=a=>Object.fromEntries(campos.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
 const ids=new Set(mov.map(m=>m.animalId));
 const animais=(payload.animais||[]).filter(a=>fullHistory|| (initial&&['inicial','cadastro'].includes(a.origem)) || ids.has(a.id)).map(clean);
 if(calc){
   const masters=new Map((payload.animais||[]).map(a=>[a.id,a]));
   calc.animais=calc.animais.map(a=>({...clean(a),loteAtual:masters.get(a.id)?.loteAtual||'',historico:view('fichaAnimal')?a.historico:[]}));
   calc.inconsistencias=view('movimentacoes')?calc.inconsistencias:[];
   const existentes=new Set(animais.map(a=>a.id));
   for(const a of calc.animais)if(!existentes.has(a.id)){animais.push(clean(a));existentes.add(a.id);}
 }
 const config={dataMapaInicial:payload.config?.dataMapaInicial};
 // Preferências visuais são públicas aos usuários da aplicação; logs e backups não são.
 for(const k of ['visual','visualConfig','logo'])if(payload.config?.[k]!==undefined)config[k]=payload.config[k];
 const q=m=>Number(m.quantidade)||1;
 const movRef=(payload.movimentacoes||[]).filter(m=>m.data<=ref);
 const conciliacao=current?{inicial:(payload.animais||[]).filter(a=>['inicial','cadastro'].includes(a.origem)).length,entradas:movRef.filter(m=>['Nascimento','Compra','Animais sem auditar'].includes(m.eventoAuditoria?'Animais sem auditar':m.tipo)).reduce((n,m)=>n+q(m),0),saidas:movRef.filter(m=>['Morte','Venda Frigorífico','Venda Terceiro'].includes(m.tipo)).reduce((n,m)=>n+q(m),0),atual:calc.animais.filter(a=>a.status==='ATIVO').length}:null;
 return {full:false,fullHistory,conciliacao,payload:{animais,movimentacoes:mov,setores:payload.setores||[],config},mapaCalculado:calc,ref};
}
