/* Mapa de Rebanho — reorganização executiva v3 | UI only: DB readonly; handlers intact. */
(function(){'use strict';
  const byId=id=>document.getElementById(id);
  const el=(tag,cl,text)=>{const n=document.createElement(tag);if(cl)n.className=cl;if(text!=null)n.textContent=text;return n};
  const fmt=n=>Number(n||0).toLocaleString('pt-BR');
  const asText=v=>String(v==null?'':v).trim();
  const ui=()=>{
    if(document.documentElement.dataset.bqV3==='1')return;
    if(!byId('mainTabs')||!byId('view-dashboard'))return;
    document.documentElement.dataset.bqV3='1';
    const view=id=>byId('view-'+id);
    function header(id,kicker){
      const root=view(id);if(!root)return null;
      const h=root.querySelector(':scope > h2.view-title');if(!h)return root;
      const p=root.querySelector(':scope > p.view-sub');
      const shell=el('div','bq3-heading'),intro=el('div','bq3-heading-intro');
      intro.append(el('div','bq3-eyebrow',kicker),h);if(p)intro.append(p);
      shell.append(intro);root.prepend(shell);
      root.classList.add('bq3-view');
      return root;
    }
    function navigar(mod){
      if(typeof podeAcesso==='function' && !podeAcesso(moduloViewAcesso(mod),'ver'))return false;
      if(typeof irParaView==='function')irParaView(mod);
      else byId('mainTabs')?.querySelector('button[data-view="'+mod+'"]')?.click();
      return true;
    }
    function link(text,dest,extra){const b=el('button','bq3-jump',text);b.type='button';b.addEventListener('click',()=>{if(navegar(dest)&&extra)extra()});return b}
    const dash=header('dashboard','CENTRAL DE CONTROLE'), inicial=header('mapaInicial','ESTOQUE DE ABERTURA'), final=header('mapaAtual','POSIÇÃO ATUAL'),mov=header('movimentacoes','REGISTRO E AUDITORIA');
    header('fichaAnimal','CONSULTA INDIVIDUAL');
    if(dash){
      const title=dash.querySelector('h2.view-title');if(title)title.textContent='Visão executiva do rebanho';
      const shortcuts=el('div','bq3-shortcuts');
      shortcuts.append(link('Consultar mapa final','mapaAtual'),link('Ver movimentações','movimentacoes'),link('Conferir base inicial','mapaInicial'));
      dash.querySelector('#dashKpis')?.after(shortcuts);
      dash.querySelector('#dashFilterForm')?.classList.add('bq3-filterbar');
      dash.querySelector('.dashboard-overview')?.classList.add('bq3-chartgroup');
      dash.querySelector('.dashboard-activity')?.classList.add('bq3-chartgroup');
      dash.querySelector('.dashboard-support')?.classList.add('bq3-chartgroup');
      const sync=byId('dashSync');if(sync)sync.classList.add('bq3-sync');
    }
    if(inicial){
      const t=inicial.querySelector(':scope > .toolbar');if(t){t.classList.add('bq3-actionbar');const danger=byId('btnExcluirTudo');if(danger){const d=el('details','bq3-danger-menu');d.append(el('summary',null,'Ações críticas'));d.append(danger);t.append(d)}}
      const f=inicial.querySelector(':scope > .panel');if(f)f.classList.add('bq3-searchbox');
      const cards=el('div','bq3-statusgrid');cards.id='bq3-inicial-status';byId('mapaInicialResumo')?.before(cards);
      const s=inicial.querySelector('p.view-sub');if(s)s.textContent='Estoque de abertura por identificação SISBOV. A categoria é calculada pela data de nascimento.';
    }
    if(final){
      const bar=final.querySelector(':scope > .toolbar');if(bar)bar.classList.add('bq3-filterbar','bq3-mapfinal-bar');
      const cards=el('div','bq3-statusgrid');cards.id='bq3-final-status';byId('mapaAtualResumo')?.before(cards);
      const t=byId('btnVerAnimais');if(t)t.textContent='Exibir / ocultar SISBOVs';
      const search=byId('buscaAnimal');if(search)search.setAttribute('aria-label','Buscar SISBOV, brinco, chip ou local na tabela de animais');
    }
    if(mov){
      const bars=Array.from(mov.querySelectorAll(':scope > .toolbar'));
      if(bars[0]){
        bars[0].classList.add('bq3-actionbar');
        const critical=el('details','bq3-danger-menu');critical.append(el('summary',null,'Ações críticas'));
        [byId('btnReprocessarMov'),byId('btnExcluirTudoMov')].filter(Boolean).forEach(b=>critical.append(b));
        bars[0].append(critical);
      }
      if(bars[1])bars[1].classList.add('bq3-filterbar','bq3-movfilters');
      const cards=el('div','bq3-statusgrid');cards.id='bq3-mov-status';const panel=mov.querySelector(':scope > .panel');if(panel)panel.before(cards);
      const sub=mov.querySelector('p.view-sub');if(sub)sub.textContent='Movimentações por SISBOV, data, tipo, origem e destino. Registros protegidos pelas permissões existentes.';
    }
    // A ficha continua acessível pelas permissões originais, mas a consulta vira ação global.
    const navItem=byId('mainTabs').querySelector('button[data-view="fichaAnimal"]');if(navItem)navItem.classList.add('bq3-secondary-nav');
    const actionArea=document.querySelector('.app-header .header-actions');
    if(actionArea){
      const open=el('button','bq3-global-search','⌕  Consultar animal');open.type='button';open.id='bq3-global-open';open.title='Consultar SISBOV, brinco ou chip';
      actionArea.insertBefore(open,actionArea.firstChild);
      const layer=el('div','bq3-search-overlay');layer.id='bq3-search-overlay';layer.hidden=true;
      const box=el('form','bq3-search-modal');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Consulta global de animal');
      const h=el('div','bq3-search-title');h.append(el('strong',null,'Consultar animal'),el('span',null,'SISBOV atual ou anterior, brinco ou chip'));
      const inp=el('input','bq3-search-input');inp.type='search';inp.placeholder='Informe o SISBOV, brinco ou chip';inp.required=true;inp.autocomplete='off';inp.maxLength=80;
      const row=el('div','bq3-search-actions'),cancel=el('button','btn btn-outline','Cancelar'),go=el('button','btn btn-primary','Abrir ficha');cancel.type='button';go.type='submit';row.append(cancel,go);box.append(h,inp,row);layer.append(box);document.body.append(layer);
      const hide=()=>{layer.hidden=true;document.body.classList.remove('bq3-search-active');open.focus()};
      open.addEventListener('click',()=>{layer.hidden=false;document.body.classList.add('bq3-search-active');inp.focus()});
      cancel.addEventListener('click',hide);layer.addEventListener('mousedown',e=>{if(e.target===layer)hide()});
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!layer.hidden)hide();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)&&layer.hidden)return;e.preventDefault();open.click()}});
      box.addEventListener('submit',e=>{e.preventDefault();const q=asText(inp.value);if(!q)return;if(!navegar('fichaAnimal')){return;}hide();const f=byId('fichaBusca');if(f){f.value=q;byId('btnFichaBuscar')?.click()}});
    }
    function card(container,label,value,kind){const box=el('div','bq3-status-card '+(kind||''));box.append(el('span',null,label),el('strong',null,value));container.append(box)}
    function updateInitial(){const area=byId('bq3-inicial-status');if(!area||!view('mapaInicial')?.classList.contains('active'))return;
      if(typeof DB==='undefined'||!Array.isArray(DB.animais))return;
      const input=asText(byId('mapaInicialBuscaSisbov')?.value).replace(/\D/g,'');
      let lista=DB.animais.filter(a=>a.origem==='inicial');if(input)lista=lista.filter(a=>asText(a.sisbov).replace(/\D/g,'').includes(input));
      area.replaceChildren();card(area,'Animais na base',fmt(lista.length));card(area,'Fêmeas',fmt(lista.filter(a=>/^f/i.test(asText(a.sexo))).length));card(area,'Machos',fmt(lista.filter(a=>/^m/i.test(asText(a.sexo))).length));card(area,'Sem seção',fmt(lista.filter(a=>!asText(a.setorInicial)).length),'bq3-warning');
    }
    function updateFinal(){const area=byId('bq3-final-status');if(!area||!view('mapaAtual')?.classList.contains('active'))return;
      if(typeof mapaAtualCache==='undefined'||!Array.isArray(mapaAtualCache?.animais))return;
      const local=asText(byId('mapaFiltroLocal')?.value);const lista=mapaAtualCache.animais.filter(a=>a.status==='ATIVO'&&(!local||asText(a.localAtual)===local));
      area.replaceChildren();card(area,'Animais ativos',fmt(lista.length));card(area,'Fêmeas',fmt(lista.filter(a=>/^f/i.test(asText(a.sexo))).length));card(area,'Machos',fmt(lista.filter(a=>/^m/i.test(asText(a.sexo))).length));card(area,'Sem seção',fmt(lista.filter(a=>!asText(a.setorAtual)).length),'bq3-warning');card(area,'Sem local',fmt(lista.filter(a=>!asText(a.localAtual)).length),'bq3-warning');
    }
    function updateMov(){const area=byId('bq3-mov-status');if(!area||!view('movimentacoes')?.classList.contains('active'))return;
      if(typeof filtrarMovimentacoes!=='function')return;let lista;try{lista=filtrarMovimentacoes()}catch(_){return}if(!Array.isArray(lista))return;
      const tipo=m=>asText(typeof tipoOperacionalMov==='function'?tipoOperacionalMov(m):m.tipo).toLowerCase();
      const matching=re=>lista.filter(m=>re.test(tipo(m))).length;
      area.replaceChildren();card(area,'Lançamentos filtrados',fmt(lista.length));card(area,'Nascimentos',fmt(matching(/nascimento/)));card(area,'Mortes',fmt(matching(/morte|mortalidade/)));card(area,'Transferências',fmt(matching(/transfer|movimenta.*local/)));card(area,'Reidentificações',fmt(matching(/reidentifica/)));card(area,'Vendas',fmt(matching(/venda|frigor[ií]fico/)));
    }
    function refresh(){try{updateInitial();updateFinal();updateMov()}catch(e){console.warn('[Bodoquena UI v3] indicadores:',e)}}
    let refreshTimer=0;const schedule=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,90)};
    byId('mainTabs')?.addEventListener('click',schedule);
    ['mapaInicialBuscaSisbov','btnLimparBuscaInicial','mapaAtualData','mapaFiltroLocal','btnAtualizarMapa','btnHoje','btnAplicarFiltroMov','btnLimparFiltroMov'].forEach(id=>{const node=byId(id);if(node){node.addEventListener('change',schedule);node.addEventListener('click',schedule);node.addEventListener('input',schedule)}});
    [byId('mapaInicialResumo'),byId('mapaAtualResumo'),byId('movCount')].filter(Boolean).forEach(n=>new MutationObserver(schedule).observe(n,{subtree:true,childList:true,characterData:true}));
    setTimeout(refresh,250);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(ui,0),{once:true});else setTimeout(ui,0);
})();
