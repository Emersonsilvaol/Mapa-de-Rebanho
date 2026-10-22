/* Fazenda Bodoquena UI V2 — progressive, additive and permission-neutral. */
(()=>{'use strict';
 if(window.BodoquenaFrontendV2)return;
 const root=document.documentElement;root.classList.add('bq-frontend-v2');
 const $=(q,el=document)=>el.querySelector(q), $$=(q,el=document)=>Array.from(el.querySelectorAll(q));
 const text=(s)=>document.createTextNode(String(s));
 const visible=(el)=>!!el && !el.closest('[hidden],[aria-hidden="true"]') && getComputedStyle(el).display!=='none';
 const isTyping=(el)=>!!el?.closest('input,select,textarea,[contenteditable="true"]');
 const appReady=()=>{const gate=$('#authGate');if(gate&&!gate.hidden)return false;const a=$('#app');if(a&&(a.hidden||getComputedStyle(a).display==='none'))return false;const login=$('#login');if(login&&!login.hidden&&getComputedStyle(login).display!=='none')return false;return true};
 // Existing workspace search (Ctrl+K) and existing sidebar collapse stay authoritative.
 document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||isTyping(e.target)||!appReady())return;
   if(e.key==='/'){const launch=$('#bqWorkspaceSearch');if(visible(launch)){e.preventDefault();launch.click();}}
 });
 // Real data remains under the existing graph renderer. These controls only publish intent.
 document.addEventListener('click',e=>{const b=e.target.closest('[data-bq-range]');if(!b||b.disabled)return;const group=b.closest('[data-bq-range-group]');if(!group)return;
   $$('[data-bq-range]',group).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
   group.dispatchEvent(new CustomEvent('bq:range-change',{bubbles:true,detail:{range:b.dataset.bqRange,group:group.dataset.bqRangeGroup}}));
 });
 // Opt-in nonintrusive status helpers; never falsely toast success before a caller has confirmed it.
 let toastTimer;
 function toast(message){let box=$('#bq2Toast');if(!box){box=document.createElement('div');box.id='bq2Toast';box.className='bq2-toast';box.setAttribute('role','status');document.body.appendChild(box)}clearTimeout(toastTimer);box.textContent=String(message);box.hidden=false;toastTimer=setTimeout(()=>box.hidden=true,3200)}
 function loading(button,on){if(!button)return;button.classList.toggle('bq2-busy',!!on);button.setAttribute('aria-busy',String(!!on));button.disabled=!!on}
 // Opt-in confirmation: only elements explicitly marked data-bq-confirm by a vetted business flow.
 const bypass=new WeakSet();let dialog;
 function confirmAction(button,label){return new Promise(resolve=>{if(!dialog){const veil=document.createElement('div');veil.className='bq2-backdrop';veil.hidden=true;veil.innerHTML='<section class="bq2-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bq2DialogTitle" aria-describedby="bq2DialogMessage"><h2 id="bq2DialogTitle">Confirmar ação</h2><p id="bq2DialogMessage"></p><div class="bq2-dialog-actions"><button type="button" data-bq2-cancel>Cancelar</button><button type="button" class="bq2-confirm" data-bq2-confirm>Confirmar</button></div></section>';document.body.appendChild(veil);dialog=veil;}
 const veil=dialog,msg=$('#bq2DialogMessage',veil),ok=$('[data-bq2-confirm]',veil),no=$('[data-bq2-cancel]',veil),before=document.activeElement;
 msg.textContent=label;veil.hidden=false;no.focus();
 const finish=(yes)=>{veil.hidden=true;ok.removeEventListener('click',doOK);no.removeEventListener('click',doNo);veil.removeEventListener('mousedown',doBackdrop);document.removeEventListener('keydown',doEscape,true);before?.focus?.();resolve(yes)};
 const doOK=()=>finish(true),doNo=()=>finish(false),doBackdrop=e=>{if(e.target===veil)finish(false)},doEscape=e=>{if(e.key==='Escape'){e.stopPropagation();finish(false)}};
 ok.addEventListener('click',doOK);no.addEventListener('click',doNo);veil.addEventListener('mousedown',doBackdrop);document.addEventListener('keydown',doEscape,true);
 })}
 document.addEventListener('click',async e=>{const el=e.target.closest('[data-bq-confirm]');if(!el||bypass.has(el)||el.disabled||!appReady())return;e.preventDefault();e.stopImmediatePropagation();
 if(await confirmAction(el,el.dataset.bqConfirm||'Deseja continuar?')){bypass.add(el);try{el.click()}finally{bypass.delete(el)}}
 },true);
 // Make real controls informative to keyboard users, not fake-card actions.
 const nav=$('#mainTabs')||$('.sidebar .nav');
 if(nav){$$('button[data-view],button[data-page]',nav).forEach(b=>{if(!b.getAttribute('title'))b.title=(b.querySelector('span')?.textContent||b.textContent||'').trim()})}
 window.BodoquenaFrontendV2=Object.freeze({toast,loading,confirmAction,version:'20261021-v2'});
})();
