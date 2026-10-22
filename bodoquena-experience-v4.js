/* Bodoquena Experience V4: authorized navigation and native-data UI only. */
(()=>{'use strict';if(window.BodoquenaExperienceV4)return;
const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const map=!!$('#mainTabs'),nav=$('#mainTabs')||$('.sidebar .nav');if(!nav)return;
const key='bq.v4.'+(map?'mapa':'gestao')+'.';
const load=k=>{try{return JSON.parse(localStorage.getItem(key+k)||'null')}catch{return null}};
const save=(k,v)=>{try{localStorage.setItem(key+k,JSON.stringify(v))}catch{}};
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const ready=()=>{const gate=$('#authGate');if(gate&&!gate.hidden)return false;const a=$('#app');if(a&&(a.hidden||getComputedStyle(a).display==='none'))return false;const login=$('#login');return !(login&&!login.hidden&&getComputedStyle(login).display!=='none')};
const navButton=id=>$$('button[data-page],button[data-view]',nav).find(x=>(x.dataset.page||x.dataset.view)===id && !x.disabled && !x.hidden && x.getAttribute('aria-hidden')!=='true' && getComputedStyle(x).display!=='none');
const open=id=>{const btn=navButton(id);if(!ready()||!btn)return false;const grp=btn.closest('.bq-nav-items');if(grp?.hidden){grp.hidden=false;grp.previousElementSibling?.querySelector('[aria-expanded]')?.setAttribute('aria-expanded','true')}btn.click();return true};
const mk=(tag,cl,txt)=>{const el=document.createElement(tag);if(cl)el.className=cl;if(txt!==undefined)el.textContent=String(txt);return el};
const targets=map?{executive:[['dashboard','Dashboard'],['mapaAtual','Mapa atual'],['conferencia','Conferência']],operational:[['fichaAnimal','Ficha do animal'],['movimentacoes','Movimentações'],['conferencia','Conferência']]}:{executive:[['visao','Indicadores'],['controle','Confiabilidade'],['relatorios','Relatórios'],['integracao','Sincronização']],operational:[['animais','Animais'],['manejos','Manejos'],['repro','Reprodução'],['nascimentos','Nascimentos'],['controle','Pendências']]};
const root=mk('section','bq4-workspace');root.hidden=true;root.setAttribute('aria-label','Ambiente Bodoquena V4');
let dismissed=false;const reopen=mk('button','bq4-chip','Abrir ambiente de trabalho');reopen.type='button';reopen.hidden=true;const dismiss=mk('button','bq4-chip','✕ Fechar painel');dismiss.type='button';dismiss.setAttribute('aria-label','Fechar ambiente de trabalho');dismiss.addEventListener('click',()=>{dismissed=true;root.hidden=true;reopen.hidden=false});reopen.addEventListener('click',()=>{dismissed=false;root.hidden=false;reopen.hidden=true});root.append(dismiss);
const modeRow=mk('div','bq4-mode');const heading=mk('div','bq4-mode-name');heading.append(mk('b','','Ambiente de trabalho'),mk('small','','Visualização individual; permissões preservadas'));
const toggle=mk('div','bq4-toggle');toggle.setAttribute('role','group');toggle.setAttribute('aria-label','Tipo de visualização');let mode=load('mode')==='operational'?'operational':'executive';
const options=[['executive','Executivo'],['operational','Operacional']];
const links=mk('div','bq4-shortcuts');function showMode(){toggle.replaceChildren();links.replaceChildren();options.forEach(([val,label])=>{const b=mk('button','',label);b.type='button';b.classList.toggle('active',mode===val);b.setAttribute('aria-pressed',String(mode===val));b.addEventListener('click',()=>{mode=val;save('mode',mode);showMode()});toggle.append(b)});
 for(const [id,label] of targets[mode]){const button=navButton(id);if(!button)continue;const b=mk('button','bq4-chip',label+' ↗');b.type='button';b.addEventListener('click',()=>open(id));links.append(b)}
 if(!links.children.length)links.append(mk('small','','Sem módulos adicionais liberados para esta conta.'));
}
modeRow.append(heading,toggle);root.append(modeRow,links);
// Shared context is only applied to native, compatible filter controls. No unauthorized pages are exposed.
const context=mk('div','bq4-context');const label=mk('label','','Contexto de consulta');const selector=mk('select');selector.setAttribute('aria-label','Seção de interesse');const sectors=['','Guaicurus','Bela Vista','Tope','Três Pedras','Porto Carreiro','Três Barras','Margarida'];sectors.forEach(v=>selector.add(new Option(v||'Todas as seções',v)));
selector.value=load('section')||'';const apply=mk('button','bq4-chip','Aplicar nesta tela');apply.type='button';const status=mk('span','bq4-context-status','');status.setAttribute('role','status');
function compatible(){return map?[['view-dashboard','dashSecao']]:[['page-lotes','loteSecao'],['page-repro','reproSection'],['page-pesagens','pesagensSecao']];}
function applySector(){if(!ready())return;const v=selector.value;let active=compatible().find(([parent])=>{const el=$('#'+parent);return el&&getComputedStyle(el).display!=='none'&&!el.hidden&&!el.closest('[hidden]')});
 if(!active){status.textContent='Esta tela não possui filtro de seção compatível.';return;}
 const select=$('#'+active[1]);if(!select){status.textContent='Filtro ainda não carregado.';return;}
 const opt=Array.from(select.options).find(o=>!v?o.value===''||/^(todas|todos)$/i.test(norm(o.textContent)):norm(o.value)===norm(v)||norm(o.textContent)===norm(v));
 if(!opt){status.textContent='Seção não disponível nesta tela.';return;}select.value=opt.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));
 if(map&&active[0]==='view-dashboard')$('#dashFilterForm')?.requestSubmit?.();status.textContent=v?'Filtro solicitado: '+v:'Filtro geral solicitado.';
}
selector.addEventListener('change',()=>{save('section',selector.value);status.textContent='Contexto guardado. Aplique nas telas compatíveis.'});apply.addEventListener('click',applySector);
label.append(selector);context.append(label,apply,status);root.append(context);
const sections=mk('div','bq4-features');const configs=map?[['Confiabilidade do mapa','Conferir posição, origem e divergências antes de aprovar.','conferencia'],['Movimentações','Conferir registros de origem e destino na rotina real.','movimentacoes'],['Ficha 360°','Consultar histórico individual pelo SISBOV.','fichaAnimal']]:[['Confiabilidade dos dados','Sem lote, sem local, falhas de carga e divergências.','controle'],['Pendências e aprovações','Usar a fila real de solicitações e conferências.','controle'],['Origem e sincronização','Conferir data da última carga e histórico de execução.','integracao'],['Autoria dos manejos','Distinguir responsável vinculado do usuário que lançou.','manejos']];
configs.forEach(([title,detail,page])=>{const box=mk('div','bq4-feature');box.append(mk('b','',title),mk('small','',detail));const b=mk('button','bq4-chip','Abrir ↗');b.type='button';b.dataset.bq4Page=page;box.append(b);sections.append(box)});root.append(sections);
root.addEventListener('click',e=>{const b=e.target.closest('[data-bq4-page]');if(b)open(b.dataset.bq4Page)});
const search=$('#bqWorkspaceSearch');const parent=map?$('#view-dashboard .view-title')?.parentElement:$('#page-visao .page-head');if(parent)parent.insertAdjacentElement('afterend',root);else document.body.append(root);root.insertAdjacentElement('afterend',reopen);
// Provenance shown beside the native maneuvers, never inferred from technical responsible data.
function sourceBanner(){if(map)return;const page=$('#page-manejos');if(!page||$('#bq4ManeuverSource'))return;const bar=mk('div','bq4-provenance');bar.id='bq4ManeuverSource';const title=mk('b','','Origem: extrato da API iRancho');const info=mk('span','','Lançador = usuário declarado no extrato; responsável = vínculo técnico ou operacional. O usuário que sincronizou não é necessariamente quem lançou.');bar.append(title,info);page.querySelector('.page-head')?.after(bar);
 const select=$('#manejoResponsavel');if(select){const l=select.closest('div')?.querySelector('label');if(l)l.textContent='Usuário do lançamento (API)';const absent=Array.from(select.options).find(o=>o.value==='ausente'),known=Array.from(select.options).find(o=>o.value==='informado');if(absent)absent.textContent='Não informado';if(known)known.textContent='Identificado';}
 const notice=page.querySelector('.notice');if(notice)notice.textContent='O iRancho ainda não retornou a identidade de lançamento nas execuções já sincronizadas. A ausência fica marcada por execução e pode ser exportada. O responsável vinculado não comprova autoria.';
}
const nativeStatus=mk('span','bq4-native-status');nativeStatus.setAttribute('role','status');const statusSource=map?'#dashSync':'#dataStatus';
function reflect(){if(!ready()){if(!root.hidden)root.hidden=true;if(!reopen.hidden)reopen.hidden=true;return;}if(root.hidden!==dismissed)root.hidden=dismissed;if(reopen.hidden===dismissed)reopen.hidden=!dismissed;
 // Hide just the V4 quick action if its native module is unauthorized; never expose data by styling.
 $$('[data-bq4-page]',root).forEach(el=>{el.hidden=!navButton(el.dataset.bq4Page)});
 if(!root.dataset.bq4Setup){root.dataset.bq4Setup='1';showMode();sourceBanner();root.append(nativeStatus)}
 const native=$(statusSource);if(native){const val=native.textContent.trim();nativeStatus.textContent=val?('Atualização da origem: '+val):'';}
}
let pending=false;const monitor=new MutationObserver(records=>{if(pending||records.every(r=>r.target.closest?.('.bq4-workspace')))return;pending=true;setTimeout(()=>{pending=false;reflect()},350)});monitor.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']});
reflect();window.BodoquenaExperienceV4=Object.freeze({version:'20261021-v4',refresh:reflect});
})();
