/* Bodoquena UX v2 — progressive, read-only interaction layer. */
(()=>{'use strict';
const map=!!document.querySelector('#mainTabs'),nav=document.querySelector(map?'#mainTabs':'.sidebar .nav');
if(!nav||window.__bqExperience20261009)return;window.__bqExperience20261009=true;
const $=(s,p=document)=>p.querySelector(s),all=(s,p=document)=>[...p.querySelectorAll(s)],txt=e=>e?.textContent?.replace(/\s+/g,' ').trim()||'',norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const key=map?'bq-map':'bq-gestao',save=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};const load=k=>{try{return localStorage.getItem(k)}catch(_){return null}};
const authorized=el=>{if(!el||el.hidden||el.closest('[hidden]'))return false;for(let n=el;n&&n!==document.body;n=n.parentElement){const st=getComputedStyle(n);if(st.display==='none'||st.visibility==='hidden')return false}return true};
const navKey=map?'data-view':'data-page',navButton=k=>$('button['+navKey+'="'+k+'"]',nav);
const visiblePages=()=>all('button['+navKey+']',nav).filter(authorized);
const openPage=k=>{const b=navButton(k);if(b&&authorized(b)){b.click();return true}return false};
const active=()=>$(map?'.view.active':'.page:not([hidden])')||$(map?'#view-dashboard':'#page-visao');
const bar=$(map?'.app-header .header-actions':'.top .top-left')||$(map?'.app-header':'.top');if(!bar)return;
const navToggle=document.createElement('button');navToggle.type='button';navToggle.id='bq-ux-collapse';navToggle.className='bq-ux-head-btn';navToggle.innerHTML='<span aria-hidden="true">☰</span><span class="bq-ux-action-label">Menu</span>';navToggle.setAttribute('aria-label','Compactar ou expandir navegação');bar.prepend(navToggle);
function setCompact(on){document.documentElement.classList.toggle('bq-ux-collapsed',on);navToggle.title=on?'Expandir menu':'Compactar menu';navToggle.setAttribute('aria-expanded',String(!on));save(key+'-compact',on?'1':'0')}
setCompact(load(key+'-compact')==='1');navToggle.onclick=()=>setCompact(!document.documentElement.classList.contains('bq-ux-collapsed'));
const searchOpen=document.createElement('button');searchOpen.type='button';searchOpen.id='bq-ux-search-open';searchOpen.className='bq-ux-head-btn';searchOpen.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg><span>Buscar</span><kbd>⌘K</kbd>';searchOpen.setAttribute('aria-label','Busca global, atalho Ctrl K');bar.append(searchOpen);
// Keep the original authorization behavior: groups only hide existing buttons.
all(map?'.nav-section':'.nav-label',nav).forEach(label=>{
 const members=[];let el=label.nextElementSibling;
 while(el&&!el.matches(map?'.nav-section':'.nav-label')){if(el.matches('button['+navKey+']'))members.push(el);el=el.nextElementSibling}
 if(members.length<2)return;
 label.classList.add('bq-ux-group');label.setAttribute('role','button');label.tabIndex=0;label.setAttribute('aria-expanded','true');
 const click=()=>{const hide=label.getAttribute('aria-expanded')==='true';label.setAttribute('aria-expanded',String(!hide));members.forEach(x=>x.classList.toggle('bq-ux-group-hidden',hide))};
 label.addEventListener('click',click);label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}});
});
// Global search: authorized navigation plus visible table rows. Actual SISBOV uses the app's existing lookup.
const box=document.createElement('div');box.id='bq-ux-palette';box.hidden=true;
box.innerHTML='<div class="bq-ux-shade" data-close="1"></div><section class="bq-ux-dialog" role="dialog" aria-modal="true" aria-label="Busca global"><div class="bq-ux-input-line"><span>⌕</span><input id="bq-ux-query" type="search" autocomplete="off" placeholder="SISBOV, lote, seção, pasto ou tela"><button type="button" data-close="1">Esc</button></div><div id="bq-ux-results" role="listbox"></div><small class="bq-ux-hint">↑ ↓ navegar · Enter abrir · Esc fechar · Ctrl/⌘ + K</small></section>';document.body.append(box);
const query=$('#bq-ux-query'),result=$('#bq-ux-results');let focusBack=null;
const close=()=>{box.hidden=true;document.body.classList.remove('bq-ux-modal-open');focusBack?.focus?.()};
const open=()=>{focusBack=document.activeElement;box.hidden=false;document.body.classList.add('bq-ux-modal-open');query.value='';renderSearch();query.focus()};searchOpen.onclick=open;
box.onclick=e=>{if(e.target.closest('[data-close]'))close()};
function searchSisbov(value){
 if(!openPage(map?'fichaAnimal':'animais'))return;
 setTimeout(()=>{const f=$(map?'#fichaBusca':'#animalBusca');if(!f)return;f.value=value;f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}));if(map)$('#btnFichaBuscar')?.click()},70);
}
function renderSearch(){
 const q=norm(query.value),items=[];const animal=navButton(map?'fichaAnimal':'animais');
 if(q&&authorized(animal))items.push({kind:'sisbov',label:'Consultar SISBOV / identificação: '+query.value,val:query.value});
 visiblePages().forEach(b=>{const label=txt(b.querySelector('span'))||txt(b);if(!q||norm(label).includes(q))items.push({kind:'page',label,val:b.getAttribute(navKey)})});
 if(q&&active()){let n=0;all('table tbody tr',active()).slice(0,1200).forEach(row=>{if(n>=9)return;const v=txt(row);if(v&&norm(v).includes(q)&&authorized(row)){items.push({kind:'row',label:v.slice(0,135),row});n++}})}
 result.replaceChildren();if(!items.length){const p=document.createElement('p');p.textContent='Sem resultados visíveis. Para consultar toda a base, use a ficha de animais.';result.append(p);return}
 items.slice(0,23).forEach((item,i)=>{const b=document.createElement('button');b.type='button';b.className='bq-ux-result';b.setAttribute('role','option');b.setAttribute('aria-selected',String(i===0));const name=document.createElement('span');name.textContent=item.label;const label=document.createElement('small');label.textContent=item.kind==='page'?'Tela':item.kind==='row'?'Linha visível':'Consulta';b.append(name,label);
 b.onclick=()=>{close();if(item.kind==='page')openPage(item.val);else if(item.kind==='sisbov')searchSisbov(item.val);else{item.row.scrollIntoView({behavior:'smooth',block:'center'});item.row.classList.add('bq-ux-hit');setTimeout(()=>item.row.classList.remove('bq-ux-hit'),2300)}};result.append(b)});
}
query.addEventListener('input',renderSearch);query.addEventListener('keydown',e=>{const opts=all('.bq-ux-result',result),ix=opts.findIndex(x=>x.getAttribute('aria-selected')==='true');if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!opts.length)return;opts.forEach(x=>x.setAttribute('aria-selected','false'));opts[(ix+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length].setAttribute('aria-selected','true')}if(e.key==='Enter'){e.preventDefault();opts[Math.max(ix,0)]?.click()}});
document.addEventListener('keydown',e=>{const typing=e.target?.matches?.('input,textarea,select,[contenteditable]');if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();box.hidden?open():close()}else if(e.key==='/'&&!typing&&box.hidden){e.preventDefault();open()}else if(e.key==='Escape'&&!box.hidden){e.preventDefault();close()}});
// Detail drawer is independent of the apps' existing record/approval drawers.
const veil=document.createElement('div');veil.id='bq-ux-veil';veil.hidden=true;const drawer=document.createElement('aside');drawer.id='bq-ux-drawer';drawer.hidden=true;drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','Detalhes');drawer.innerHTML='<div class="bq-ux-drawer-head"><div><small>DETALHAMENTO</small><h2 id="bq-ux-drawer-title">Detalhes</h2></div><button id="bq-ux-close" type="button" aria-label="Fechar">×</button></div><div id="bq-ux-drawer-body"></div><footer><button id="bq-ux-drawer-go" type="button">Abrir consulta completa</button></footer>';document.body.append(veil,drawer);let after=null,origin=null;
const closeDrawer=()=>{veil.hidden=true;drawer.hidden=true;document.body.classList.remove('bq-ux-modal-open');origin?.focus?.()};
function openDrawer(title,rows,action){origin=document.activeElement;$('#bq-ux-drawer-title').textContent=title;const body=$('#bq-ux-drawer-body');body.replaceChildren();(rows?.length?rows:['Abra a consulta para verificar os registros completos.']).forEach(value=>{const p=document.createElement('p');p.className='bq-ux-detail-item';p.textContent=value;body.append(p)});after=action||null;$('#bq-ux-drawer-go').hidden=!after;veil.hidden=false;drawer.hidden=false;document.body.classList.add('bq-ux-modal-open');$('#bq-ux-close').focus()}
veil.onclick=closeDrawer;$('#bq-ux-close').onclick=closeDrawer;$('#bq-ux-drawer-go').onclick=()=>{const fn=after;closeDrawer();fn?.()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!drawer.hidden)closeDrawer()});
// KPI: shows actual value and an authorized drilldown, never invents historical comparisons.
function cards(){const host=$(map?'#view-dashboard .exec-kpis':'#overviewMetrics');if(!host)return;
 all(map?'.kpi-card':'.metric',host).forEach(c=>{if(c.dataset.bqUxCard)return;c.dataset.bqUxCard='1';if(c.matches('button,a,[role="button"]')||c.hasAttribute('onclick')||c.querySelector('button,a,[onclick]'))return;c.classList.add('bq-ux-card');c.tabIndex=0;c.setAttribute('role','button');
 const show=()=>{const title=txt(c.querySelector('span'))||txt(c.querySelector('.kpi-label'))||'Indicador';const value=txt(c.querySelector('strong'))||txt(c.querySelector('.kpi-val'))||'—';const target=/lote/i.test(title)?'lotes':/repro|dg|d0|d8|d10|pren/i.test(title)?(map?'fichaAnimal':'repro'):(map?'fichaAnimal':'animais');openDrawer(title+' · '+value,['Valor exibido no painel: '+value,'A composição completa por SISBOV está na consulta de registros.'],()=>openPage(target))};c.addEventListener('click',show);c.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show()}})});
}
// Tables: read-only filtering, column visibility and selection; no manipulation of business data.
function tableUI(t){if(t.dataset.bqUxTable)return;const th=all('thead th',t),body=$('tbody',t);if(!body||th.length<2||th.length>18)return;t.dataset.bqUxTable='1';
 const panel=document.createElement('div');panel.className='bq-ux-table-tools';panel.innerHTML='<label>⌕ <input type="search" aria-label="Filtrar registros exibidos" placeholder="Filtrar nesta tabela"></label><button type="button" data-action="cols">Colunas</button><button type="button" data-action="select">Selecionar</button><button type="button" data-action="detail" disabled>Detalhes</button><small class="bq-ux-table-count"></small><div class="bq-ux-columns" hidden></div>';t.parentElement?.insertBefore(panel,t);
 const field=$('input[type="search"]',panel),count=$('.bq-ux-table-count',panel),colBox=$('.bq-ux-columns',panel),rows=()=>all('tr',body);
 const apply=()=>{const q=norm(field.value);let n=0;rows().forEach(r=>{const match=!q||norm(txt(r)).includes(q);r.classList.toggle('bq-ux-filtered',!match);if(match)n++});count.textContent=n+' linhas visíveis'};field.oninput=apply;
 th.forEach((h,i)=>{const label=document.createElement('label'),cb=document.createElement('input');cb.type='checkbox';cb.checked=true;label.append(cb,document.createTextNode(txt(h)||'Coluna '+(i+1)));colBox.append(label);cb.onchange=()=>all('tr',t).forEach(row=>{row.children[i]?.classList.toggle('bq-ux-col-hidden',!cb.checked)})});
 $('[data-action="cols"]',panel).onclick=()=>{colBox.hidden=!colBox.hidden};
 let selecting=false;const select=$('[data-action="select"]',panel),details=$('[data-action="detail"]',panel);
 select.onclick=()=>{selecting=!selecting;select.classList.toggle('bq-ux-on',selecting);select.textContent=selecting?'Terminar seleção':'Selecionar';if(!selecting){rows().forEach(x=>x.classList.remove('bq-ux-selected'));details.disabled=true;details.textContent='Detalhes'}};
 t.addEventListener('click',e=>{if(!selecting)return;const r=e.target.closest('tbody tr');if(!r)return;e.preventDefault();e.stopPropagation();r.classList.toggle('bq-ux-selected');const n=rows().filter(x=>x.classList.contains('bq-ux-selected')).length;details.disabled=!n;details.textContent=n?'Detalhes ('+n+')':'Detalhes'},true);
 details.onclick=()=>openDrawer('Registros selecionados',rows().filter(r=>r.classList.contains('bq-ux-selected')).map(txt),null);apply();
}
let oldPage=null,observer=null,timer;
function scan(){const pg=active();if(!pg)return;cards();all('table',pg).slice(0,32).forEach(tableUI);if(pg!==oldPage){observer?.disconnect();oldPage=pg;observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,270)});observer.observe(pg,{childList:true,subtree:true})}}
nav.addEventListener('click',()=>setTimeout(scan,160));scan();
const host=$(map?'#view-dashboard .exec-kpis':'#overviewMetrics');if(host)new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scan,260)}).observe(host,{childList:true,subtree:true});
setInterval(()=>{if(box.hidden&&drawer.hidden)scan()},6000);
})();