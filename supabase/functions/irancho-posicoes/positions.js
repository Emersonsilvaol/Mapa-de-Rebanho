const SECOES=new Map([[15827,'Guaicurus'],[15828,'Tope'],[15829,'Bela Vista'],[15830,'Três Pedras'],[15831,'Confinamento'],[15832,'Porto Carreiro'],[15833,'Três Barras'],[15834,'Margarida']]);
export function normalizarAnimal(a){
 if(!a||typeof a.id_animal!=='string'||!a.id_animal||typeof a.ic_animal_ativo!=='boolean')throw Error('Resposta de animais incompatível.');
 const raw=a.id_rastreabilidade,sisbov=raw==null?'':String(raw).trim();
 if(typeof raw==='number'&&!Number.isSafeInteger(raw))throw Error('Identificação numérica inválida.');
 return {id_animal:a.id_animal,sisbov,ativo:a.ic_animal_ativo&&!a.dt_morte_animal&&!a.dt_desativado&&!a.dt_deletado,secao_gestao:SECOES.get(Number(a.id_fazenda))||'',fazenda_id:Number(a.id_fazenda)||null,local:String(a.subdivisao?.no_subdivisao||'').trim(),local_codigo:String(a.id_fazenda_subdivisao||''),lote:String(a.lote_atual?.nome||'').trim(),lote_codigo:String(a.id_lote||''),data_posicao:a.dt_ultima_movimentacao||a.dt_ultimo_aparte||null,updated_at:a.detalhes?.dt_alteracao||null,sexo:a.sexo?.no_sexo||'',raca:a.raca?.no_raca||'',categoria:a.categoria_atual?.no_categoria_animal||'',cadastro_origem:'iRancho — posição atual',cadastro_usuario:'',responsavel_manejo:''};
}
