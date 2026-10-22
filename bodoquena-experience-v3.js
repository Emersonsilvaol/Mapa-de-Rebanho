/* Bodoquena Experience V3: progressive UI on current, already-authorized screens. */
(()=>{'use strict';if(window.BodoquenaExperienceV3)return;
const $=(q,r=document)=>r.querySelector(q),$$=(q,r=document)=>Array.from(r.querySelectorAll(q));
const map=!!$('#mainTabs'),prefix='bq.v3.'+(map?'mapa':'gestao')+'.';
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const ready=()=>{const gate=$('#authGate');if(gate&&!gate.hidden)return false;const app=$('#app');if(app&&(app.hidden||getComputedStyle(app).display==='none'))return false;const login=$('#login');return !(login&&!login.hidden&&getComputedStyle(login).display!=='none')};
const read=k=>{try{return JSON.parse(localStorage.getItem(prefix+k)||'null')}catch{return null}};
const save=(k,v)=>{try{localStorage.setItem(prefix+k,JSON.stringify(v))}catch{}};
// 1. Keyboard navigation for the existing authorized command-search result set.
function command(){const box=$('.bq-command');if(!box||box.dataset.bq3Keyboard)return;box.dataset.bq3Keyboard='1';
 const input=$('.bq-command-input',box),results=$('.bq-command-results',box);if(!input||!results)return;
 const options=()=>$$('button.bq-result:not(:disabled)',results);
 let active=-1;input.setAttribute('aria-controls','bq3-command-options');results.id='bq3-command-options';input.setAttribute('aria-autocomplete','list');results.setAttribute('role','listbox');
 function mark(index){const all=options();active=all.length?Math.min(Math.max(index,0),all.length-1):-1;
 all.forEach((el,i)=>{el.classList.toggle('bq3-current',i===active);el.setAttribute('role','option');el.setAttribute('aria-selected',String(i===active));if(!el.id)el.id='bq3-option-'+i;});
 if(active>=0){input.setAttribute('aria-activedescendant',all[active].id);all[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');}
 input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopImmediatePropagation();mark(active<0&&e.key==='ArrowUp'?options().length-1:active+(e.key==='ArrowDown'?1:-1));}
 else if(e.key==='Enter'&&active>=0){const el=options()[active];if(el){e.preventDefault();e.stopImmediatePropagation();el.click();}}},true);
 input.addEventListener('input',()=>{active=-1;input.removeAttribute('aria-activedescendant')});
 results.addEventListener('mouseover',e=>{const el=e.target.closest('button.bq-result');if(el&&el!==e.relatedTarget?.closest?.('button.bq-result'))mark(options().indexOf(el))});
 if(!$('.bq3-command-hint',box)){const hint=document.createElement('p');hint.className='bq3-command-hint';hint.textContent='↑ ↓ Navegar  ·  Enter selecionar  ·  Esc fechar';box.append(hint)}
}
// 2/5. Persistent per-browser presentation preferences, never used as permissions or as data filters.
const observed=new WeakSet(),tableState=new WeakMap();
function idFor(t){if(t.id)return 'table.'+t.id;const parent=t.closest('[id]');const section=parent?.id||'root';const peers=$$('table',parent||document);return 'table.'+section+'.'+peers.indexOf(t)}
function tableEnhance(t){if(observed.has(t)||!t.tHead||!t.tBodies[0])return;const holder=t.closest('.table-wrap');const anchor=holder||t;const bar=anchor.previousElementSibling?.classList?.contains('bq-table-tools')?anchor.previousElementSibling:null;
 if(!bar||!t.dataset.bqEnhanced)return;observed.add(t);const heads=$$('th',t.tHead.rows[t.tHead.rows.length-1]);const grouped=t.tHead.rows.length>1||$$('th',t.tHead).some(h=>h.colSpan>1||h.rowSpan>1);const key=idFor(t);const saved=read(key)||{};const list=$('.bq-cols-list',bar);const inputs=list?$$('input[type=checkbox]',list):[];
 if(!grouped&&inputs.length){const values=Array.isArray(saved.columns)?saved.columns:[];inputs.forEach((input,i)=>{if(values[i]===false)input.checked=false;const apply=()=>{$$('tr',t).forEach(tr=>{const cell=tr.cells[i];if(cell)cell.classList.toggle('bq-column-hidden',!input.checked)})};apply();input.addEventListener('change',()=>{save(key,{...read(key),columns:inputs.map(x=>x.checked)});apply()});});}
 // Sorting is strictly a VIEW preference on plain, read-only table bodies. No source array, Supabase or export data is changed.
 const simple=!grouped&&!t.querySelector('tbody input,tbody select,tbody button,tbody a,tbody [contenteditable],tbody [draggable],tbody [onclick]')&&heads.length>1;
 if(simple){const wrap=document.createElement('label');wrap.className='bq3-sort';wrap.textContent='Ordenar ';
 const sel=document.createElement('select');sel.setAttribute('aria-label','Ordenar linhas exibidas');const none=new Option('Original','');sel.add(none);
 heads.slice(0,18).forEach((h,i)=>{const name=h.textContent.trim();if(name){sel.add(new Option(name+' ↑',i+':asc'));sel.add(new Option(name+' ↓',i+':desc'));}});wrap.append(sel);bar.append(wrap);
 const initial=$$('tbody tr',t);initial.forEach((tr,i)=>tr.dataset.bq3Order=String(i));
 function sort(){const val=sel.value;if(!val){const sorted=$$('tbody tr',t).sort((a,b)=>Number(a.dataset.bq3Order)-Number(b.dataset.bq3Order));const current=$$('tbody tr',t);if(sorted.some((tr,i)=>tr!==current[i]))sorted.forEach(tr=>t.tBodies[0].append(tr));return;}
 const [column,dir]=val.split(':'),idx=Number(column),rows=$$('tbody tr',t),collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
 rows.sort((a,b)=>{const av=a.cells[idx]?.textContent.trim()||'',bv=b.cells[idx]?.textContent.trim()||'';const c=collator.compare(av,bv);return (dir==='desc'?-c:c)||Number(a.dataset.bq3Order)-Number(b.dataset.bq3Order)});const current=$$('tbody tr',t);if(rows.some((tr,i)=>tr!==current[i]))rows.forEach(tr=>t.tBodies[0].append(tr));}
 if(saved.sort&&Array.from(sel.options).some(o=>o.value===saved.sort)){sel.value=saved.sort;sort()}
 sel.addEventListener('change',()=>{save(key,{...read(key),sort:sel.value});sort()});
 const revealRows=()=>{$$('tbody tr',t).forEach(tr=>{if(!tr.hasAttribute('tabindex')){tr.tabIndex=0;tr.title='Pressione Enter para ver os detalhes desta linha';}tr.classList.add('bq3-readonly-row')})};revealRows();
 t.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.target.tagName!=='TR'||!e.target.closest('tbody'))return;e.preventDefault();e.target.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))});
 let rowCount=initial.length;new MutationObserver(records=>{if(!records.some(m=>Array.from(m.addedNodes).some(n=>n.nodeType===1&&n.matches?.('tr')&&!n.dataset.bq3Order)))return;
 $$('tbody tr',t).forEach(tr=>{if(!tr.dataset.bq3Order)tr.dataset.bq3Order=String(rowCount++);});revealRows();inputs.forEach((input,i)=>{$$('tbody tr',t).forEach(tr=>tr.cells[i]?.classList.toggle('bq-column-hidden',!input.checked))});if(sel.value)sort();
 }).observe(t.tBodies[0],{childList:true});
 }
 tableState.set(t,{key,heads:heads.map(x=>x.textContent.trim())});
}
// 3. Motion-only changes on confirmed rendered numbers: never renders intermediate or guessed figures.
const values=new WeakMap();function animateKPIs(){const selectors=map?'#dashKpis .kpi-val,#dashKpis .kpi-value,#dashKpis strong':'#overviewMetrics .metric strong';
 $$(selectors).forEach(el=>{if(el.children.length)return;const next=el.textContent.trim();if(!next||next==='-'||next==='—')return;
 const before=values.get(el);values.set(el,next);if(before===undefined||before===next)return;
 el.classList.remove('bq3-value-change');void el.offsetWidth;el.classList.add('bq3-value-change');el.addEventListener('animationend',()=>el.classList.remove('bq3-value-change'),{once:true});});}
