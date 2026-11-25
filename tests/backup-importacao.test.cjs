const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const trecho = html.split('/* ================= ALERTA DE BACKUP ANTES DA IMPORTAÇÃO ================= */')[1]
  .split('/* ================= FIM DO ALERTA DE BACKUP ================= */')[0];

function ambiente(admin = true) {
  const dialogs = [], exports = [], avisos = [];
  const ctx = {
    DB: {animais: [{id:'original'}], movimentacoes: [], config:{}},
    DB_GENERATION: 7, CENTRAL_REVISION: 83, AUTH_ADMIN: admin,
    normalizarSisbov: value => String(value || '').trim(), fmtNum: String,
    podeAcesso: () => admin, toast: message => avisos.push(message),
    exportarBackup: async () => (exports.push(JSON.stringify(ctx.DB)), true),
    document: {
      createElement() {
        const controls = new Map();
        return {
          style:{}, setAttribute(){}, showModal(){this.open=true;}, remove(){this.removed=true;},
          querySelector(key){
            if(key==='[data-backup-baixar]'&&!ctx.AUTH_ADMIN)return null;
            if(!controls.has(key))controls.set(key,{disabled:false,textContent:''});
            return controls.get(key);
          },
          close(value=''){this.returnValue=value;this.open=false;this.onclose();}
        };
      },
      body:{appendChild(dialog){dialogs.push(dialog);}}
    }
  };
  vm.createContext(ctx);vm.runInContext(trecho,ctx);
  return {ctx,dialogs,exports,avisos};
}
const animais = n => Array.from({length:n},(_,i)=>({animalId:String(i+1)}));

test('100 animais não disparam alerta; 101 exigem decisão antes de continuar', async () => {
  const {ctx,dialogs}=ambiente();
  assert.equal(await ctx.confirmarBackupImportacao(animais(100)),true);
  assert.equal(dialogs.length,0);
  const pending=ctx.confirmarBackupImportacao(animais(101));
  assert.equal(dialogs.length,1);
  assert.match(dialogs[0].innerHTML,/101 animais/);
  const original=JSON.stringify(ctx.DB);
  dialogs[0].close('cancelar');
  assert.equal(await pending,false);
  assert.equal(JSON.stringify(ctx.DB),original);
});

test('vários eventos do mesmo animal contam uma vez; lotes agregados contam cabeças', () => {
  const {ctx}=ambiente();
  assert.equal(ctx.quantidadeAnimaisImportacao(Array(150).fill({animalId:'mesmo'})),1);
  assert.equal(ctx.quantidadeAnimaisImportacao([{quantidade:101}]),101);
  assert.equal(ctx.quantidadeAnimaisImportacao([{anterior:'105500376641110'},{anterior:'105500376641110'}]),1);
});

test('backup preserva a base anterior e baixar não confirma a importação', async () => {
  const {ctx,dialogs,exports}=ambiente();
  const original=JSON.stringify(ctx.DB);
  let terminou=false;
  const pending=ctx.confirmarBackupImportacao(animais(101)).then(ok=>(terminou=true,ok));
  await dialogs[0].querySelector('[data-backup-baixar]').onclick();
  assert.equal(exports[0],original);
  assert.equal(terminou,false);
  assert.match(dialogs[0].querySelector('[data-backup-status]').textContent,/Confira se o arquivo foi salvo/);
  dialogs[0].close('continuar');
  assert.equal(await pending,true);
});

test('falha do backup mantém o alerta aberto e não anuncia sucesso', async () => {
  const {ctx,dialogs}=ambiente();ctx.exportarBackup=async()=>{throw Error('download falhou');};
  const pending=ctx.confirmarBackupImportacao(animais(101));
  await dialogs[0].querySelector('[data-backup-baixar]').onclick();
  assert.equal(dialogs[0].open,true);
  assert.match(dialogs[0].querySelector('[data-backup-status]').textContent,/Não foi possível/);
  dialogs[0].close();assert.equal(await pending,false);
});

test('mudança da revisão durante o alerta invalida a confirmação antiga', async () => {
  const {ctx,dialogs,avisos}=ambiente();
  const pending=ctx.confirmarBackupImportacao(animais(101));
  ctx.CENTRAL_REVISION++;
  dialogs[0].close('continuar');assert.equal(await pending,false);
  assert.match(avisos[0],/A base mudou/);
});

test('clique repetido não abre duas confirmações ou autoriza duas importações', async () => {
  const {ctx,dialogs}=ambiente();
  const pending=ctx.confirmarBackupImportacao(animais(101));
  assert.equal(await ctx.confirmarBackupImportacao(animais(101)),false);
  assert.equal(dialogs.length,1);
  dialogs[0].close('continuar');assert.equal(await pending,true);
});

test('operador recebe o alerta sem ganhar acesso ao backup completo', async () => {
  const {ctx,dialogs}=ambiente(false);
  const pending=ctx.confirmarBackupImportacao(animais(101));
  assert.match(dialogs[0].innerHTML,/Peça ao administrador/);
  assert.equal(dialogs[0].querySelector('[data-backup-baixar]'),null);
  dialogs[0].close('cancelar');assert.equal(await pending,false);
});

test('todos os scripts da página continuam válidos', () => {
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if(!/\bsrc\s*=/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
  }
});
