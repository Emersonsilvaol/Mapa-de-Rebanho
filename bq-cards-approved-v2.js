/* Bodoquena · cartões aprovados 09/10/2026 — camada de apresentação.
   Mantém rotinas existentes, permissões, valores e consulta SISBOV. */
(() => {
  'use strict';
  const holder = document.getElementById('dashKpis');
  const dashboard = document.getElementById('view-dashboard');
  if (!holder || !dashboard) return;
  let queued = false;
  const clean = () => {
    queued = false;
    if (!dashboard.classList.contains('bq-premium-dashboard')) return;
    dashboard.classList.add('bq-approved-reference-cards');
    const cards = holder.querySelectorAll('.bq-premium-kpi');
    for (const card of cards) {
      card.querySelectorAll('.bq-premium-spark, .bq-premium-spark-empty, .bq-premium-foot, .bq-premium-nocompare, .bq-premium-change').forEach(node => node.remove());
      // The approved reference excludes these explanatory paragraphs from the KPI row.
      card.querySelectorAll('.bq-premium-card-body p').forEach(p => {
        const t = p.textContent.trim().toLocaleLowerCase('pt-BR');
        if (t.startsWith('base de abertura do período') || t.startsWith('diferença entre os dois saldos')) p.remove();
      });
      card.querySelectorAll('a,button').forEach(el => {
        if (/^ver composição\s*[↗↖↘↙⬈↗︎🔗]*/iu.test(el.textContent.trim())) el.remove();
      });
      // Retain existing accessible value buttons / native SISBOV detail events.
    }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(clean);
  };
  new MutationObserver(schedule).observe(holder, {childList:true,subtree:false});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
  setTimeout(schedule,350);
})();