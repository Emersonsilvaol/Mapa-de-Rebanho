import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import XLSX from 'xlsx-js-style';
import { calcularMapaOtimizado } from './calculator.js';

const cats = ['00–12', '13–24', '25–36', '36+'];
export const localDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Campo_Grande',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const brDate = s => s.split('-').reverse().join('/');
const number = n => new Intl.NumberFormat('pt-BR').format(n);
export function snapshot(row, ref = localDate()) {
  const db = row.payload;
  const final = calcularMapaOtimizado(db, ref);
  const active = final.animais.filter(a => a.status === 'ATIVO');
  function category(birth, day) {
    if (!birth) return '—';
    const a = new Date(birth+'T00:00:00Z'), b = new Date(day+'T00:00:00Z');
    const months = (b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()-(b.getUTCDate()<a.getUTCDate()?1:0);
    return months<=12?cats[0]:months<=24?cats[1]:months<=36?cats[2]:cats[3];
  }
  const initial = db.animais.filter(a=>a.origem==='inicial').map(a=>({...a,setorAtual:a.setorInicial,categoria:category(a.nascimento,db.config.dataMapaInicial)}));
  const sectors = [...new Set([...db.setores,...active.map(a=>a.setorAtual),...initial.map(a=>a.setorAtual)])].filter(Boolean);
  function grid(list) { return sectors.map(s=>{
    const animals=list.filter(a=>a.setorAtual===s), row=[['Margarida','Mutum'].includes(s)?'PANTANAL':'CERRADO',s];
    for (const sex of ['Fêmea','Macho']) {
      let sum=0;
      for (const category of cats) {
        const count=animals.filter(a=>(['m','macho'].includes(String(a.sexo).toLowerCase())?'Macho':'Fêmea')===sex && a.categoria===category).length;
        row.push(count); sum+=count;
      }
      row.push(sum);
    }
    row.push(animals.length); return row;
  }); }
  return {ref,initialRef:db.config.dataMapaInicial,revision:row.revision,updatedAt:row.updated_at,initialCount:initial.length,finalCount:active.length,initialGrid:grid(initial),finalGrid:grid(active),active,movements:db.movimentacoes.filter(m=>m.data<=ref).sort((a,b)=>a.data.localeCompare(b.data)),inconsistencies:final.inconsistencias,unknown:active.filter(a=>!a.setorAtual||!cats.includes(a.categoria)).length};
}

export async function attachments(data) {
  const wb=XLSX.utils.book_new();
  function sheet(name, rows, widths) {
    const ws=XLSX.utils.aoa_to_sheet(rows);
    ws['!cols']=widths.map(wch=>({wch}));
    const range=XLSX.utils.decode_range(ws['!ref']);
    for (let r=0;r<=range.e.r;r++) for (let c=0;c<=range.e.c;c++) {
      const cell=ws[XLSX.utils.encode_cell({r,c})]; if (!cell) continue;
      if(r===0) cell.s={font:{bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:'0F3B2E'}},alignment:{vertical:'center',wrapText:true}};
      else if(r%2===0) cell.s={fill:{fgColor:{rgb:'E7F0E9'}}};
      // Identifiers stay text, including SISBOV/chip values larger than 15 digits.
      if(cell.t==='s') cell.z='@';
    }
    ws['!autofilter']={ref:ws['!ref']};
    XLSX.utils.book_append_sheet(wb,ws,name); return ws;
  }
  const headers=['Bioma','Seção','Fêmeas 0–12','Fêmeas 13–24','Fêmeas 25–36','Fêmeas >36','Subtotal fêmeas','Machos 0–12','Machos 13–24','Machos 25–36','Machos >36','Subtotal machos','Total'];
  for(const [name,grid] of [['Mapa Inicial',data.initialGrid],['Mapa Final',data.finalGrid]]) {
    const ws=sheet(name,[headers,...grid,['TOTAL GERAL','',...Array.from({length:11},(_,i)=>grid.reduce((s,r)=>s+r[i+2],0))]],[14,23,...Array(11).fill(18)]);
    for(let c=2;c<13;c++) {const cell=ws[XLSX.utils.encode_cell({r:grid.length+1,c})];const col=XLSX.utils.encode_col(c);cell.f=`SUM(${col}2:${col}${grid.length+1})`;}
  }
  sheet('Animais Mapa Final',[['SISBOV','Brinco','Chip','Sexo','Raça','Nascimento','Categoria','Seção','Local','Status'],...data.active.map(a=>[String(a.sisbov||''),String(a.brinco||''),String(a.chip||''),a.sexo,a.raca,a.nascimento,a.categoria,a.setorAtual,a.localAtual,a.status])],[22,15,24,12,12,16,15,24,24,14]);
  sheet('Movimentações',[['Data','Tipo','SISBOV','Brinco','Chip','Quantidade','Seção origem','Seção destino','Destino externo','Observação'],...data.movements.map(m=>[m.data,m.tipo,String(m.sisbov||''),String(m.brinco||''),String(m.chip||''),m.quantidade??1,m.setorOrigem,m.setorDestino,m.destinoExterno,m.observacao])],[16,25,22,15,24,14,24,24,25,50]);
  sheet('Referência',[['Informação','Valor'],['Data do mapa',brDate(data.ref)],['Mapa inicial',brDate(data.initialRef)],['Última atualização da base',data.updatedAt],['Revisão da base',data.revision],['Saldo inicial',data.initialCount],['Saldo final',data.finalCount],['Inconsistências',data.inconsistencies.length]],[30,42]);
  const xlsx=XLSX.write(wb,{type:'array',bookType:'xlsx',compression:true});
  const doc=await PDFDocument.create(), font=await doc.embedFont(StandardFonts.Helvetica), bold=await doc.embedFont(StandardFonts.HelveticaBold);
  const green=rgb(.059,.231,.18), light=rgb(.906,.941,.914), white=rgb(1,1,1);
  const baseTime=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Campo_Grande',dateStyle:'short',timeStyle:'short'}).format(new Date(data.updatedAt));
  let pageNumber=0;
  // Standard PDF fonts do not contain every Unicode punctuation symbol.
  const safe=s=>String(s).replace(/[–—]/g,'-').replace(/[^\x20-\x7E\xA0-\xFF]/g,'');
  function text(page,s,x,y,size=9,strong=false,color=green) {page.drawText(safe(s),{x,y,size,font:strong?bold:font,color});}
  function frame(title,ref) {
    const page=doc.addPage([841.89,595.28]); pageNumber++;
    page.drawRectangle({x:0,y:500,width:842,height:96,color:green});
    text(page,'FAZENDA BODOQUENA',30,557,22,true,white);text(page,title,30,529,14,false,white);
    text(page,`Referência: ${brDate(ref)} | Quantidade em cabeças`,30,477,10);
    text(page,`Base atualizada em ${baseTime} (Campo Grande) | Revisão ${data.revision}`,30,20,9);
    text(page,pageNumber,802,20,9); return page;
  }
  function map(title,rows,ref) {
    let page=frame(title,ref),y=449;
    const widths=[65,116,...Array(10).fill(53),71], labels=['BIOMA','SEÇÃO','F 0-12','F 13-24','F 25-36','F >36','SUB F','M 0-12','M 13-24','M 25-36','M >36','SUB M','TOTAL'];
    function line(values,heading=false,total=false) {
      if(y<62) {page=frame(title+' (continuação)',ref); y=449; line(labels,true);}
      if(heading||total||y%2) page.drawRectangle({x:30,y:y-23,width:782,height:26,color:heading||total?green:light});
      let x=30; values.forEach((v,i)=>{const s=typeof v==='number'?number(v):v;text(page,s,x+4,y-14, i===1?8:8.2,heading||total,heading||total?white:green);x+=widths[i];}); y-=26;
    }
    line(labels,true);rows.forEach(r=>line(r));line(['TOTAL GERAL','',...Array.from({length:11},(_,i)=>rows.reduce((s,r)=>s+r[i+2],0))],false,true);
  }
  map('MAPA INICIAL',data.initialGrid,data.initialRef);map('MAPA FINAL',data.finalGrid,data.ref);
  const page=frame('RESUMO DO REBANHO',data.ref);
  [['Saldo inicial',data.initialCount],['Saldo final',data.finalCount],['Variação do saldo',data.finalCount-data.initialCount],['Animais sem seção ou categoria',data.unknown],['Inconsistências no cálculo',data.inconsistencies.length]].forEach(([label,value],i)=>{text(page,label,30,439-i*36,12);text(page,number(value),500,439-i*36,12,true);});
  text(page,'Excel anexo: mapas inicial e final, animais por SISBOV e movimentações.',30,210,11);
  text(page,'Arquivos gerados a partir da base oficial no momento da execução.',30,185,11);
  const pdf=await doc.save();
  const stem=`Mapa_de_Rebanho_${data.ref.split('-').reverse().join('-')}`;
  return [{filename:stem+'.pdf',bytes:pdf},{filename:stem+'.xlsx',bytes:new Uint8Array(xlsx)}];
}

export function emailHTML(data) {
  const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Campo_Grande',dateStyle:'short',timeStyle:'short'}).format(new Date(data.updatedAt));
  return `<div style="font-family:Arial,sans-serif;color:#333;background:#fff;padding:20px"><p>Bom dia, pessoal.</p><p>Seguem o mapa de rebanho atualizado e o detalhamento em Excel.</p><p>Saldo atual: <strong>${number(data.finalCount)} animais</strong>.<br>Última atualização da base: <strong>${time}</strong> (horário de Campo Grande).</p><p>Atenciosamente,</p><img src="cid:assinatura-emerson-branca" width="520" style="display:block;width:520px;max-width:100%;height:auto;border:0" alt="Assinatura do responsável"><p style="font-size:11px;color:#777">Envio automático do sistema Mapa de Rebanho.</p></div>`;
}
