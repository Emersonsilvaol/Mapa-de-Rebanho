(() => {
  'use strict';
  const isMapa = !!document.getElementById('mainTabs');
  const appName = isMapa ? 'mapa' : 'gestao';
  const key = 'bq-workspace-' + appName + '-v2';
  const nav = document.querySelector(isMapa ? '#mainTabs' : '.sidebar .nav');
  const sidebar = document.querySelector(isMapa ? '#mainTabs' : '.sidebar');
  if (!nav || !sidebar || document.getElementById('bqWorkspaceSearch')) return;
  const $ = (sel,root=document) => root.querySelector(sel);
  const $$ = (sel,root=document) => Array.from(root.querySelectorAll(sel));
  const create = (tag,cls,text) => { const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e; };
  const storage = (k,val) => {try { if(val===undefined)return localStorage.getItem(k);localStorage.setItem(k,val);}catch(_e){return null;}};
  const normal = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const numeric = s => Number(String(s??'').replace(/[^\d,-]/g,'').replace(/\./g,'').replace(',','.'));
  const visible = el => !!el && !el.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(el).display!=='none';
  const appReady = () => isMapa ? !!$('#authGate') && $('#authGate').hidden===true :
    !!$('#app') && !$('#app').classList.contains('hide') && getComputedStyle($('#app')).display!=='none';
  const navButtons = () => $$(isMapa?'button[data-view]':'button[data-page]',nav).filter(visible);
  const navLabel = b => b.querySelector('span')?.textContent?.trim()||b.textContent.trim();
  let settings={};
  try {settings=JSON.parse(storage(key)||'{}')||{};}catch(_e){}
  const wide = () => matchMedia('(min-width: 901px)').matches;
  function collapsed(on) {
    document.documentElement.classList.toggle('bq-compact',!!on && wide());
    settings.compact=!!on;storage(key,JSON.stringify(settings));
    const b=$('#bqCollapse');
    if(b){b.setAttribute('aria-pressed',String(!!on));b.setAttribute('title',on?'Expandir menu':'Recolher menu');b.textContent=on?'⟶':'⟵';}
  }
  const collapseBtn=create('button','bq-collapse','⟵');
  collapseBtn.id='bqCollapse';collapseBtn.type='button';collapseBtn.setAttribute('aria-label','Recolher ou expandir menu');collapseBtn.addEventListener('click',()=>collapsed(!settings.compact));
  if(isMapa)nav.insertBefore(collapseBtn,nav.firstChild);
  else sidebar.insertBefore(collapseBtn,nav);
  collapsed(!!settings.compact);
  addEventListener('resize',()=>document.documentElement.classList.toggle('bq-compact',!!settings.compact&&wide()),{passive:true});
  const sections=$$(isMapa?'.nav-section':'.nav-label',nav);
  sections.forEach((label,i)=>{
    const nodes=[];let next=label.nextElementSibling;
    while(next && !(isMapa?next.classList.contains('nav-section'):next.classList.contains('nav-label'))) {
      const cur=next;next=next.nextElementSibling;if(cur===collapseBtn)continue;nodes.push(cur);
    }
    if(!nodes.length)return;
    const wrap=create('div','bq-nav-items');wrap.dataset.bqGroup=String(i);
    label.after(wrap);nodes.forEach(n=>wrap.appendChild(n));
    const title=label.textContent.trim();
    const b=create('button','bq-nav-trigger');b.type='button';b.textContent=title||'Seção';
    b.setAttribute('aria-expanded','true');b.setAttribute('aria-label','Alternar seção '+title);
    label.replaceChildren(b);label.classList.add('bq-nav-header');
    if(settings['group'+i]===false){wrap.hidden=true;b.setAttribute('aria-expanded','false');}
    b.addEventListener('click',()=>{
      const open=wrap.hidden;
      wrap.hidden=!open;b.setAttribute('aria-expanded',String(open));
      settings['group'+i]=open;storage(key,JSON.stringify(settings));
    });
  });
  function ensureCurrentVisible(){
    const active=$(isMapa?'button[data-view].active':'button[data-page].active',nav);
    if(!active)return;
    const group=active.closest('.bq-nav-items');
    if(group?.hidden) {group.hidden=false;const btn=group.previousElementSibling?.querySelector('.bq-nav-trigger');btn?.setAttribute('aria-expanded','true');}
  }
  ensureCurrentVisible();
  nav.addEventListener('click',e=>{if(e.target.closest('button[data-view],button[data-page]'))setTimeout(ensureCurrentVisible,0)});
  const host = isMapa?$('.header-actions'):$('.top .account');
  const launch=create('button','bq-search-launch','⌕  Buscar no sistema');
  launch.type='button';launch.id='bqWorkspaceSearch';launch.title='Busca global · Ctrl+K / ⌘K';
  if(host)host.insertBefore(launch,isMapa?host.firstChild:host.firstChild);
  const veil=create('div','bq-command-veil');veil.hidden=true;veil.setAttribute('role','presentation');
  const dialog=create('section','bq-command');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','Busca global');
  const top=create('div','bq-command-top');const search=create('input','bq-command-input');
  search.type='search';search.placeholder='Buscar SISBOV, lote, seção, local ou tela…';search.setAttribute('aria-label','Busca global');
  const close=create('button','bq-close','Esc');close.type='button';close.setAttribute('aria-label','Fechar busca');
  top.append(search,close);const results=create('div','bq-command-results');
  dialog.append(top,results);veil.append(dialog);document.body.append(veil);
  let searchSequence=0,prevFocus=null;
  function openSearch(){if(!appReady())return;prevFocus=document.activeElement;veil.hidden=false;document.body.classList.add('bq-modal-open');search.value='';updateSearch('');search.focus();}
  function closeSearch(){veil.hidden=true;document.body.classList.remove('bq-modal-open');prevFocus?.focus?.();}
  launch.addEventListener('click',openSearch);close.addEventListener('click',closeSearch);
  veil.addEventListener('mousedown',e=>{if(e.target===veil)closeSearch();});
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();veil.hidden?openSearch():closeSearch();}
    if(e.key==='Escape'){if(!veil.hidden)closeSearch();else closeDetail();}
  });
  const detailVeil=create('div','bq-detail-veil');detailVeil.hidden=true;
  const detail=create('aside','bq-detail');detail.setAttribute('role','dialog');detail.setAttribute('aria-modal','true');
  detail.setAttribute('aria-label','Detalhes');const detailHead=create('div','bq-detail-head');
  const detailTitle=create('h2','', 'Detalhes');const detailClose=create('button','bq-detail-close','✕');
  detailClose.type='button';detailClose.setAttribute('aria-label','Fechar detalhes');
  const detailBody=create('div','bq-detail-body');
  detailHead.append(detailTitle,detailClose);detail.append(detailHead,detailBody);detailVeil.append(detail);document.body.append(detailVeil);
  detailClose.addEventListener('click',closeDetail);
  detailVeil.addEventListener('mousedown',e=>{if(e.target===detailVeil)closeDetail()});
  function closeDetail(){detailVeil.hidden=true;document.body.classList.remove('bq-drawer-open');}
  function showDetail(title,render){if(!appReady())return;detailTitle.textContent=title;detailBody.replaceChildren();render(detailBody);detailVeil.hidden=false;document.body.classList.add('bq-drawer-open');detailClose.focus();}
  function appendTextRow(box,label,value){const row=create('div','bq-detail-pair');row.append(create('span','',label),create('b','',value||'Não informado'));box.append(row);}
  function goNative(name){
    const btn=navButtons().find(b=>(b.dataset.view||b.dataset.page)===name);
    if(btn){btn.click();ensureCurrentVisible();return true;}return false;
  }
  function openAnimal(sisbov){
    closeSearch();closeDetail();
    if(isMapa){
      if(!goNative('fichaAnimal'))return;
      const field=$('#fichaBusca');if(field){field.value=sisbov;field.dispatchEvent(new Event('input',{bubbles:true}));$('#btnFichaBuscar')?.click();}
    }else window.dispatchEvent(new CustomEvent('bq:open-record',{detail:{kind:'animal',sisbov}}));
  }
  function openLot(value){
    closeSearch();closeDetail();
    if(isMapa) {
      if(goNative('mapaAtual')){const inp=$('#buscaAnimal');if(inp){inp.value=value;inp.dispatchEvent(new Event('input',{bubbles:true}));}}
    }else window.dispatchEvent(new CustomEvent('bq:open-record',{detail:{kind:'lote',name:value}}));
  }
  function mapAnimals(query){
    try {
      if(typeof DB==='undefined'||typeof podeAcesso!=='function'||!podeAcesso('fichaAnimal','ver'))return [];
      const out=[],seen=new Set();
      for(const a of DB.animais||[]){
        if(out.length>=25)break;
        const id=String(a.sisbov||'').trim();if(!id||seen.has(id))continue;
        if(normal([id,a.brinco,a.chip,a.setorAtual,a.setorInicial,a.local,a.lote].join(' ')).includes(normal(query))){
          seen.add(id);out.push({kind:'animal',name:id,subtitle:[a.brinco,a.setorAtual||a.setorInicial,a.local].filter(Boolean).join(' · '),value:id});
        }
      }
      return out;
    }catch(_e){return [];}
  }
  function mapPlaces(query){
    try{
      if(typeof DB==='undefined'||typeof podeAcesso!=='function'||!podeAcesso('mapaAtual','ver'))return [];
      const out=[],seen=new Set();
      const lista=typeof buildMapaUICached==='function'&&typeof todayISO==='function' ? (buildMapaUICached(todayISO()).animais||[]) : (DB.animais||[]);
      for(const a of lista){
        for(const s of [a.setorAtual,a.setorInicial,a.local,a.lote]){
          const val=String(s||'').trim();if(!val||seen.has(val)||!normal(val).includes(normal(query)))continue;
          out.push({kind:'lote',name:val,subtitle:'Local ou setor · consultar mapa atual',value:val});seen.add(val);
          if(out.length>=12)return out;
        }
      }
      return out;
    }catch(_e){return [];}
  }
  function addResult(target,kind,name,subtitle,run){
    const b=create('button','bq-result');
    b.type='button';const glyph=create('span','bq-result-icon',kind==='animal'?'#':kind==='lote'?'▦':'↗');
    const text=create('span','bq-result-copy');text.append(create('b','',name),create('small','',subtitle));
    b.append(glyph,text);b.addEventListener('click',run);target.append(b);
  }
  function renderSearch(query,asyncItems=[]){
    if(veil.hidden)return;
    results.replaceChildren();
    const q=normal(query);
    const matches=navButtons().filter(b=>!q||normal(navLabel(b)).includes(q));
    if(matches.length){results.append(create('div','bq-result-label','TELAS'));matches.slice(0,9).forEach(b=>addResult(results,'view',navLabel(b),'Ir para esta área',()=>{b.click();closeSearch();}));}
    const things=isMapa?(q?[...mapAnimals(q),...mapPlaces(q)]:[]):asyncItems;
    if(q && things.length){results.append(create('div','bq-result-label','REGISTROS DA BASE DISPONÍVEL'));things.slice(0,30).forEach(it=>addResult(results,it.kind,it.name,it.subtitle||'',()=>it.kind==='animal'?openAnimal(it.value):openLot(it.value)));}
    if(!matches.length&&!things.length)results.append(create('div','bq-result-empty',q?'Nada encontrado nos registros disponíveis. Use a busca específica da tela para consultar mais filtros.':'Digite para consultar os módulos e registros disponíveis.'));
    results.append(create('div','bq-search-foot','Ctrl/⌘ + K para abrir · Esc para fechar · resultados respeitam os acessos disponíveis'));
  }
  function updateSearch(query){
    const seq=++searchSequence;renderSearch(query);
    if(isMapa||!query.trim()||!appReady())return;
    window.dispatchEvent(new CustomEvent('bq:records',{detail:{query,done:records=>{if(seq!==searchSequence||veil.hidden)return;renderSearch(query,records||[]);}}}));
  }
  search.addEventListener('input',()=>updateSearch(search.value));
  search.addEventListener('keydown',e=>{if(e.key==='Enter'){const first=$('.bq-result',results);if(first){e.preventDefault();first.click();}}});
  // Dashboard cards: native drill-down takes precedence on Mapa, because it already guarantees the exact SISBOV list.
  function nativeTrends(cards) {
    if(!isMapa || cards.length<5)return;
    try {
      if(typeof contextoDashboard!=='function')return;
      const ctx=contextoDashboard();
      if(!Array.isArray(ctx.movs)||typeof ctx.entra!=='function'||typeof ctx.sai!=='function')return;
      const dated=ctx.movs.filter(m=>/^\d{4}-\d{2}/.test(String(m.data||'')));
      const distinct=[...new Set(dated.map(m=>m.data.slice(0,7)))].sort();
      if(distinct.length<2)return;
      const last=distinct[distinct.length-1];
      const months=[];
      for(let i=5;i>=0;i--){
        const [yr,mo]=last.split('-').map(Number),dt=new Date(yr,mo-1-i,1);
        months.push(dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0'));
      }
      const counts=months.map(month=>{
        const rows=dated.filter(m=>m.data.slice(0,7)===month);
        const amount=fn=>rows.filter(fn).reduce((s,m)=>s+(Number(m.quantidade)||1),0);
        return {inside:amount(ctx.entra),outside:amount(ctx.sai)};
      });
      let running=(ctx.abertura||[]).length;
      const series=counts.map(({inside,outside})=>{
        running+=inside-outside;return {inside,outside,variation:inside-outside,current:running};
      });
      const fields={1:'inside',2:'outside',3:'variation',4:'current'};
      for(const [key,field] of Object.entries(fields)){
        const card=cards[Number(key)];
        if(!card||card.querySelector('.bq-mini-trend'))continue;
        const points=series.map(r=>r[field]);
        if(points.every(v=>v===0))continue;
        const min=Math.min(...points),max=Math.max(...points);
        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
        svg.setAttribute('viewBox','0 0 144 30');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('bq-mini-trend');
        svg.setAttribute('role','img');svg.setAttribute('aria-label','Tendência calculada com movimentos reais de '+months[0]+' a '+months[5]);
        const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');
        const values=points.map((v,i)=>String((i*140/5+2).toFixed(1))+','+String((27-24*(v-min)/(max-min||1)).toFixed(1))).join(' ');
        poly.setAttribute('points',values);poly.setAttribute('stroke','currentColor');poly.setAttribute('stroke-width','2.1');poly.setAttribute('fill','none');poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');svg.append(poly);
        card.append(svg);
        const prev=points[points.length-2],current=points[points.length-1];
        card.append(create('small','bq-trend-compare',(current-prev>0?'+':'')+(current-prev).toLocaleString('pt-BR')+' vs. mês anterior'));
      }
    }catch(_e){/* no trustworthy history, no fabricated trend */}
  }
  function decorateKpis(){
    const cards=isMapa?$$('#dashKpis .kpi-card'):$$('#overviewMetrics .metric');
    cards.forEach((card,i)=>{
      if(card.querySelector('.bq-kpi-cta'))return;
      const title=(isMapa?$('.kpi-lbl',card):$('span',card))?.textContent?.trim()||'Indicador';
      const action=create('button','bq-kpi-cta','Ver composição ↗');action.type='button';action.title='Abrir dados de origem do indicador';
      action.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        if(isMapa){
          const orig=card.querySelector('.dash-number');
          if(orig){orig.click();return;}
          if(typeof abrirDetalheDashboard==='function') {
            const types=['initial','in','out','variation','current'];
            abrirDetalheDashboard(types[i]||'current');return;
          }
          showDetail(title,body=>body.append(create('p','bq-empty','Sem composição autorizada para este indicador.')));
        }else{
          const callback=response=>{
            const items=response?.items||[];const total=response?.total||0;
            showDetail(title,body=>{
              body.append(create('div','bq-detail-count',(response?.total===null?'Ver registros no módulo correspondente':total+' animais identificados na fonte consultada')));
              if(!items.length)body.append(create('p','bq-empty',response?.message||'Consulte a tela específica para detalhar este indicador.'));
              items.forEach(rec=>{
                const b=create('button','bq-animal-item');b.type='button';
                b.append(create('b','',rec.sisbov||'Sem SISBOV'),create('small','',[rec.secao,rec.local,rec.lote].filter(Boolean).join(' · ')));
                b.addEventListener('click',()=>openAnimal(rec.sisbov));body.append(b);
              });
              const open=create('button','bq-action',i===2?'Abrir Reprodução ↗':i===3?'Abrir Nascimento ↗':i===4?'Abrir Pendências ↗':'Abrir relação completa ↗');open.type='button';
              open.addEventListener('click',()=>{closeDetail();goNative(i===2?'repro':i===3?'nascimentos':i===4?'controle':'animais');});body.append(open);
            });
          };
          window.dispatchEvent(new CustomEvent('bq:kpi',{detail:{index:i,done:callback}}));
        }
      });
      card.append(action);card.classList.add('bq-kpi-interactive');
    });
    nativeTrends(cards);
  }
  function decorateTables(){
    const root=isMapa?$('.view.active'):$('.page:not([hidden])');
    if(!root)return;
    $$('table',root).filter(t=>t.tHead&&t.tBodies?.[0]).slice(0,12).forEach(table=>{
      if(table.dataset.bqEnhanced)return;
      table.dataset.bqEnhanced='1';
      const head=table.tHead;
      const headers=$$('th',head.rows[head.rows.length-1]); // do not modify original table structure
      const bar=create('div','bq-table-tools');
      const filter=create('input','bq-table-filter');
      filter.type='search';filter.placeholder='Filtrar linhas exibidas…';filter.setAttribute('aria-label','Filtrar esta tabela');
      const selection=create('button','bq-tool-btn','Selecionar linhas');selection.type='button';
      const selected=create('span','bq-selected-count','');
      const cols=create('details','bq-cols');const summary=create('summary','','Colunas');const list=create('div','bq-cols-list');
      const hasGroupedHeaders=head.rows.length>1 || $$('th',head).some(th=>th.colSpan>1||th.rowSpan>1);
      if(hasGroupedHeaders){cols.hidden=true;cols.setAttribute('aria-label','Tabela com colunas agrupadas; manter estrutura original');}
      headers.forEach((th,i)=>{
        if(i>=24)return;
        const label=create('label','bq-col-label');
        const input=create('input');input.type='checkbox';input.checked=true;
        input.addEventListener('change',()=>{
          $$('tr',table).forEach(tr=>{const cell=tr.cells[i];if(cell)cell.classList.toggle('bq-column-hidden',!input.checked);});
        });
        label.append(input,create('span','',th.textContent.trim()||'Coluna '+(i+1)));list.append(label);
      });
      cols.append(summary,list);bar.append(filter,selection,selected,cols);
      const holder=table.closest('.table-wrap');
      (holder||table).parentNode?.insertBefore(bar,holder||table);
      let selecting=false;
      selection.addEventListener('click',()=>{selecting=!selecting;selection.classList.toggle('active',selecting);selection.textContent=selecting?'Concluir seleção':'Selecionar linhas';if(!selecting){$$('tbody tr',table).forEach(tr=>tr.classList.remove('bq-row-selected'));selected.textContent='';}});
      table.addEventListener('click',e=>{
        if(!selecting||e.target.closest('button,a,input,label,select'))return;
        const tr=e.target.closest('tbody tr');if(!tr)return;
        tr.classList.toggle('bq-row-selected');selected.textContent=$$('tbody tr.bq-row-selected',table).length+' selecionadas';
      });
      function applyFilter(){
        const term=normal(filter.value);
        $$('tbody tr',table).forEach(tr=>tr.classList.toggle('bq-row-filtered',!!term&&!normal(tr.textContent).includes(term)));
      }
      filter.addEventListener('input',applyFilter);
      // Only explicit double click opens read-only drawer; normal row clicks remain owned by the original system.
      table.addEventListener('dblclick',e=>{
        if(selecting||e.target.closest('button,a,input'))return;
        const row=e.target.closest('tbody tr');if(!row)return;
        showDetail('Detalhes da linha',body=>{
          const hs=$$('th',table.tHead.rows[table.tHead.rows.length-1]);
          Array.from(row.cells).slice(0,25).forEach((cell,i)=>appendTextRow(body,hs[i]?.textContent?.trim()||'Campo '+(i+1),cell.textContent.trim()));
          const sis=Array.from(row.cells).map(c=>c.textContent).join(' ').match(/\b\d{15}\b/);
          if(sis){
            const btn=create('button','bq-action','Abrir ficha SISBOV '+sis[0]);btn.type='button';
            btn.addEventListener('click',()=>openAnimal(sis[0]));body.append(btn);
          }
        });
      });
      const mo=new MutationObserver(()=>{if(filter.value)applyFilter();});
      mo.observe(table.tBodies[0],{childList:true});
    });
  }
  function updateAnimations(){
    if(!appReady())return;
    decorateKpis();decorateTables();ensureCurrentVisible();
  }
  let pending=false;
  const observer=new MutationObserver(mutations=>{
    if(!mutations.some(m=>!m.target.closest?.('.bq-command,.bq-table-tools,.bq-detail,.bq-nav-header')))return;
    if(pending)return;pending=true;
    setTimeout(()=>{pending=false;updateAnimations();},250);
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('click',e=>{if(e.target.closest('[data-view],[data-page]'))setTimeout(updateAnimations,140);});
  updateAnimations();
})();