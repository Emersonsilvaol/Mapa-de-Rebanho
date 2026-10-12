(function (root) {
  'use strict';
  const fmt = n => Number(n).toLocaleString('pt-BR');
  const html = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function birthParts(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return null;
    const [y, mo, d] = m.slice(1).map(Number), date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? {y, mo, d} : null;
  }
  function ageOn(birth, reference) {
    const b = birthParts(birth), r = birthParts(reference);
    if (!b || !r || birth > reference) return null;
    return r.y - b.y - (r.mo < b.mo || (r.mo === b.mo && r.d < b.d) ? 1 : 0);
  }
  function project(animals, filters, baseDate) {
    const {start, end, monthDay = '12-31', section = '', minAge = 0, maxAge = 9999} = filters;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < Number(baseDate.slice(0,4)) || end < start || end - start > 20 || end > 9999 || minAge < 0 || maxAge < minAge || maxAge > 9999) throw new Error('Confira o período e o intervalo de idades (até 21 anos na mesma consulta).');
    const cohort = animals.filter(a => a.status === 'ATIVO' && a.sexo === 'Fêmea' && (!section || String(a.setorAtual||'').trim().toLocaleLowerCase('pt-BR') === section.trim().toLocaleLowerCase('pt-BR')));
    const valid = cohort.filter(a => ageOn(a.nascimento, baseDate) !== null);
    const years = Array.from({length:end - start + 1}, (_,i) => start + i), byYear = {}, ages = new Set();
    for (const year of years) {
      const date = `${year}-${monthDay}`;
      if (!birthParts(date) || date < baseDate) throw new Error('A data projetada deve ser igual ou posterior à data da base.');
      const counts = {}, selected = [], ageSum = {value:0};
      for (const animal of valid) {
        const age = ageOn(animal.nascimento, date);
        if (age < minAge || age > maxAge) continue;
        selected.push(animal); counts[age] = (counts[age] || 0) + 1; ages.add(age); ageSum.value += age;
      }
      byYear[year] = {date, counts, total:selected.length, mean:selected.length ? ageSum.value/selected.length : null};
    }
    return {cohort, valid, invalid:cohort.length-valid.length, years, byYear, ages:[...ages].sort((a,b)=>a-b), filters:{...filters,monthDay}, baseDate};
  }
  function heat(value, max) {
    if (!max || !value) return '#f0f5ef';
    const t = Math.min(1, value/max), a = t <= .5 ? [213,232,205] : [249,229,161], b = t <= .5 ? [249,229,161] : [235,171,154], v = t <= .5 ? t*2 : (t-.5)*2;
    return `rgb(${a.map((x,i)=>Math.round(x+(b[i]-x)*v)).join(',')})`;
  }
  root.BodoquenaAgeProjection = {ageOn, project, heat};
  if (typeof module !== 'undefined' && module.exports) module.exports = root.BodoquenaAgeProjection;
  if (typeof document === 'undefined') return;
  let result = null, refreshBusy = false, lastCheck = '', detailSelection = null;
  const el = id => document.getElementById(id);
  function canView() { return typeof podeAcesso === 'function' && podeAcesso('mapaAtual','ver'); }
  function visible() { return canView() && !document.hidden && el('view-projecaoIdade')?.classList.contains('active'); }
  function readFilters() {
    return {start:Number(el('piInicio').value),end:Number(el('piFim').value),monthDay:el('piData').value,section:el('piSetor').value,minAge:Number(el('piIdadeMin').value),maxAge:Number(el('piIdadeMax').value)};
  }
  function initialize() {
    const form = el('piFiltros'); if (!form || form.dataset.ready) return;
    form.dataset.ready = '1';
    const nextYear = Number(todayISO().slice(0,4));
    el('piInicio').value = nextYear; el('piFim').value = nextYear + 9;
    el('piInicio').min = el('piFim').min = Number(todayISO().slice(0,4));
    form.addEventListener('submit', event => {event.preventDefault();root.renderProjecaoIdade();});
    form.addEventListener('change', () => root.renderProjecaoIdade());
    el('piAnoGrafico').addEventListener('change', renderOutput);
    el('piModo').addEventListener('change', renderOutput);
    el('piMetrica').addEventListener('change', renderOutput);
    el('piLimpar').addEventListener('click', () => {form.reset();el('piInicio').value=nextYear;el('piFim').value=nextYear+9;root.renderProjecaoIdade();});
    el('piAtualizar').addEventListener('click', () => refresh(true));
    el('piExcel').addEventListener('click', () => exportReport('xlsx'));
    el('piPDF').addEventListener('click', () => exportReport('pdf'));
    el('piHTML').addEventListener('click', () => exportReport('html'));
    el('piApresentar').addEventListener('click',()=>{if(!canView()||!result)return;const content=standaloneHTML(true);openModal('Apresentação — evolução de idade das fêmeas',`<iframe title="Apresentação da projeção" srcdoc="${html(content)}" style="width:100%;height:75vh;border:0" allow="fullscreen"></iframe>`,[{label:'Fechar',cls:'btn-primary',onClick:closeModal}],true);});
    el('piTabela').addEventListener('click', event => {
      const cell = event.target.closest('[data-pi-age]'); if (cell) showAnimals(Number(cell.dataset.piYear),Number(cell.dataset.piAge));
    });
    el('piGrafico').addEventListener('click', event => {
      const bar = event.target.closest('[data-pi-age]'); if (bar) showAnimals(Number(bar.dataset.piYear),Number(bar.dataset.piAge));
    });
    document.addEventListener('visibilitychange', () => {if (visible()) void refresh();});
    window.addEventListener('focus', () => {if (visible()) void refresh();});
    setInterval(() => {if (visible()) void refresh();},60000);
  }
  root.limparProjecaoIdade = function () {
    result = null; detailSelection = null;
    for (const id of ['piKpis','piGrafico','piTabela','piAviso','piStatus','piDescricao','piAnoGrafico']) {if (el(id)) el(id).replaceChildren();}
    if(el('piSetor'))el('piSetor').innerHTML='<option value="">Todas as sessões / setores</option>';
  };
  root.renderProjecaoIdade = function () {
    initialize(); if (!canView()) {root.limparProjecaoIdade();return;}
    try {
      const date = todayISO();
      const map = LOCAL_DIRTY && BASE_CONFIRMADA ? calcularMapaOtimizado(BASE_CONFIRMADA,date) : buildMapaUICached(date);
      const animals = map.animais || [];
      const sections = [...new Set(animals.filter(a=>a.status==='ATIVO'&&a.sexo==='Fêmea').map(a=>(a.setorAtual||'').trim().toLocaleLowerCase('pt-BR')==='confinamento'?'Confinamento':a.setorAtual||''))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
      const previous = el('piSetor').value;
      el('piSetor').innerHTML = '<option value="">Todas as sessões / setores</option>'+sections.map(s=>`<option value="${html(s)}">${html(s)}</option>`).join('');
      if (sections.includes(previous)) el('piSetor').value = previous;
      else if (previous) {el('piAviso').textContent='A sessão selecionada não tem mais fêmeas ativas. A consulta foi alterada para todas as sessões.';}
      result = project(animals,readFilters(),date);
      const focus = Number(el('piAnoGrafico').value);
      el('piAnoGrafico').innerHTML = result.years.map(y=>`<option value="${y}">${y}</option>`).join('');
      if (result.years.includes(focus)) el('piAnoGrafico').value=focus;
      el('piErro').hidden=true;
      renderOutput();
      if (detailSelection && document.getElementById('piDetalheAnimais') && document.getElementById('modalOverlay')?.classList.contains('open')) showAnimals(detailSelection.year,detailSelection.age);
    } catch (error) {
      result=null;el('piKpis').replaceChildren();el('piTabela').replaceChildren();el('piGrafico').replaceChildren();el('piErro').textContent=error.message;el('piErro').hidden=false;
    }
  };
  function describe() {
    const f=result.filters;
    return `${f.start}–${f.end} • ${f.section||'Todas as sessões'} • ${f.minAge} a ${f.maxAge} anos • ${f.monthDay.slice(3)}/${f.monthDay.slice(0,2)} de cada ano`;
  }
  function renderOutput() {
    if (!result || !canView()) return;
    const year=Number(el('piAnoGrafico').value), focused=result.byYear[year], peak=Object.entries(focused.counts).sort((a,b)=>b[1]-a[1])[0];
    el('piKpis').innerHTML = [
      ['Fêmeas da base selecionada',fmt(result.cohort.length),'Ativas no mapa final de hoje'],
      [`No recorte de ${year}`,fmt(focused.total),`${result.filters.minAge} a ${result.filters.maxAge} anos completos`],
      [`Idade média em ${year}`,focused.mean===null?'—':focused.mean.toLocaleString('pt-BR',{maximumFractionDigits:2})+' anos','Média das idades completas no recorte'],
      [`Maior grupo em ${year}`,peak?fmt(peak[1])+' fêmeas':'—',peak?`${peak[0]} ${Number(peak[0])===1?'ano':'anos'} • ${(peak[1]/focused.total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`:'Sem animais nessa consulta']
    ].map(([label,value,note])=>`<article class="pi-kpi"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(note)}</small></article>`).join('');
    el('piDescricao').textContent=describe();
    const update=DB.config?._centralUpdatedAt;
    el('piStatus').textContent=(LOCAL_DIRTY?'Base confirmada • há alterações locais aguardando salvamento. ':'Atualização automática a cada minuto enquanto esta tela estiver aberta. ')+(update?'Base salva em '+new Date(update).toLocaleString('pt-BR')+'. ':'')+(lastCheck?'Conferida às '+lastCheck+'.':'');
    el('piAviso').textContent=result.invalid?`${fmt(result.invalid)} fêmea(s) sem nascimento válido ou com nascimento posterior à base foram excluídas da projeção. Corrija o cadastro para incluí-las.`:'';
    el('piAviso').hidden=!result.invalid;
    const mode=el('piModo').value;
    el('piGraficoPanel').hidden=mode!=='both';el('piTabelaPanel').classList.toggle('pi-wide',mode!=='both');el('piConteudo').classList.toggle('pi-single',mode!=='both');
    const percent=el('piMetrica').value==='percent', max=Math.max(0,...result.years.flatMap(y=>Object.values(result.byYear[y].counts)));
    const valueText=(count,total)=>percent?(total?(count/total*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'):fmt(count);
    el('piGraficoTitulo').textContent=`Quantidade por idade em ${year}`;
    const focusedAges=result.ages.filter(a=>focused.counts[a]);
    const chartMax=Math.max(1,...Object.values(focused.counts));
    el('piGrafico').innerHTML=focusedAges.length?`<div class="pi-bars" style="--pi-bars:${focusedAges.length}">${focusedAges.map(age=>{const n=focused.counts[age];return `<button type="button" class="pi-bar" data-pi-age="${age}" data-pi-year="${year}" aria-label="${fmt(n)} fêmeas com ${age} anos em ${year}. Abrir animais."><span class="pi-bar-value">${valueText(n,focused.total)}</span><span class="pi-bar-track"><i style="height:${Math.max(1,n/chartMax*100)}%"></i></span><span>${age}</span></button>`;}).join('')}</div><p class="pi-chart-caption">Idade completa em anos • toque em uma barra para consultar os animais.</p>`:'<p class="pi-empty">Nenhuma fêmea com os filtros selecionados.</p>';
    const allTotals=result.years.map(y=>result.byYear[y].total), totalMax=Math.max(1,...allTotals);
    const cellColor=(n,y)=>mode==='table'?'transparent':heat(percent?(result.byYear[y].total?n/result.byYear[y].total:0):n,percent?Math.max(0,...result.years.flatMap(year=>Object.values(result.byYear[year].counts).map(v=>result.byYear[year].total?v/result.byYear[year].total:0))):max);
    el('piTabela').innerHTML=`<table class="pi-matrix"><caption>Fêmeas por idade e ano • ${percent?'participação no recorte de cada ano':'cabeças'}</caption><thead><tr><th scope="col">Idade</th>${result.years.map(y=>`<th scope="col">${y}</th>`).join('')}</tr></thead><tbody>${result.ages.map(age=>`<tr><th scope="row">${age} ${age===1?'ano':'anos'}</th>${result.years.map(y=>{const n=result.byYear[y].counts[age]||0;return `<td style="background:${cellColor(n,y)}">${n?`<button type="button" data-pi-age="${age}" data-pi-year="${y}" aria-label="${fmt(n)} fêmeas com ${age} anos em ${y}. Abrir animais.">${valueText(n,result.byYear[y].total)}</button>`:percent?'—':'0'}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${result.years.length+1}" class="pi-empty">Nenhuma fêmea com os filtros selecionados.</td></tr>`}</tbody><tfoot><tr><th scope="row">Total de fêmeas</th>${result.years.map(y=>`<td style="background:${mode==='table'?'transparent':heat(result.byYear[y].total,totalMax)}">${fmt(result.byYear[y].total)}</td>`).join('')}</tr><tr><th scope="row">Idade média</th>${result.years.map(y=>`<td>${result.byYear[y].mean===null?'—':result.byYear[y].mean.toLocaleString('pt-BR',{maximumFractionDigits:2})}</td>`).join('')}</tr></tfoot></table>`;
    el('piExcel').hidden=el('piPDF').hidden=el('piHTML').hidden=!podeAcesso('mapaAtual','exportar');
  }
  function selectedAnimals(year,age) {return result.valid.filter(a=>ageOn(a.nascimento,result.byYear[year].date)===age);}
  function showAnimals(year,age) {
    if (!result || !canView() || !result.byYear[year]) return;
    detailSelection={year,age};const animals=selectedAnimals(year,age);
    openModal(`${fmt(animals.length)} fêmeas • ${age} anos em ${year}`,`<div id="piDetalheAnimais"><p>Idade em ${formatBR(result.byYear[year].date)} • base atual, sem estimativa de saídas futuras.</p><div class="table-wrap"><table class="exec"><thead><tr><th>SISBOV</th><th>Brinco</th><th>Sessão / setor</th><th>Nascimento</th><th>Idade projetada</th></tr></thead><tbody>${animals.map(a=>`<tr><td>${html(a.sisbov||'Sem SISBOV')}</td><td>${html(a.brinco||'—')}</td><td>${html(a.setorAtual||'Não informado')}</td><td>${html(formatBR(a.nascimento))}</td><td>${age} anos</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma fêmea permanece neste grupo.</td></tr>'}</tbody></table></div></div>`,[{label:'Fechar',cls:'btn-primary',onClick:closeModal}],true);
  }
  async function refresh(manual=false) {
    if (!visible() || refreshBusy || !navigator.onLine) return;
    if (LOCAL_DIRTY || _syncEmAndamento || CONFLITO_CENTRAL) {if(manual)toast('Salve ou resolva as alterações locais antes de atualizar a base.','err');root.renderProjecaoIdade();return;}
    refreshBusy=true;el('piAtualizar').disabled=true;
    const generation=DB_GENERATION,epoch=ACESSO_EPOCH;
    try {
      const data=await buscarBaseAutorizada(todayISO());
      if (epoch!==ACESSO_EPOCH || !canView()) {root.limparProjecaoIdade();return;}
      if (LOCAL_DIRTY || generation!==DB_GENERATION || _syncEmAndamento) return;
      if (!aplicarBaseCentralRecebida(data)) throw new Error('A base autorizada não está disponível.');
      lastCheck=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      if(visible()){renderHeaderCounters();root.renderProjecaoIdade();}
    } catch (error) {
      if (!canView()) root.limparProjecaoIdade();
      else {el('piStatus').textContent='Não foi possível atualizar agora. Exibindo a última base recebida; uma nova tentativa ocorrerá em até um minuto.';if(manual)toast(error.message,'err');}
    } finally {refreshBusy=false;if(el('piAtualizar'))el('piAtualizar').disabled=false;}
  }
  root.atualizarProjecaoIdade = refresh;
  function standaloneHTML(presentation=false) {
    const date=todayISO(),map=LOCAL_DIRTY&&BASE_CONFIRMADA?calcularMapaOtimizado(BASE_CONFIRMADA,date):buildMapaUICached(date);
    const animals=(map.animais||[]).filter(a=>a.status==='ATIVO'&&a.sexo==='Fêmea'&&ageOn(a.nascimento,date)!==null);
    const data={};
    for(const a of animals){let sector=(a.setorAtual||'Sem setor').trim();if(sector.toLocaleLowerCase('pt-BR')==='confinamento')sector='Confinamento';const c=data[sector]||(data[sector]={});c[a.nascimento]=(c[a.nascimento]||0)+1;}
    return root.BodoquenaAgeReportHTML(data,{...result.filters,focus:Number(el('piAnoGrafico').value),baseDate:date,presentation,updatedAt:DB.config?._centralUpdatedAt||''});
  }
  async function exportReport(format) {
    if (!result || !canView() || !await autorizarExportacao('mapaAtual',format)) return;
    root.renderProjecaoIdade();if(!result||!canView()||(format==='xlsx'&&!garantirBibliotecaExportacao(format)))return;
    if(format==='pdf'){
      const frame=document.createElement('iframe');frame.title='Relatório para impressão';frame.style.cssText='position:fixed;width:0;height:0;border:0;';
      frame.onload=()=>{frame.contentWindow.addEventListener('afterprint',()=>frame.remove(),{once:true});setTimeout(()=>{frame.contentWindow.focus();frame.contentWindow.print();},150);};
      frame.srcdoc=standaloneHTML();document.body.appendChild(frame);return;
    }
    if(format==='html'){
      const url=URL.createObjectURL(new Blob([standaloneHTML()],{type:'text/html;charset=utf-8'})),a=document.createElement('a');
      a.href=url;a.download=`evolucao-idade-femeas-${result.filters.start}-${result.filters.end}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Relatório HTML exportado.','ok');return;
    }
    const note='Projeção das fêmeas atualmente ativas. Sem novos nascimentos, compras, mortes, vendas ou descarte futuros.';
    const rows=result.ages.map(age=>[age,...result.years.map(y=>result.byYear[y].counts[age]||0)]);
    const totals=['Total de fêmeas',...result.years.map(y=>result.byYear[y].total)],means=['Idade média (anos completos)',...result.years.map(y=>result.byYear[y].mean===null?'':Number(result.byYear[y].mean.toFixed(2)))];
    const heading=['Idade (anos completos)',...result.years];
    if(format==='xlsx') {
      const wb=XLSX.utils.book_new(),summary=XLSX.utils.aoa_to_sheet([['Projeção de idade — Fêmeas'],[describe()],[note],['Data da base',result.baseDate],['Base salva em',DB.config?._centralUpdatedAt||''],['Nascimentos inválidos excluídos',result.invalid],[],heading,...rows,totals,means]);
      summary['!cols']=[{wch:30},...result.years.map(()=>({wch:15}))];
      const max=Math.max(1,...rows.flatMap(r=>r.slice(1))),maxTotal=Math.max(1,...totals.slice(1));
      rows.concat([totals]).forEach((row,i)=>row.slice(1).forEach((n,j)=>{const cell=summary[XLSX.utils.encode_cell({r:8+i,c:j+1})];if(!cell)return;const rgb=heat(n,i===rows.length?maxTotal:max);const match=/rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);const color=match?match.slice(1).map(v=>Number(v).toString(16).padStart(2,'0')).join('').toUpperCase():'F0F5EF';cell.s={fill:{fgColor:{rgb:color}},font:{color:{rgb:'233E35'},bold:i===rows.length},alignment:{horizontal:'right'}};}));
      XLSX.utils.book_append_sheet(wb,summary,'Projecao por idade');
      const percentages=XLSX.utils.aoa_to_sheet([['Participação de cada idade no recorte de cada ano'],[describe()],[note],[],heading,...rows.map(row=>[row[0],...result.years.map((y,i)=>result.byYear[y].total?row[i+1]/result.byYear[y].total:0)])]);
      rows.forEach((row,i)=>result.years.forEach((y,j)=>{const cell=percentages[XLSX.utils.encode_cell({r:5+i,c:j+1})];if(cell)cell.z='0.0%';}));percentages['!cols']=summary['!cols'];XLSX.utils.book_append_sheet(wb,percentages,'Percentual por idade');
      const details=result.valid.filter(a=>result.years.some(y=>{const age=ageOn(a.nascimento,result.byYear[y].date);return age>=result.filters.minAge&&age<=result.filters.maxAge;})).map(a=>({'SISBOV':a.sisbov||'','Brinco':a.brinco||'','Sessão / setor':a.setorAtual||'','Nascimento':a.nascimento,...Object.fromEntries(result.years.map(y=>['Idade em '+formatBR(result.byYear[y].date),ageOn(a.nascimento,result.byYear[y].date)]))}));
      const sheet=XLSX.utils.json_to_sheet(details);sheet['!cols']=[{wch:21},{wch:15},{wch:22},{wch:15},...result.years.map(()=>({wch:23}))];XLSX.utils.book_append_sheet(wb,sheet,'Femeas da base');
      XLSX.writeFile(wb,`projecao-idade-femeas-${result.filters.start}-${result.filters.end}.xlsx`);toast('Relatório Excel exportado.','ok');
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