// 6. Timeline uses only stage/date fields already visible in a native, authorized detail. Full animal history stays in the Ficha do Animal.
function timeline(){const pane=$('.bq-detail-veil:not([hidden]) .bq-detail-body');if(!pane||pane.querySelector('.bq3-timeline'))return;
 const pairs=$$('.bq-detail-pair',pane).map(r=>({label:r.querySelector('span')?.textContent.trim()||'',value:r.querySelector('b')?.textContent.trim()||''}));
 const steps=pairs.filter(p=>/^(D0|D8|D9|D10|D11|DG|Insemina[cç][aã]o|Data da execução)/i.test(p.label)&&p.value&&!/^(—|-|não informado|sem execução)$/i.test(p.value));
 if(steps.length<2)return;const section=document.createElement('section');section.className='bq3-timeline';const h=document.createElement('h3');h.textContent='Etapas registradas nesta linha';section.append(h);
 const list=document.createElement('ol');for(const x of steps){const li=document.createElement('li');const b=document.createElement('b');b.textContent=x.label;const span=document.createElement('span');span.textContent=x.value;li.append(b,span);list.append(li)}section.append(list);pane.prepend(section);}
function fichaTimeline(){const box=$('#fichaResultado');if(!box||!box.textContent.trim())return;const panels=$$('.panel',box);const target=panels.find(x=>/linha do tempo/i.test(x.querySelector('.panel-head')?.textContent||''));if(target)target.classList.add('bq3-native-timeline')}
// 7. Native loading labels: visual skeleton only while the application's own status explicitly says it is loading.
function loading(){const selectors=map?'#view-dashboard .empty,#fichaResultado .empty':'#overviewMetrics .empty,#sectionBars .empty,#animalTable .empty,#lotTable .empty';
 $$(selectors).forEach(x=>x.classList.toggle('bq3-loading',/^\s*(Carregando|Consultando|Atualizando)/i.test(x.textContent||'')));
}
function scan(){if(!ready())return;command();animateKPIs();timeline();if(map)fichaTimeline();loading();$$('table[data-bq-enhanced]').forEach(tableEnhance)}
let scheduled=false;function queue(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;scan()},180)}
const watchTargets=[document.body];watchTargets.forEach(el=>new MutationObserver(records=>{if(records.every(x=>x.target.closest?.('.bq3-sort,.bq3-command-hint,.bq3-timeline')))return;queue()}).observe(el,{subtree:true,childList:true,characterData:true}));
document.addEventListener('click',e=>{if(e.target.closest('[data-page],[data-view],.bq-result,.bq-kpi-cta,table tbody tr,#btnFichaBuscar'))queue()});
scan();window.BodoquenaExperienceV3={version:'20261021-v3',refresh:scan};
})();
