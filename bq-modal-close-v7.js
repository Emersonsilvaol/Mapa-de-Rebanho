/* Bodoquena V7 - closes existing Mapa dialogs through their native close buttons; no data mutation. */
(()=>{'use strict';if(window.BodoquenaModalCloseV7)return;
 const x=document.getElementById('modalClose');if(x){x.type='button';x.setAttribute('aria-label','Fechar janela');x.title='Fechar';}
 document.addEventListener('keydown',e=>{if(e.key!=='Escape'||e.defaultPrevented)return;
  const pre=document.getElementById('modalPreValidacao');if(pre&&!pre.hidden&&getComputedStyle(pre).display!=='none'){const btn=document.getElementById('fecharPreValidacao');if(btn){e.preventDefault();btn.click();}return;}
  const overlay=document.getElementById('modalOverlay');if(overlay?.classList.contains('open')){e.preventDefault();document.getElementById('modalClose')?.click();}
 });
 window.BodoquenaModalCloseV7=true;
})();
