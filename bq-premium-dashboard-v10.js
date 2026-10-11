/* Fazenda Bodoquena · Painel Executivo Premium
 * Somente apresentação. Consome o contexto nativo (contextoDashboard).
 * Nenhum acesso a Supabase para escrita; nenhum cálculo é armazenado no banco.
 */
(() => {
  'use strict';
  const root = document.getElementById('view-dashboard');
  const kpis = document.getElementById('dashKpis');
  if (!root || !kpis) return;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const fmt = n => Number(n || 0).toLocaleString('pt-BR');
  const num = n => Number(n || 0);
  const pct = n => Number.isFinite(n) ? n.toFixed(1).replace('.', ',') + '%' : '—';
  const norm = n => String(n ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const safeText = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = {
    initial: '<path d="M12 2 3 7l9 5 9-5-9-5Zm-9 9 9 5 9-5M3 15l9 5 9-5"/>',
    in: '<path d="M12 5v14M5 12h14"/>',
    out: '<path d="M5 12h14"/>',
    variation: '<path d="M4 20V11m5 9V5m5 15v-7m5 7V3"/>',
    current: '<path d="M3 9h18l-2 7h-2v4h-2v-4H9v4H7v-4H5zM6 9V6m12 3V6M3 7l3-2m15 2-3-2"/>',
    up: '<path d="m5 15 6-6 4 4 5-7m-5 0h5v5"/>',
    down: '<path d="m5 8 6 6 4-4 5 7m-5 0h5v-5"/>'
  };
  const svg = type => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon[type] || icon.current}</svg>`;
  let officialBaseline = null; // carregada da base de abertura publicada, sem escrita na nuvem.
  const sum = (items, fn) => items.filter(fn).reduce((s, x) => s + (Number(x.quantidade) || 1), 0);
  const iso = d => d.toISOString().slice(0, 10);
  const shiftDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const periodDays = (a,b) => Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z')) / 86400000) + 1;
  const previous = ctx => {
    const {ini, fim} = ctx.f;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini || '') || !/^\d{4}-\d{2}-\d{2}$/.test(fim || '')) return null;
    const span = periodDays(ini, fim);
    if (span < 1 || span > 3660) return null;
    const before = shiftDays(ini, -1), prevIni = shiftDays(ini, -span);
    if (typeof DB !== 'undefined' && DB?.config?.dataMapaInicial && prevIni < DB.config.dataMapaInicial) return null;
    return contextoDashboard({...ctx.f, ini: prevIni, fim: before});
  };
  const compare = (current, previousValue, available, decreaseIsBad=false) => {
    if (!available || !previousValue) return {html:'<span class="bq-premium-nocompare">Sem base comparável</span>', delta:null};
    const change = (current - previousValue) / previousValue * 100;
    const down = change < 0, color = decreaseIsBad ? (down ? 'bad' : 'good') : (down ? 'bad' : 'good');
    return {html:`<span class="bq-premium-change ${color}">${down?'↘':'↗'} &nbsp;${change>=0?'+':''}${pct(change)}<small>vs período anterior</small></span>`,delta:change};
  };
  const monthOf = isoDate => isoDate.slice(0,7);
  const getMonths = (ctx, cap = 10) => {
    const base = typeof DB !== 'undefined' && DB.config ? DB.config.dataMapaInicial : '';
    const first = (ctx.f.ini && ctx.f.ini > base) ? ctx.f.ini : base;
    const end = ctx.f.fim || ctx.fim;
    if (!/^\d{4}-\d{2}/.test(first || '') || !/^\d{4}-\d{2}/.test(end || '')) return [monthOf(end)];
    let y = Number(first.slice(0,4)), m = Number(first.slice(5,7));
    const endIndex = Number(end.slice(0,4))*12 + Number(end.slice(5,7))-1;
    let startIndex = Math.max(y*12+m-1, endIndex-cap+1);
    const keys=[];
    while (startIndex <= endIndex) { keys.push(`${Math.floor(startIndex/12)}-${String(startIndex%12+1).padStart(2,'0')}`); startIndex++; }
    return keys.length ? keys : [monthOf(end)];
  };
  const series = (ctx, months) => {
    const movs = ctx.movs;
    return months.map(k => {
      const m = movs.filter(x => String(x.data || '').startsWith(k));
      const [year, month] = k.split('-').map(Number);
      const lastDay = iso(new Date(Date.UTC(year, month, 0)));
      const ref = lastDay > ctx.f.fim ? ctx.f.fim : lastDay;
      const saldo = ctx.mapa(ref).length;
      return {label:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][month-1], ref, saldo, entradas:sum(m,ctx.entra),saidas:sum(m,ctx.sai)};
    });
  };
  // Mini-gráficos removidos definitivamente dos cartões, preservando o gráfico analítico.
  const spark = () => '';
  const displayMonths = data => data.map(d => d.label+' '+d.ref.slice(0,4));
  const card = ({type,title,value,caption,body}) => `<article class="kpi-card bq-premium-kpi bq-premium-${type}"><div class="bq-premium-head"><span class="kpi-icon">${svg(type)}</span><span class="kpi-lbl">${title}</span></div><button type="button" class="kpi-val bq-premium-value" data-dash-detalhe="${type}" aria-label="Consultar ${title.toLowerCase()}: ${safeText(value)} cabeças">${safeText(value)}</button><span class="bq-premium-unit">${caption || 'cabeças'}</span><div class="bq-premium-divider"></div><div class="bq-premium-card-body">${body || ''}</div></article>`;
  const detail = (mode,value,label) => `<div class="bq-premium-breakdown-item"><small>${safeText(label)}</small><button class="bq-premium-inline" type="button" data-dash-detalhe="${mode}">${safeText(value)}</button></div>`;
  const buildChart = (rows,mode) => {
    const column = mode === 'saldo' ? 'saldo' : mode === 'entradas' ? 'entradas' : 'saidas';
    const values = rows.map(x=>x[column]);
    if (!values.length) return '<p class="bq-premium-empty">Não há dados para o período.</p>';
    const min = mode==='saldo' ? Math.max(0,Math.min(...values)-Math.max(5,(Math.max(...values)-Math.min(...values))*.25)) : 0;
    const max = Math.max(1,Math.max(...values)+(mode==='saldo'?Math.max(5,(Math.max(...values)-Math.min(...values))*.25):Math.max(1,Math.max(...values)*.18)));
    const range=Math.max(1,max-min),y=v=>184-(v-min)/range*142;
    const x=i=>68+i*690/Math.max(1,rows.length-1);
    const ticks=[0,1,2,3,4].map(i=>{const yy=42+i*142/4;const v=max-i*range/4;return `<line x1="66" y1="${yy}" x2="774" y2="${yy}" stroke="var(--line,#dfe7df)" stroke-width="1"/><text x="54" y="${yy+4}" text-anchor="end" class="axis">${fmt(Math.round(v))}</text>`}).join('');
    const points=rows.map((row,i)=>`${x(i)},${y(row[column])}`);
    const d=points.map((p,i)=>(i?'L':'M')+p).join(' ');
    const bars=rows.map((row,i)=>{const baseline = mode==='saldo'?184:y(0); const barVal = mode==='saldo' ? row.entradas + row.saidas : row[column]; const upper = mode==='saldo' ? Math.min(38,barVal/Math.max(1,...rows.map(r=>r.entradas+r.saidas))*32) : 184-y(barVal);return `<rect x="${x(i)-10}" y="${baseline-upper}" width="20" height="${Math.max(1,upper)}" rx="3" fill="var(--bq-chart-soft,#cde5d4)"/>`}).join('');
    const line=`<path d="${d}" fill="none" stroke="var(--bq-chart,#126641)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    const dots=rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r[column])}" r="4" fill="var(--bq-chart,#126641)"><title>${safeText(r.label)} ${safeText(r.ref.slice(0,4))}: ${fmt(r[column])} cabeças</title></circle>`).join('');
    const labels=rows.map((r,i)=>`<text class="axis" x="${x(i)}" y="214" text-anchor="middle">${safeText(r.label)}</text>`).join('');
    return `<div class="bq-premium-chart-top"><span>${mode==='saldo'?'Saldo ativo por fechamento mensal':mode==='entradas'?'Entradas registradas por mês':'Saídas registradas por mês'}</span><b>${fmt(values[values.length-1])} <small>cabeças</small></b></div><svg class="bq-premium-chart" viewBox="0 0 820 232" role="img" aria-label="${mode==='saldo'?'Evolução do rebanho':mode==='entradas'?'Entradas mensais':'Saídas mensais'}: valores reais até ${safeText(rows[rows.length-1].ref)}">${ticks}${bars}${line}${dots}${labels}</svg><div class="bq-premium-chart-legend"><span><i></i>${mode==='saldo'?'Saldo de animais':mode==='entradas'?'Entradas':'Saídas'}</span><span><i class="soft"></i>Volume mensal</span></div>`;
  };
  const reorder = () => {
    const overview = $('.dashboard-overview',root), activity = $('.dashboard-activity',root), support = $('.dashboard-support',root);
    const evolution = $('#dashEvolution')?.closest('.panel');
    const composition = $('#dashSex')?.closest('.panel');
    const sections = $('#dashSections')?.closest('.panel');
    if (!overview || !activity || !support || !evolution || !composition || !sections) return;
    if (overview.contains(evolution)) return;
    overview.prepend(evolution);
    support.prepend(sections);
    const ageTable = $('#dashSexCat');
    if (ageTable && !ageTable.closest('details')) {
      const det=document.createElement('details');det.className='bq-premium-ages';
      const summary=document.createElement('summary');summary.textContent='Ver composição por faixa etária';
      ageTable.before(det);det.append(summary,ageTable);
    }
    const h=$('.panel-head h3',evolution);if(h) h.textContent='Evolução do rebanho';
    const title=$('.panel-head h3',composition);if(title)title.textContent='Composição do rebanho (saldo atual)';
    if (!$('#bqPremiumBelow')){
      const below = document.createElement('div');below.id='bqPremiumBelow';
      overview.after(below);
    }
    root.classList.add('bq-premium-dashboard');
  };
  const composition = (ctx) => {
    const total=ctx.ativos.length;
    const f=ctx.ativos.filter(a=>norm(a.sexo).startsWith('f')).length;
    const m=ctx.ativos.filter(a=>norm(a.sexo).startsWith('m')).length;
    const other=total-f-m;
    const defined=ctx.ativos.filter(a=>String(a.loteAtual || a.lote || '').trim()!=='').length;
    const undefinedLots=total-defined;
    const ratio=n=>total?n/total*100:0;
    $('#dashSex').innerHTML=`<div class="bq-premium-composition"><div class="bq-premium-donut-wrap"><div class="bq-premium-donut" style="--bq-f:${ratio(f)}%;--bq-m:${ratio(f+m)}%" role="img" aria-label="Fêmeas: ${fmt(f)}, machos: ${fmt(m)}, sexo não informado: ${fmt(other)}"><div class="bq-premium-donut-center"><b>${fmt(total)}</b><span>cabeças</span></div></div></div><div class="bq-premium-composition-stats"><div class="bq-premium-composition-row"><i class="female"></i><span>Fêmeas</span><button class="bq-premium-inline" type="button" data-dash-detalhe="current">${fmt(f)}</button><small>${pct(ratio(f))}</small></div><div class="bq-premium-composition-row"><i class="male"></i><span>Machos</span><button class="bq-premium-inline" type="button" data-dash-detalhe="current">${fmt(m)}</button><small>${pct(ratio(m))}</small></div>${other?`<div class="bq-premium-composition-row"><i class="unknown"></i><span>Sexo não informado</span><b>${fmt(other)}</b><small>${pct(ratio(other))}</small></div>`:''}<div class="bq-premium-composition-sep"></div><div class="bq-premium-composition-row"><i class="good"></i><span>Com lote definido</span><b>${fmt(defined)}</b><small>${pct(ratio(defined))}</small></div><div class="bq-premium-composition-row"><i class="pending"></i><span>Sem lote definido</span><b>${fmt(undefinedLots)}</b><small>${pct(ratio(undefinedLots))}</small></div></div></div>`;
    // The native detail modal knows how to filter by sex for the distinct donut rows.
    $$('.bq-premium-composition-row button[data-dash-detalhe="current"]',root).forEach((button,i)=>{button.dataset.sexo=i===0?'Fêmea':'Macho';});
    return {defined,undefinedLots};
  };
  const $$=(sel,p=document)=>Array.from(p.querySelectorAll(sel));
  const bottom = (ctx,values) => {
    const el = $('#bqPremiumBelow');if(!el)return;
    const {inicial,entradas,saidas,delta,atual,nasc,compras,transf,vendas,mortes}=values;
    const inPct = n=>entradas?pct(n/entradas*100):'—';
    const outPct = n=>saidas?pct(n/saidas*100):'—';
    const entries=[['in','Entradas',entradas,''],['out','Saídas',saidas,''],['variation','Variação',delta,(inicial?pct(delta/inicial*100):'—')],['current','Saldo atual',atual,'cabeças']];
    const details=[['birth','Nascimentos',nasc,inPct(nasc)+' das entradas'],['purchase','Compras',compras,inPct(compras)+' das entradas'],['transfer','Transferências',transf,'Movimentos internos'],['sale','Vendas',vendas,outPct(vendas)+' das saídas'],['death','Mortes',mortes,outPct(mortes)+' das saídas']];
    const deltaFlow=entradas-saidas;
    const mismatch=deltaFlow!==delta;
    el.innerHTML=`<div class="bq-premium-bottom-grid"><section class="panel bq-premium-bottom"><div class="bq-premium-bottom-head"><h3>Movimentações do período</h3></div><div class="bq-premium-bottom-data">${entries.map(([type,title,v,sub])=>`<div class="bq-premium-mini"><span class="bq-premium-mini-ico">${svg(type)}</span><button type="button" data-dash-detalhe="${type}" class="bq-premium-mini-value">${v>0 && type==='variation'?'+':''}${fmt(v)}</button><span>${title}</span><small>${sub || 'cabeças'}</small></div>`).join('')}</div></section><section class="panel bq-premium-bottom"><div class="bq-premium-bottom-head"><h3>Principais indicadores</h3></div><div class="bq-premium-bottom-data indicators">${details.map(([type,title,v,sub])=>`<div class="bq-premium-mini"><button type="button" data-dash-detalhe="${type}" class="bq-premium-mini-value">${fmt(v)}</button><span>${title}</span><small>${sub}</small></div>`).join('')}</div></section></div>${mismatch?`<div class="bq-premium-reconciliation" role="status"><strong>Conciliação necessária:</strong> a variação do mapa (${fmt(delta)}) difere da diferença entre entradas e saídas (${fmt(deltaFlow)}). Verifique os lançamentos e a base inicial; nenhum ajuste foi feito automaticamente.</div>`:''}`;
  };
  let activeMode = 'saldo', renderLock=false;
  const render = (force = false) => {
    if (renderLock || !$('#dashKpis') || typeof contextoDashboard !== 'function') return;
    root.classList.add('bq-premium-dashboard','bq-approved-reference-cards');
    // Native renderer clears children whenever date/sector/sex filters are applied.
    if (!force && kpis.firstElementChild?.classList.contains('bq-premium-kpi')) return;
    renderLock=true;
    try {
      const ctx=contextoDashboard();
      if (!ctx?.ativos || !ctx?.abertura) return;
      reorder();
      root.querySelector('.bq3-shortcuts')?.remove();
      const entradas=sum(ctx.movs,ctx.entra),saidas=sum(ctx.movs,ctx.sai);
      const nasc=sum(ctx.movs,ctx.isNasc),compras=sum(ctx.movs,ctx.isCompra),mortes=sum(ctx.movs,ctx.isMorte),vendas=sum(ctx.movs,ctx.isVenda),transf=sum(ctx.movs,ctx.isTransf);
      // O saldo inicial da fazenda vem da base oficial de abertura (11/09/2026).
      // O estado operacional pode conter reidentificações e divergências de SISBOV:
      // nunca inserir ou excluir animais na nuvem para ajustar o cartão.
      const useOfficial=!!(officialBaseline && typeof DB !== 'undefined'
        && String(DB.config?.dataMapaInicial||'')===officialBaseline.date
        && !ctx.f.setor && !ctx.f.sexo
        && (!ctx.f.ini || ctx.f.ini<=officialBaseline.date));
      const inicial=useOfficial?officialBaseline.count:ctx.abertura.length;
      const atual=ctx.ativos.length, delta=atual-inicial;
      const femI=useOfficial?officialBaseline.female:ctx.abertura.filter(a=>norm(a.sexo).startsWith('f')).length;
      const machI=useOfficial?officialBaseline.male:ctx.abertura.filter(a=>norm(a.sexo).startsWith('m')).length;
      const ages=getMonths(ctx);const chartRows=series(ctx,ages);
      const prev=previous(ctx);
      const cmpIn=compare(entradas,prev?sum(prev.movs,prev.entra):0,!!prev);
      const cmpOut=compare(saidas,prev?sum(prev.movs,prev.sai):0,!!prev);
      const hasLot=ctx.ativos.filter(a=>String(a.loteAtual||a.lote||'').trim()).length;
      const noLot=atual-hasLot;
      const pctDelta=inicial?delta/inicial*100:NaN;
      const balances=chartRows.map(v=>v.saldo),ins=chartRows.map(v=>v.entradas),outs=chartRows.map(v=>v.saidas);
      const stats={inicial,entradas,saidas,delta,atual,nasc,compras,transf,vendas,mortes};
      kpis.innerHTML=[
        card({type:'initial',title:'SALDO INICIAL',value:fmt(inicial),body:`<p>Base de abertura do período</p><p>Fêmeas <b>${fmt(femI)}</b> <span class="sep">·</span> Machos <b>${fmt(machI)}</b></p>`,trend:spark(balances)}),
        card({type:'in',title:'ENTRADAS',value:fmt(entradas),body:`<div class="bq-premium-breakdown">${detail('birth',fmt(nasc),'Nascimentos')}${detail('purchase',fmt(compras),'Compras')}${detail('transfer',fmt(transf),'Transf. internas')}</div>`,foot:cmpIn.html,trend:spark(ins)}),
        card({type:'out',title:'SAÍDAS',value:fmt(saidas),body:`<div class="bq-premium-breakdown bq-premium-two">${detail('sale',fmt(vendas),'Vendas')}${detail('death',fmt(mortes),'Mortes')}</div>`,foot:cmpOut.html,trend:spark(outs,'red')}),
        card({type:'variation',title:'VARIAÇÃO',value:(delta>0?'+':'')+fmt(delta),body:`<p class="bq-premium-delta">${Number.isFinite(pctDelta)?pct(pctDelta):'—'} <span>em relação ao saldo inicial</span></p><p class="bq-premium-explain">Diferença entre os dois saldos no período</p>`,trend:spark(balances,'neutral')}),
        card({type:'current',title:'SALDO ATUAL',value:fmt(atual),caption:'cabeças ativas',body:`<p><strong>${fmt(hasLot)}</strong> com lote definido</p><p><strong>${fmt(noLot)}</strong> sem lote definido</p>`,foot:`<span class="bq-premium-status"><i></i>${noLot?'Conferir lotes pendentes':'Posição com lotes definidos'}</span>`,trend:spark(balances,'light')})
      ].join('');
      const evolutionPanel=$('#dashEvolution')?.closest('.panel');
      if (evolutionPanel) {
        const head=$('.panel-head',evolutionPanel);
        if (head&&!$('#bqPremiumSwitch')){
          const toggle=document.createElement('div');toggle.id='bqPremiumSwitch';toggle.className='bq-premium-toggle';
          toggle.innerHTML='<button type="button" data-bq-chart="saldo">Saldo</button><button type="button" data-bq-chart="entradas">Entradas</button><button type="button" data-bq-chart="saidas">Saídas</button>';
          head.append(toggle);
        }
        const output=$('#dashEvolution');if(output)output.innerHTML=buildChart(chartRows,activeMode);
        $$('#bqPremiumSwitch button').forEach(b=>{b.classList.toggle('active',b.dataset.bqChart===activeMode);b.setAttribute('aria-pressed',String(b.dataset.bqChart===activeMode));});
      }
      composition(ctx);
      bottom(ctx,stats);
      kpis.dataset.bqPremiumLast=String(Date.now());
    } catch(e) {
      console.error('[Bodoquena premium] Painel preservado; falha na camada visual:',e);
    } finally { renderLock=false; }
  };
  root.addEventListener('click', e=>{
    const b=e.target.closest('button[data-bq-chart]');if(!b)return;
    activeMode=b.dataset.bqChart;
    try { const ctx=contextoDashboard();const rows=series(ctx,getMonths(ctx));$('#dashEvolution').innerHTML=buildChart(rows,activeMode);$$('#bqPremiumSwitch button').forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-pressed',String(n===b));}); }catch(err){console.error(err);}
  });
  // Confere a abertura contra a publicação canônica, independente do estado operacional.
  // Só substitui o saldo em visualização integral da fazenda e da data inicial correta.
  fetch('/dados/rebanho.json',{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('Base oficial indisponível');return r.json()})
    .then(data=>{
      if(!Array.isArray(data.inicial)||!data.dataInicial)throw new Error('Base oficial inválida');
      const count=data.inicial.length;
      if(count!==Number(data.totais?.inicial))throw new Error('Contagem oficial não confere');
      const female=data.inicial.filter(a=>norm(a[2]).startsWith('f')).length;
      const male=data.inicial.filter(a=>norm(a[2]).startsWith('m')).length;
      if(female+male!==count)throw new Error('Composição da base oficial inconsistente');
      officialBaseline={date:String(data.dataInicial),count,female,male};
      if(kpis.firstElementChild?.classList.contains('bq-premium-kpi')) render(true);
    })
    .catch(e=>console.warn('[Bodoquena] Abertura oficial não carregada; saldo operacional exibido para conferência:',e));
  const watch=new MutationObserver(() => { if(!kpis.firstElementChild?.classList.contains('bq-premium-kpi')) queueMicrotask(render); });
  watch.observe(kpis,{childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(render,200),{once:true});
  else setTimeout(render,50);
})();
