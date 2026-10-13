import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import {logoImage} from './assets.js';
import {zipSync,strToU8} from 'npm:fflate@0.8.2';
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

export async function attachments(data, format='all') {
  let xlsx;
  if(format!=='pdf') {
  const parts={},sheets=[];
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
  const col=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  function sheet(name,rows,widths){
    const num=sheets.length+1; sheets.push(name);
    const lines=rows.map((row,i)=>'<row r="'+(i+1)+'">'+row.map((v,j)=>{
      const ref=col(j)+(i+1),style=i===0?' s="1"':'';
      return typeof v==='number'?'<c r="'+ref+'"'+style+'>'+(row[0]==='TOTAL GERAL'&&j>=2?'<f>SUM('+col(j)+'2:'+col(j)+i+')</f>':'')+'<v>'+v+'</v></c>':'<c r="'+ref+'" t="inlineStr"'+style+'><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
    }).join('')+'</row>');
    const cols=widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join('');
    parts['xl/worksheets/sheet'+num+'.xml']=strToU8('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>'+cols+'</cols><sheetData>'+lines.join('')+'</sheetData><autoFilter ref="A1:'+col(widths.length-1)+rows.length+'"/></worksheet>');
    return {};
  }
  const headers=['Bioma','Seção','Fêmeas 0–12','Fêmeas 13–24','Fêmeas 25–36','Fêmeas >36','Subtotal fêmeas','Machos 0–12','Machos 13–24','Machos 25–36','Machos >36','Subtotal machos','Total'];
  for(const [name,grid] of [['Mapa Inicial',data.initialGrid],['Mapa Final',data.finalGrid]]) {
    const ws=sheet(name,[headers,...grid,['TOTAL GERAL','',...Array.from({length:11},(_,i)=>grid.reduce((s,r)=>s+r[i+2],0))]],[14,23,...Array(11).fill(18)]);
  }
  sheet('Animais Mapa Final',[['SISBOV','Brinco','Chip','Sexo','Raça','Nascimento','Categoria','Seção','Local','Status'],...data.active.map(a=>[String(a.sisbov||''),String(a.brinco||''),String(a.chip||''),a.sexo,a.raca,a.nascimento,a.categoria,a.setorAtual,a.localAtual,a.status])],[22,15,24,12,12,16,15,24,24,14]);
  sheet('Movimentações',[['Data','Tipo','SISBOV','Brinco','Chip','Quantidade','Seção origem','Seção destino','Destino externo','Observação'],...data.movements.map(m=>[m.data,m.tipo,String(m.sisbov||''),String(m.brinco||''),String(m.chip||''),m.quantidade??1,m.setorOrigem,m.setorDestino,m.destinoExterno,m.observacao])],[16,25,22,15,24,14,24,24,25,50]);
  sheet('Referência',[['Informação','Valor'],['Data do mapa',brDate(data.ref)],['Mapa inicial',brDate(data.initialRef)],['Última atualização da base',data.updatedAt],['Revisão da base',data.revision],['Saldo inicial',data.initialCount],['Saldo final',data.finalCount],['Inconsistências',data.inconsistencies.length]],[30,42]);

  const ns='http://schemas.openxmlformats.org';
  parts['[Content_Types].xml']=strToU8('<?xml version="1.0"?><Types xmlns="'+ns+'/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>');
  parts['_rels/.rels']=strToU8('<Relationships xmlns="'+ns+'/package/2006/relationships"><Relationship Id="rId1" Type="'+ns+'/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  parts['xl/workbook.xml']=strToU8('<workbook xmlns="'+ns+'/spreadsheetml/2006/main" xmlns:r="'+ns+'/officeDocument/2006/relationships"><sheets>'+sheets.map((n,i)=>'<sheet name="'+esc(n)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>');
  parts['xl/_rels/workbook.xml.rels']=strToU8('<Relationships xmlns="'+ns+'/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+ns+'/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="styles" Type="'+ns+'/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  parts['xl/styles.xml']=strToU8('<styleSheet xmlns="'+ns+'/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F3B2E"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
  xlsx=zipSync(parts,{level:1});
  }
  const stem=`Mapa_de_Rebanho_${data.ref.split('-').reverse().join('-')}`;
  if(format==='xlsx') return [{filename:stem+'.xlsx',bytes:new Uint8Array(xlsx)}];
  const doc=await PDFDocument.create();
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  const font=await doc.embedFont(StandardFonts.Helvetica),bold=await doc.embedFont(StandardFonts.HelveticaBold),logo=await doc.embedJpg(decode(logoImage));
  const green=rgb(.059,.231,.18),ink=rgb(.149,.235,.196),muted=rgb(.392,.459,.424),light=rgb(.906,.941,.914),white=rgb(1,1,1);
  const baseTime=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Campo_Grande',dateStyle:'short',timeStyle:'short'}).format(new Date(data.updatedAt));
  let pageNumber=0;const pageFooters=[];
  function text(page,s,x,y,size=9,strong=false,color=ink,align='left') {
    const value=String(s),f=strong?bold:font,w=f.widthOfTextAtSize(value,size);
    page.drawText(value,{x:align==='right'?x-w:align==='center'?x-w/2:x,y,size,font:f,color});
  }
  function box(page,x,y,width,height,color){page.drawRectangle({x,y,width,height,color});}
  function rule(page,x,y,x2,y2,color=rgb(.796,.851,.812),thickness=.4){page.drawLine({start:{x,y},end:{x:x2,y:y2},color,thickness});}
  function frame(title,ref) {
    const page=doc.addPage([841.89,595.28]);pageNumber++;
    const size=logo.scaleToFit(91,88);page.drawImage(logo,{x:32,y:487,width:size.width,height:size.height});
    text(page,title,810,546,21,true,green,'right');
    text(page,`Referência · ${brDate(ref)}`,810,524,10,false,muted,'right');
    text(page,'Quantidade em cabeças',810,505,9,false,muted,'right');rule(page,32,480,810,480,green,1);
    rule(page,32,44,810,44,rgb(.847,.886,.859),.5);
    text(page,`Base atualizada em ${baseTime} · Campo Grande · Revisão ${data.revision}`,32,28,7.5,false,muted);
    pageFooters.push([page,pageNumber]);return page;
  }
  function map(title,rows,ref) {
    const widths=[68,123,...Array(10).fill(51),77],xs=[32];for(const w of widths)xs.push(xs.at(-1)+w);
    let page,y;const rh=29;
    function begin(continued=false){page=frame(title+(continued?' (continuação)':''),ref);y=451;box(page,32,y-45,778,45,green);
      for(const [i,label]of [[0,'BIOMA'],[1,'SEÇÃO'],[12,'TOTAL']])text(page,label,i===1?xs[i]+8:xs[i]+widths[i]/2,y-26,8,true,white,i===1?'left':'center');
      text(page,'FÊMEAS',(xs[2]+xs[7])/2,y-15,9,true,white,'center');text(page,'MACHOS',(xs[7]+xs[12])/2,y-15,9,true,white,'center');
      for(const start of [2,7])['0–12','13–24','25–36','>36','Subtotal'].forEach((label,j)=>text(page,label,xs[start+j]+widths[start+j]/2,y-34,7.8,true,white,'center'));y-=45;
    }
    begin();const ordered=[...rows.filter(r=>r[0]==='CERRADO'),...rows.filter(r=>r[0]==='PANTANAL'),...rows.filter(r=>!['CERRADO','PANTANAL'].includes(r[0]))];
    for(let i=0;i<ordered.length;){
      if(y-rh<66)begin(true);
      let end=i+1;while(end<ordered.length&&ordered[end][0]===ordered[i][0])end++;
      const count=Math.min(end-i,Math.floor((y-66)/rh)),top=y;
      for(let j=0;j<count;j++){
        const row=ordered[i+j];box(page,32,y-rh,778,rh,(i+j)%2===0?light:rgb(.949,.965,.953));text(page,row[1],xs[1]+8,y-18,9);
        row.slice(2).forEach((n,k)=>text(page,number(n),xs[k+3]-9,y-18,9,[4,9,10].includes(k),ink,'right'));
        rule(page,xs[1],y-rh,810,y-rh);y-=rh;
      }
      box(page,32,top-count*rh,68,count*rh,ordered[i][0]==='CERRADO'?light:rgb(.929,.957,.937));
      text(page,ordered[i][0],66,top-count*rh/2-3,8,true,green,'center');
      if(i>0)rule(page,32,top,810,top,rgb(.506,.624,.545),.7);i+=count;
    }
    if(y-rh<66)begin(true);
    box(page,32,y-rh,778,rh,green);text(page,'TOTAL GERAL',40,y-18,9,true,white);
    for(let j=2;j<13;j++)text(page,number(rows.reduce((s,r)=>s+r[j],0)),xs[j+1]-9,y-18,9,true,white,'right');
  }
  map('Mapa inicial',data.initialGrid,data.initialRef);map('Mapa final',data.finalGrid,data.ref);
  for(const [page,n]of pageFooters)text(page,`${n} / ${pageFooters.length}`,810,28,7.5,false,muted,'right');
  const pdf=await doc.save();
  return format==='pdf' ? [{filename:stem+'.pdf',bytes:pdf}] : [{filename:stem+'.pdf',bytes:pdf},{filename:stem+'.xlsx',bytes:new Uint8Array(xlsx)}];
}

export function emailHTML(data) {
  const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Campo_Grande',dateStyle:'short',timeStyle:'short'}).format(new Date(data.updatedAt));
  return `<div style="font-family:Arial,sans-serif;color:#333;background:#fff;padding:20px"><p>Bom dia, pessoal.</p><p>Seguem o mapa de rebanho atualizado e o detalhamento em Excel.</p><p>Saldo atual: <strong>${number(data.finalCount)} animais</strong>.<br>Última atualização da base: <strong>${time}</strong> (horário de Campo Grande).</p><p>Atenciosamente,</p><img src="cid:assinatura-emerson-branca" width="520" style="display:block;width:520px;max-width:100%;height:auto;border:0" alt="Assinatura do responsável"><p style="font-size:11px;color:#777">Envio automático do sistema Mapa de Rebanho.</p></div>`;
}

