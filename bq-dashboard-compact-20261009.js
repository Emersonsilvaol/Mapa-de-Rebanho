/* Dashboard compacto da Fazenda Bodoquena. Não altera dados nem regras de autorização. */
(() => {
 'use strict';
 const form=document.getElementById('dashFilterForm');
 const view=document.getElementById('view-dashboard');
 if(!form||!view||document.getElementById('bqDashCompact'))return;
 const $=(s,p=document)=>p.querySelector(s);
 const safe=(v)=>String(v||'').replace(/\s+/g,' ').trim();
 const isMobile=()=>window.matchMedia('(max-width: 700px)').matches;
 const bar=document.createElement('section');
 bar.id='bqDashCompact';
 bar.setAttribute('aria-label','Resumo e filtros do dashboard');
 bar.innerHTML='<div class="bq-dash-overview"><div class="bq-dash-overview-main"><span class="bq-dash-eyebrow">VISUALIZAÇÃO ATUAL</span><strong id="bqDashPeriod">Base inicial → hoje</strong><span id="bqDashScope">Todas as seções · Todos os sexos</span></div><span id="bqDashApplied" class="bq-dash-applied" hidden></span></div><div class="bq-dash-actions"><button type="button" class="bq-dash-btn bq-dash-filter-button" id="bqDashOpen" aria-controls="bqDashPanel" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4M8 4v4m8 2v4"/></svg>Filtros</button><div class="bq-dash-export-wrap"><button type="button" class="bq-dash-btn bq-dash-export-button" id="bqDashExport" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>Exportar <span aria-hidden="true">⌄</span></button><div class="bq-dash-export-menu" id="bqDashExportMenu" hidden><button type="button" data-export-type="pdf">Exportar PDF</button><button type="button" data-export-type="xlsx">Exportar Excel</button></div></div></div>';
 const panel=document.createElement('section');
 panel.id='bqDashPanel';panel.hidden=true;panel.setAttribute('aria-label','Filtros do rebanho');
 panel.innerHTML='<header class="bq-dash-panel-head"><div><b>Filtrar o rebanho</b><small>Período, seção e sexo</small></div><button type="button" id="bqDashClose" aria-label="Fechar filtros">×</button></header>';
 form.parentNode.insertBefore(bar,form);
 form.parentNode.insertBefore(panel,form);
 panel.append(form);
 const veil=document.createElement('div');veil.id='bqDashVeil';veil.hidden=true;view.append(veil);
 const trigger=$('#bqDashOpen'),exportToggle=$('#bqDashExport'),menu=$('#bqDashExportMenu');
 const pdf=form.querySelector('[data-dash-export="pdf"]'),excel=form.querySelector('[data-dash-export="xlsx"]');
 let prevFocus=null, pending=false;
 function two(n){return String(n).padStart(2,'0')}
 function dateBR(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?m[3]+'/'+m[2]+'/'+m[1]:''}
 function currentText(){const f=$('#dashFim')?.value;return f?dateBR(f):new Date().toLocaleDateString('pt-BR')}
 function updateSummary(){
   const ini=$('#dashIni')?.value, fim=currentText(),setor=$('#dashSecao')?.selectedOptions?.[0]?.textContent||'Todas as seções';
   const sexo=$('#dashSexo')?.selectedOptions?.[0]?.textContent||'Todos os sexos';
   $('#bqDashPeriod').textContent=(ini?dateBR(ini):'Base inicial')+' → '+fim;
   $('#bqDashScope').textContent=safe(setor)+' · '+(sexo==='Todos'?'Todos os sexos':safe(sexo));
   const count=Number(!!ini)+Number(!!$('#dashSecao')?.value)+Number(!!$('#dashSexo')?.value)+Number(!!$('#dashFim')?.value&&$('#dashFim').value!==new Date().toISOString().slice(0,10));
   const mark=$('#bqDashApplied');mark.hidden=!count;mark.textContent=count+' ativo'+(count===1?'':'s');
 }
 function setFilters(open){
   panel.hidden=!open;veil.hidden=!open;trigger.setAttribute('aria-expanded',String(open));
   document.body.classList.toggle('bq-dash-sheet-open',open&&isMobile());
   if(open){prevFocus=document.activeElement;hideExports();$('#dashIni')?.focus({preventScroll:true})}
   else {document.body.classList.remove('bq-dash-sheet-open');if(prevFocus?.isConnected)prevFocus.focus({preventScroll:true})}
 }
 function allowed(btn){return !!btn&&!btn.hidden}
 function refreshExports(){
   if(!pdf&&!excel){exportToggle.hidden=true;return}
   const a=allowed(pdf),b=allowed(excel);
   exportToggle.hidden=!(a||b);menu.querySelector('[data-export-type="pdf"]').hidden=!a;menu.querySelector('[data-export-type="xlsx"]').hidden=!b;
   if(!(a||b))hideExports();
 }
 function hideExports(){menu.hidden=true;exportToggle.setAttribute('aria-expanded','false')}
 trigger.onclick=()=>setFilters(panel.hidden);
 $('#bqDashClose').onclick=()=>setFilters(false);
 veil.onclick=()=>setFilters(false);
 exportToggle.onclick=()=>{refreshExports();if(exportToggle.hidden)return;menu.hidden=!menu.hidden;exportToggle.setAttribute('aria-expanded',String(!menu.hidden))};
 menu.addEventListener('click',e=>{
   const b=e.target.closest('button[data-export-type]');if(!b)return;
   const original=b.dataset.exportType==='pdf'?pdf:excel;
   if(!allowed(original))return;
   hideExports();original.click();
 });
 document.addEventListener('click',e=>{if(!e.target.closest('#bqDashExport,#bqDashExportMenu'))hideExports()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!panel.hidden){setFilters(false);e.stopPropagation()}hideExports()}});
 // Original form.onSubmit validates dates and calls renderDashboard. Close only after successful render.
 form.addEventListener('submit',()=>{
   pending=true;
   setTimeout(()=>{
     pending=false;const msg=safe($('#dashFilterStatus')?.textContent);
     if(/data inicial deve ser anterior/i.test(msg)){panel.hidden=false;veil.hidden=false;return}
     updateSummary();setFilters(false);
   },30);
 });
 $('#dashLimpar')?.addEventListener('click',()=>setTimeout(()=>{updateSummary();setFilters(false)},30));
 const status=$('#dashFilterStatus');
 if(status)new MutationObserver(()=>{const msg=safe(status.textContent);if(!pending&&!/data inicial deve ser anterior/i.test(msg))updateSummary()}).observe(status,{childList:true,subtree:true,characterData:true});
 const originalButtons=[pdf,excel].filter(Boolean);
 originalButtons.forEach(el=>new MutationObserver(refreshExports).observe(el,{attributes:true,attributeFilter:['hidden','style','class']}));
 window.addEventListener('resize',()=>{if(!isMobile())document.body.classList.remove('bq-dash-sheet-open');else if(!panel.hidden)document.body.classList.add('bq-dash-sheet-open')});
 updateSummary();refreshExports();setTimeout(()=>{updateSummary();refreshExports()},800);
})();
