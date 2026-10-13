'use strict';
(() => {
 const cfg=window.FERIA_CONFIG||{};
 const base=(cfg.supabaseUrl||'').replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'');
 const key=cfg.supabaseAnonKey||'';
 const el=id=>document.getElementById(id);
 let session=null, dashboardData=null, imported=[];
 const errorText=(obj,fallback)=>obj?.message||obj?.error_description||obj?.error||fallback;
 async function request(path,opts={}){
  if(!base||!key)throw Error('No se encontró la configuración pública de Supabase (../config.js).');
  const headers={'apikey':key,'Content-Type':'application/json'};
  if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
  else headers.Authorization='Bearer '+key;
  const response=await fetch(base+path,{...opts,headers:{...headers,...opts.headers},cache:'no-store'});
  const raw=await response.text();let data;
  try{data=raw?JSON.parse(raw):null}catch{data={message:raw}}
  if(!response.ok)throw Error(errorText(data,`HTTP ${response.status}`));
  return data;
 }
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const n=v=>Number(v||0).toLocaleString('es-CO');
 const arr=v=>Array.isArray(v)?v:[];
 function table(id,rows,cols){
  el(id).innerHTML=rows.length?rows.map((r,i)=>`<tr>${cols.map(c=>`<td>${esc(c(r,i))}</td>`).join('')}</tr>`).join(''):'<tr><td colspan="8">Todavía no hay datos registrados.</td></tr>';
 }
 function render(d){
  dashboardData=d;
  el('kVotes').textContent=n(d.total_votos);el('kPeople').textContent=n(d.participantes_libros);el('kForms').textContent=n(d.evaluaciones_digitales);
  table('books',arr(d.libros),[(r,i)=>i+1,r=>r.titulo,r=>r.proveedor,r=>r.votos,r=>r.fisico,r=>r.digital]);
  table('stands',arr(d.stands_libros),[r=>r.stand,r=>r.votos,r=>r.participantes]);
  table('participants',arr(d.participantes),[r=>r.documento||'(sin documento)',r=>r.perfil,r=>r.dependencia,r=>r.votos_libros,r=>r.evaluaciones_digitales,r=>r.stands_libros,r=>r.stands_digitales,r=>r.interacciones]);
  table('digital',arr(d.stands_digitales),[r=>r.stand,r=>r.evaluaciones,r=>r.favorables,r=>r.evaluaciones?((100*r.favorables/r.evaluaciones).toFixed(1)+' %'):'—']);
  table('resources',arr(d.recursos_digitales),[r=>r.stand,r=>r.recurso,r=>r.evaluaciones,r=>r.favorables]);
 }
 async function refresh(){
  el('status').textContent='Consultando resultados…';
  try{render(await request('/rest/v1/rpc/panel_feria_resumen',{method:'POST',body:JSON.stringify({p_evento:'feria-2026'})}));el('status').textContent='Información actualizada.'}
  catch(e){el('status').textContent='No se pudieron consultar los datos: '+e.message}
 }
 function showLogged(){el('loginBox').hidden=true;el('dashboard').hidden=false;el('userLabel').textContent=session.user?.email||'';refresh()}
 el('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();el('loginStatus').textContent='Ingresando…';
  try{
   const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:el('email').value.trim(),password:el('password').value})});
   session=data;
   el('password').value='';showLogged();
  }catch(err){el('loginStatus').textContent='No se pudo iniciar sesión: '+err.message}
 });
 el('logout').addEventListener('click',()=>{session=null;dashboardData=null;el('dashboard').hidden=true;el('loginBox').hidden=false;el('loginStatus').textContent='Sesión cerrada.'});
 el('refresh').addEventListener('click',refresh);
 function csvEscape(x){const s=String(x??'');return /[",\r\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
 const columns={
  libros:['libro_id','titulo','autor','proveedor','votos','fisico','digital'],
  stands_libros:['stand','votos','participantes'],
  participantes:['documento','perfil','dependencia','votos_libros','evaluaciones_digitales','stands_libros','stands_digitales','interacciones'],
  stands_digitales:['stand','evaluaciones','favorables'],
  recursos_digitales:['stand','recurso','evaluaciones','favorables']
 };
 document.querySelectorAll('.export').forEach(b=>b.addEventListener('click',()=>{
  if(!dashboardData)return;
  const kind=b.dataset.kind,keys=columns[kind];
  const rows=[keys.join(';'),...arr(dashboardData[kind]).map(r=>keys.map(k=>csvEscape(r[k])).join(';'))];
  const blob=new Blob(['\ufeff'+rows.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='feria_'+kind+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
 }));
 function parseCsv(text){
  const rows=[];let row=[],field='',quotes=false;
  text=text.replace(/^\ufeff/,'');const sep=(text.split(/\r?\n/,1)[0].match(/;/g)||[]).length>(text.split(/\r?\n/,1)[0].match(/,/g)||[]).length?';':',';
  for(let i=0;i<text.length;i++){
   const c=text[i];if(c==='"'){if(quotes&&text[i+1]==='"'){field+='"';i++}else quotes=!quotes}
   else if(c===sep&&!quotes){row.push(field);field=''}
   else if((c==='\n'||c==='\r')&&!quotes){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field=''}
   else field+=c;
  }row.push(field);if(row.some(x=>x!==''))rows.push(row);
  const headers=rows.shift()||[];return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]||''])));
 }
 function get(obj,keyword){const k=Object.keys(obj).find(k=>k.trim().toLocaleLowerCase('es').includes(keyword));return k?obj[k]:''}
 function isoDate(value){
  if(!value)return '';
  if(value instanceof Date&&!isNaN(value))return value.toISOString();
  if(typeof value==='number'){const d=new Date(Math.round((value-25569)*86400000));return isNaN(d)?'':d.toISOString()}
  const s=String(value).trim();
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${(m[4]||'00').padStart(2,'0')}:${m[5]||'00'}:${m[6]||'00'}-05:00`;
  return /^\d{4}-\d{2}-\d{2}/.test(s)?s:'';
 }
 const canonical=o=>({id:String(get(o,'id')??'').trim(),finalizacion:isoDate(get(o,'hora de finalización')),
   documento:String(get(o,'número de documento')??'').replace(/\.0$/,'').trim(),perfil:String(get(o,'qué tipo de usuario')||''),
   dependencia:String(get(o,'dependencia, facultad')||''),stand:String(get(o,'qué stand visitaste')||''),
   recurso:String(get(o,'qué recurso o plataforma')||''),conocimiento:String(get(o,'ya conocías o utilizabas')||''),
   interes:String(get(o,'te gustaría que la biblioteca')||''),comentario:String(get(o,'qué destacarías o mejorarías')||'')});
 async function loadXlsx(buffer){
  // Lector local XLSX: ZIP + XML. Sin dependencias ni envio del Excel a servicios externos.
  const dv=new DataView(buffer), bytes=new Uint8Array(buffer);
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(dv.getUint32(i,true)===0x06054b50){end=i;break}}
  if(end<0)throw Error('No se pudo abrir el archivo XLSX.');
  const count=dv.getUint16(end+10,true),central=dv.getUint32(end+16,true),files=new Map();let p=central;
  const decoder=new TextDecoder('utf-8');
  for(let i=0;i<count;i++){
   if(dv.getUint32(p,true)!==0x02014b50)throw Error('Archivo XLSX ZIP invalido');
   const method=dv.getUint16(p+10,true),compressed=dv.getUint32(p+20,true);
   const namelen=dv.getUint16(p+28,true),extra=dv.getUint16(p+30,true),comment=dv.getUint16(p+32,true);
   const off=dv.getUint32(p+42,true),name=decoder.decode(bytes.slice(p+46,p+46+namelen));
   files.set(name,{method,compressed,off});p+=46+namelen+extra+comment;
  }
  async function extract(name){
   const z=files.get(name);if(!z)return null;
   if(dv.getUint32(z.off,true)!==0x04034b50)throw Error('Entrada ZIP invalida');
   const start=z.off+30+dv.getUint16(z.off+26,true)+dv.getUint16(z.off+28,true);
   const content=bytes.slice(start,start+z.compressed);
   if(z.method===0)return decoder.decode(content);
   if(z.method!==8)throw Error('Metodo ZIP no compatible');
   if(!('DecompressionStream' in window))throw Error('El navegador no admite la lectura XLSX; exporta a CSV UTF-8.');
   const stream=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   return decoder.decode(await new Response(stream).arrayBuffer());
  }
  const shared=[];const sharedXml=await extract('xl/sharedStrings.xml');
  if(sharedXml){const x=new DOMParser().parseFromString(sharedXml,'application/xml');
   for(const si of x.getElementsByTagName('si'))shared.push(Array.from(si.getElementsByTagName('t')).map(t=>t.textContent).join(''));
  }
  const sheetName=Array.from(files.keys()).find(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if(!sheetName)throw Error('No hay hojas compatibles en el Excel');
  const raw=await extract(sheetName),xml=new DOMParser().parseFromString(raw,'application/xml');
  if(xml.getElementsByTagName('parsererror').length)throw Error('XML de Excel invalido');
  const rows=[];
  for(const row of xml.getElementsByTagName('row')){
   const values=[];
   for(const cell of row.getElementsByTagName('c')){
    const address=cell.getAttribute('r')||'';let col=0;
    for(const ch of (address.match(/^[A-Z]+/)||[''])[0])col=col*26+ch.charCodeAt(0)-64;
    let v='';const type=cell.getAttribute('t');
    if(type==='inlineStr')v=Array.from(cell.getElementsByTagName('t')).map(t=>t.textContent).join('');
    else{const vn=cell.getElementsByTagName('v')[0];v=vn?vn.textContent:'';if(type==='s')v=shared[Number(v)]??''}
    values[col-1]=v;
   }
   rows.push(values);
  }
  const headers=rows.shift()||[];
  return rows.map(row=>Object.fromEntries(headers.map((h,i)=>[String(h||''),row[i]??''])));
 }
 el('formsFile').addEventListener('change',async()=>{
  imported=[];el('upload').disabled=true;
  const f=el('formsFile').files[0];if(!f)return;
  el('preview').textContent='Leyendo archivo…';
  try{
   const source=f.name.toLowerCase().endsWith('.csv')?parseCsv(await f.text()):await loadXlsx(await f.arrayBuffer());
   const headers=Object.keys(source[0]||{}).map(x=>x.toLocaleLowerCase('es'));
   if(!headers.includes('id')||!headers.some(x=>x.includes('número de documento'))||!headers.some(x=>x.includes('qué stand visitaste'))){
    throw Error('No aparecen las columnas Id, Número de documento o ¿Qué stand visitaste? del formulario original.');
   }
   imported=source.map(canonical).filter(r=>r.id&&r.stand);
   const testCount=imported.filter(r=>/\bprueba\b/i.test(r.comentario)).length;
   el('preview').textContent=`${imported.length} respuestas legibles; ${testCount} identificadas como prueba. ${imported.filter(r=>r.documento).length} con documento.`;
   el('upload').disabled=!imported.length;
  }catch(e){el('preview').textContent='No se pudo leer el archivo: '+e.message}
 });
 el('upload').addEventListener('click',async()=>{
  const rows=imported.filter(r=>!el('excludeTests').checked||!/\bprueba\b/i.test(r.comentario));
  if(!rows.length){el('uploadStatus').textContent='No hay respuestas para importar.';return}
  el('upload').disabled=true;el('uploadStatus').textContent=`Importando ${rows.length} respuestas…`;
  try{
   for(let i=0;i<rows.length;i+=100){
    await request('/rest/v1/rpc/panel_feria_importar_forms',{method:'POST',body:JSON.stringify({p_filas:rows.slice(i,i+100)})});
    el('uploadStatus').textContent=`Procesadas ${Math.min(i+100,rows.length)} de ${rows.length} respuestas.`;
   }
   el('uploadStatus').textContent+= ' Importación completada.';await refresh();
  }catch(e){el('uploadStatus').textContent='Error de importación: '+e.message+'; revisa los resultados antes de reintentar.'}
  finally{el('upload').disabled=false}
 });
})();
