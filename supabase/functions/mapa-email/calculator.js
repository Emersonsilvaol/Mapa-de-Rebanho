// Copiado do calculador do sistema Mapa de Rebanho.
export function calcularMapaOtimizado(DB, refISO) {
const CASCATA=['36+','25–36','13–24','00–12'];
function uid(prefix){return (prefix||'id')+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);}
function tipoOperacionalMov(m){return m && m.tipo==='Compra' && m.eventoAuditoria===true?'Animais sem auditar':(m?.tipo||'');}
function normalizarCabecalho(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function calcIdadeMeses(nascISO, refISO){
  if(!nascISO || !refISO) return null;
  const n = new Date(nascISO+'T00:00:00');
  const r = new Date(refISO+'T00:00:00');
  if(isNaN(n)||isNaN(r)) return null;
  let meses = (r.getFullYear()-n.getFullYear())*12 + (r.getMonth()-n.getMonth());
  if(r.getDate() < n.getDate()) meses--;
  return Math.max(0,meses);
}
function calcCategoria(nascISO, refISO){
  const m = calcIdadeMeses(nascISO, refISO);
  if(m===null) return '—';
  if(m<=12) return '00–12';
  if(m<=24) return '13–24';
  if(m<=36) return '25–36';
  return '36+';
}
function normalizarSisbov(v){
  // Mantém zeros à esquerda e remove espaços/caracteres invisíveis.
  return String(v??'').replace(/[\u0000-\u001F\u007F\u00A0]/g,'').replace(/\s+/g,'').trim();
}
// Build identifier indexes once. Keep the original insertion order when identifiers overlap.
function criarIndice(items){
 const fields=['sisbov','brinco','chip'],maps=Object.fromEntries(fields.map(k=>[k,new Map()])),rank=new Map(),keys=new Map();
 const value=(a,k)=>k==='sisbov'?normalizarSisbov(a[k]):String(a[k]||'').trim();
 function remove(a){const old=keys.get(a);if(old)for(const k of fields){const set=maps[k].get(old[k]);if(set){set.delete(a);if(!set.size)maps[k].delete(old[k]);}}keys.delete(a);}
 function add(a,position){if(!rank.has(a))rank.set(a,position??rank.size);const old=keys.get(a);if(old)for(const k of fields){const set=maps[k].get(old[k]);if(set){set.delete(a);if(!set.size)maps[k].delete(old[k]);}}const next={};for(const k of fields){const v=value(a,k);next[k]=v;if(v){if(!maps[k].has(v))maps[k].set(v,new Set());maps[k].get(v).add(a);}}keys.set(a,next);}
 function candidates(m,only){const found=new Set();for(const k of only||fields){const v=value(m,k);if(v)for(const a of maps[k].get(v)||[])found.add(a);}return [...found].sort((a,b)=>rank.get(a)-rank.get(b));}
 items.forEach(add);return {add,remove,position:a=>rank.get(a),candidates,first:m=>candidates(m)[0]||null};
}
const masterIndex=criarIndice(DB.animais),masterIds=new Map();for(const a of DB.animais)if(!masterIds.has(a.id))masterIds.set(a.id,a);
function buscarAnimalPorSisbov(sisbov){
 const candidatos=masterIndex.candidates({sisbov},['sisbov']);
 return candidatos.sort((a,b)=>{const origem=(b.origem==='inicial'?1:0)-(a.origem==='inicial'?1:0);if(origem)return origem;const campos=['brinco','chip','sexo','raca','nascimento','setorInicial'];return campos.filter(k=>b[k]).length-campos.filter(k=>a[k]).length;})[0]||null;
}
function buildMapaNaData(refISO){
  const state = new Map(); // id -> animal state
  let stateIndex=null;
  const putState=(id,a)=>{const old=state.get(id),position=old&&stateIndex?.position(old);if(old&&stateIndex)stateIndex.remove(old);state.set(id,a);if(stateIndex)stateIndex.add(a,position);};
  const inconsistencias = [];

  DB.animais.filter(a=>a.origem==='inicial' || a.origem==='cadastro').forEach(a=>{
    putState(a.id, {
      id:a.id, sisbov:a.sisbov, brinco:a.brinco, chip:a.chip, sexo:a.sexo, raca:a.raca,
      nascimento:a.nascimento, setorAtual:a.setorInicial, localAtual:a.localInicial||'', status:'ATIVO', sintetico:false,
      historico:[{data:DB.config.dataMapaInicial, tipo:'Mapa Inicial', setor:a.setorInicial}]
    });
  });

  const ordemMovimentacao = m => ({'Nascimento':10,'Compra':10,'Animais sem auditar':10,'Transferência entre Seções':20,'Reidentificação':25,'Morte':30,'Venda Frigorífico':30,'Venda Terceiro':30}[tipoOperacionalMov(m)]||50);
  const movs = DB.movimentacoes.filter(m=>m.data<=refISO).slice().sort((a,b)=>
    a.data<b.data?-1:(a.data>b.data?1:ordemMovimentacao(a)-ordemMovimentacao(b))
  );
  stateIndex=criarIndice([...state.values()]);
  const purchaseDays=new Map(),transferDays=new Map();
  for(const m of movs){const group=m.tipo==='Compra'?purchaseDays:m.tipo==='Transferência entre Seções'?transferDays:null;if(group){if(!group.has(m.data))group.set(m.data,[]);group.get(m.data).push(m);}}
  for(const [day,list]of purchaseDays)purchaseDays.set(day,criarIndice(list));
  for(const [day,list]of transferDays)transferDays.set(day,criarIndice(list));
  function compraComTransferenciaCorrespondente(m){
   const compra=m.tipo==='Compra'?m:purchaseDays.get(m.data)?.first(m);
   return !!compra&&!!transferDays.get(compra.data)?.candidates(compra).some(t=>t!==compra);
  }

  function acharAnimalMovimentacao(m){
    if(m.animalId && state.has(m.animalId)) return state.get(m.animalId);
    const sisbov=normalizarSisbov(m.sisbov), brinco=String(m.brinco||'').trim(), chip=String(m.chip||'').trim();
    const indexed=stateIndex.first(m);if(indexed)return indexed;
    // Recuperação de segurança: entradas de auditoria podem estar cadastradas
    // em DB.animais com origem "compra", embora ainda não tenham sido criadas
    // no estado por uma importação/ordem histórica inconsistente.
    const cadastrado=(m.animalId&&masterIds.get(m.animalId))||masterIndex.first(m);
    if(cadastrado){
      const recuperado={id:cadastrado.id, sisbov:cadastrado.sisbov, brinco:cadastrado.brinco,
        chip:cadastrado.chip, sexo:cadastrado.sexo, raca:cadastrado.raca,
        nascimento:cadastrado.nascimento, setorAtual:m.setorOrigem||cadastrado.setorInicial, localAtual:m.local||'',
        status:'ATIVO', sintetico:false, historico:[{data:m.data, tipo:'Cadastro recuperado', setor:m.setorOrigem||cadastrado.setorInicial}]};
      putState(recuperado.id, recuperado);
      return recuperado;
    }
    return null;
  }
  function criarAnimal(m, index){
    const master=buscarAnimalPorSisbov(m.sisbov)||masterIndex.candidates(m,['brinco','chip'])[0]||null;
    const idBase = master ? master.id : uid('agg');
    const novo = {
      id: m.quantidade>1 ? `${idBase}_${index}` : idBase,
      sisbov: m.quantidade>1 ? '' : m.sisbov,
      brinco: m.quantidade>1 ? '' : m.brinco,
      chip: master? master.chip : '',
      sexo: m.sexo, raca: m.raca, nascimento: m.nascimento,
      setorAtual: m.setorDestino || m.setorOrigem, localAtual:m.local||'', status:'ATIVO', sintetico: m.quantidade>1,
      historico:[{data:m.data, tipo:m.tipo, setor:m.setorDestino||m.setorOrigem}]
    };
    putState(novo.id, novo);
    return novo;
  }

  function selecionarParaSaida(m){
    const setor = m.setorOrigem;
    const sexoInformado = m.sexo && m.sexo!=='—';
    const racaInformada = m.raca && m.raca!=='—';
    const pool = Array.from(state.values()).filter(v=>
      v.status==='ATIVO' && (!setor || v.setorAtual===setor) &&
      (!sexoInformado || v.sexo===m.sexo) &&
      (!racaInformada || v.raca===m.raca)
    );
    const catAlvo = calcCategoria(m.nascimento, m.data);
    // Quando a categoria não foi informada, a saída agregada deve consumir
    // o estoque disponível do setor, sem exigir sexo/raça/categoria fictícios.
    let selecionados = catAlvo==='—'
      ? pool.slice(0, m.quantidade)
      : pool.filter(v=> calcCategoria(v.nascimento, m.data)===catAlvo).slice(0, m.quantidade);
    let faltam = m.quantidade - selecionados.length;
    // 2) cascata entre categorias adjacentes
    if(faltam>0){
      const usados = new Set(selecionados.map(v=>v.id));
      const ordem = CASCATA.slice(CASCATA.indexOf(catAlvo)>=0?0:0); // cascata completa
      for(const cat of ordem){
        if(faltam<=0) break;
        const extra = pool.filter(v=> !usados.has(v.id) && calcCategoria(v.nascimento, m.data)===cat).slice(0, faltam);
        extra.forEach(v=>usados.add(v.id));
        selecionados = selecionados.concat(extra);
        faltam -= extra.length;
      }
    }
    if(faltam>0){
      inconsistencias.push({
        data:m.data, tipo:m.tipo, setor, sexo:m.sexo, categoria:catAlvo, faltante:faltam,
        msg:`Saída superior ao estoque disponível: faltaram ${faltam} cabeça(s) em ${setor} / ${m.sexo} / ${catAlvo}.`
      });
    }
    return selecionados;
  }

  function aplicarSaidaIndividual(m, novoStatus){
    const alvo = acharAnimalMovimentacao(m);
    if(alvo){
      if(alvo.status==='MORTO' || alvo.status==='VENDIDO'){
        inconsistencias.push({data:m.data,tipo:m.tipo,sisbov:m.sisbov||alvo.sisbov||'—',setor:alvo.setorAtual||'—',sexo:alvo.sexo,categoria:'—',faltante:0,
          msg:`Baixa duplicada ignorada no cálculo: animal já estava ${alvo.status}. A movimentação permanece no histórico para auditoria.`});
        return {deduzido:false,exato:true,bloqueado:true};
      }
      alvo.status=novoStatus;
      alvo.historico.push({data:m.data, tipo:m.tipo, setor:alvo.setorAtual});
      return {deduzido:true, exato:true};
    }
    // Saída identificada sem entrada correspondente fica pendente para
    // auditoria. Nunca baixa outro SISBOV por aproximação.
    inconsistencias.push({data:m.data, tipo:m.tipo, sisbov:m.sisbov, setor:m.setorOrigem||'—', sexo:m.sexo,
      categoria:'—', faltante:1,
      msg:`${m.tipo} pendente: SISBOV ${m.sisbov||'não informado'} não localizado. Cadastre primeiro como Animais sem auditar e depois reprocese o mapa.`});
    return {deduzido:false, exato:false};
  }

  movs.forEach(m0=>{
    const m = {...m0, tipo:tipoOperacionalMov(m0)};
    if(compraComTransferenciaCorrespondente(m0)) return;
    if(m.tipo==='Nascimento' || m.tipo==='Compra' || m.tipo==='Animais sem auditar'){
      if((m.sisbov || m.brinco || m.chip || m.animalId) && m.quantidade<=1){
        let alvo = acharAnimalMovimentacao(m);
        if(!alvo) alvo = criarAnimal(m,0);
        // "Animais sem auditar" é uma entrada real: aumenta o saldo e cria
        // o vínculo histórico do SISBOV para a saída posterior.
        alvo.status='ATIVO';
        alvo.setorAtual = m.setorDestino||m.setorOrigem; if(m.local) alvo.localAtual=m.local;
        alvo.historico.push({data:m.data, tipo:m.tipo, setor:alvo.setorAtual});
      } else {
        for(let i=0;i<m.quantidade;i++) criarAnimal(m,i);
      }
      return;
    }
    if(m.tipo==='Morte' || m.tipo==='Venda Frigorífico' || m.tipo==='Venda Terceiro'){
      const novoStatus = m.tipo==='Morte' ? 'MORTO' : 'VENDIDO';
      if((m.sisbov || m.brinco || m.chip || m.animalId) && m.quantidade<=1){
        aplicarSaidaIndividual(m, novoStatus);
      } else {
        const sel = selecionarParaSaida(m);
        sel.forEach(v=>{ v.status=novoStatus; v.historico.push({data:m.data, tipo:m.tipo, setor:v.setorAtual}); });
      }
      return;
    }
    if(m.tipo==='Reidentificação'){
      const alvo = (m.animalId && state.get(m.animalId)) || acharAnimalMovimentacao({...m,brinco:m.brincoAnterior||m.brinco});
      if(!alvo){ inconsistencias.push({data:m.data,tipo:m.tipo,sisbov:m.sisbov||'—',setor:m.setorOrigem||'—',sexo:m.sexo,categoria:'—',faltante:0,msg:`Reidentificação pendente: brinco anterior ${m.brincoAnterior||m.brinco||'não informado'} não localizado.`}); return; }
      const sisbovNovo=String(m.sisbovNovo||'').trim();
      const brincoNovo=String(m.brincoNovo||(sisbovNovo.length===15?sisbovNovo.slice(8,14):'')).trim();
      const conflito=Array.from(state.values()).some(v=>v.id!==alvo.id && ((sisbovNovo && String(v.sisbov||'').trim()===sisbovNovo) || (brincoNovo && String(v.brinco||'').trim()===brincoNovo)));
      if(!sisbovNovo || sisbovNovo.length!==15 || conflito){ inconsistencias.push({data:m.data,tipo:m.tipo,sisbov:sisbovNovo||alvo.sisbov||'—',setor:alvo.setorAtual,sexo:alvo.sexo,categoria:'—',faltante:0,msg:`Reidentificação bloqueada: novo SISBOV ${sisbovNovo||'não informado'} é inválido ou já pertence a outro animal.`}); return; }
      const sisbovAnterior=alvo.sisbov;
      const brincoAnterior=alvo.brinco;
      alvo.sisbov=sisbovNovo;
      alvo.brinco=brincoNovo;
      stateIndex.add(alvo);
      alvo.historico.push({data:m.data,tipo:'Reidentificação',setor:alvo.setorAtual,sisbovAnterior,sisbovNovo,brincoAnterior,brincoNovo,sisbov:sisbovNovo});
      return;
    }
    if(m.tipo==='Movimentação entre Locais'){
      const alvo=acharAnimalMovimentacao(m);
      if(!alvo){
        inconsistencias.push({data:m.data,tipo:m.tipo,sisbov:m.sisbov||'—',setor:m.setorOrigem||'—',sexo:m.sexo,categoria:'—',faltante:0,msg:`Movimentação de local ignorada: SISBOV ${m.sisbov||'não informado'} não localizado.`});
        return;
      }
      if(alvo.status!=='ATIVO'){
        inconsistencias.push({data:m.data,tipo:m.tipo,sisbov:m.sisbov||alvo.sisbov||'—',setor:alvo.setorAtual||'—',sexo:alvo.sexo,categoria:'—',faltante:0,msg:`Movimentação de local bloqueada: animal está ${alvo.status}.`});
        return;
      }
      const anterior=alvo.localAtual||'';
      if(m.local && normalizarCabecalho(anterior)!==normalizarCabecalho(m.local)){
        alvo.localAtual=m.local;
        alvo.historico.push({data:m.data,tipo:m.tipo,setor:alvo.setorAtual,localOrigem:anterior,local:m.local});
      }
      return;
    }
    if(m.tipo==='Transferência entre Seções'){
      if(m.setorOrigem===m.setorDestino){
        inconsistencias.push({data:m.data, tipo:m.tipo, setor:m.setorOrigem, sexo:m.sexo, categoria:'—', faltante:0, msg:`Transferência com setor de destino igual ao de origem (${m.setorOrigem}).`});
      }
      if((m.sisbov || m.brinco || m.chip || m.animalId) && m.quantidade<=1){
        const alvo = acharAnimalMovimentacao(m);
        if(alvo){ alvo.setorAtual = m.setorDestino; if(m.local) alvo.localAtual=m.local; alvo.historico.push({data:m.data, tipo:m.tipo, setor:m.setorDestino, local:m.local||alvo.localAtual}); }
        else inconsistencias.push({data:m.data, tipo:m.tipo, sisbov:m.sisbov, setor:m.setorOrigem||'—', sexo:m.sexo, categoria:'—', faltante:1, msg:`Transferência de SISBOV inexistente no mapa: ${m.sisbov}.`});
      } else {
        const sel = selecionarParaSaida(m);
        sel.forEach(v=>{ v.setorAtual = m.setorDestino; if(m.local) v.localAtual=m.local; v.historico.push({data:m.data, tipo:m.tipo, setor:m.setorDestino, local:m.local||v.localAtual}); });
      }
      return;
    }
  });

  // recalcula categoria de todos os ativos na data de referência
  const animais = Array.from(state.values()).map(v=>({
    ...v, categoria: v.status==='ATIVO' ? calcCategoria(v.nascimento, refISO) : calcCategoria(v.nascimento, refISO),
    idadeMeses: calcIdadeMeses(v.nascimento, refISO)
  }));

  return {animais, inconsistencias};
}


return buildMapaNaData(refISO);
}

