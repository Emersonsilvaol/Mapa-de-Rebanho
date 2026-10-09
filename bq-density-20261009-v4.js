/* Bodoquena · Hierarquia executiva v4. Exclusivamente reorganiza nós existentes.
 * Não copia dados nem modifica eventos, campos, IDs, APIs, permissões ou cálculos. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 function compactar(){
   if(document.documentElement.dataset.bqDensityV4==='1') return true;
   const dash=$('view-dashboard'),ini=$('view-mapaInicial'),fim=$('view-mapaAtual');
   if(!dash||!ini||!fim||!$('dashKpis')||!$('bqDashCompact')||!$('bq3-inicial-status')||!$('bq3-final-status'))return false;
   const cabecalho=view=>view.querySelector(':scope > .bq3-heading')||view.querySelector(':scope > .view-title');
   // Primeiro, os cinco saldos do Dashboard. Em seguida, os filtros e a análise.
   const kpis=$('dashKpis'),filtros=$('bqDashCompact');
   filtros.before(kpis);
   const atalhos=dash.querySelector('.bq3-shortcuts');
   const titulo=cabecalho(dash);
   if(atalhos&&titulo){atalhos.classList.add('bq4-head-actions');titulo.appendChild(atalhos)}
   // Os totais ficam no primeiro bloco dos mapas, sem criar KPIs duplicados.
   const iniHead=cabecalho(ini),fimHead=cabecalho(fim);
   if(iniHead)iniHead.after($('bq3-inicial-status'));
   if(fimHead){
     const alerta=$('mapaAtualAlertas');
     if(alerta) alerta.after($('bq3-final-status'));
     else fimHead.after($('bq3-final-status'));
   }
   const rel=$('view-relatorio');
   rel?.querySelector(':scope > .toolbar')?.classList.add('bq4-report-filters','bq3-filterbar');
   const ficha=$('view-fichaAnimal');
   ficha?.classList.add('bq4-compact-ficha');
   document.documentElement.dataset.bqDensityV4='1';
   return true;
 }
 function start(){
   if(compactar())return;
   let tries=0;const run=()=>{if(compactar()||++tries>30)return;setTimeout(run,100)};
   setTimeout(run,80);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();