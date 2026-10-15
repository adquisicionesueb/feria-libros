'use strict';
(() => {
 const cfg=window.FERIA_CONFIG||{};
 const base=(cfg.supabaseUrl||'').replace(/\/rest\/v1\/?$/,'').replace(/\/$/,'');
 const key=cfg.supabaseAnonKey||'';
 const el=id=>document.getElementById(id);
 let session=null, dashboardData=null, imported=[], analytics=null;
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
 // Solo presentación: no modifica registros ni requiere migraciones SQL.
 // Agrupa por stand y título normalizado (incluye registros manuales).
 const cleanTitle=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/&/g,' y ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 const cleanStand=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 const aliasTitles=new Map([
  ['el bocevo en ingenieria y arquitectura','el boceto en ingenieria y arquitectura'],
  ['el bocebo en ingenieria y arquitectura','el boceto en ingenieria y arquitectura'],
  ['dsm 5','dsm5'],
 ]);
 const canonicalTitle=value=>{const t=cleanTitle(value);return aliasTitles.get(t)||t};
 let voteCache=[], formsCache=[],catalogCache=new Map();
 const aliases=new Map([
 ['dsm 5','dsm5'],['dsm5','dsm5'],['el boceyo en ingenieria y arquitectura','el boceto en la ingenieria y arquitectura'],
 ['el bocevo en ingenieria y arquitectura','el boceto en la ingenieria y arquitectura'],
 ['palestina la prumavera improbable','palestina la primavera improbable'],['palestina la primavera improbable','palestina la primavera improbable'],
 ['semiotica del consumo','semiotica del consumo una aproximacion a la publicidad desde sus signos']
 ]);
 function workKey(t){const k=cleanTitle(t);return aliases.get(k)||k}
 function standKey(s){return cleanStand(s).replace(/^(editorial|ediciones) /,'')}
 function getFormat(r){const f=cleanTitle(r.formato_preferido);if(f==='fisico')return 'fisico';if(f==='digital')return 'digital';return 'sin'}
 async function loadCatalog(votes){
  const ids=[...new Set(votes.map(x=>x.libro_id).filter(Boolean))];catalogCache=new Map();
  for(let i=0;i<ids.length;i+=65){
   const chunk=ids.slice(i,i+65);try{
    const rows=await request('/rest/v1/feria_libros?select=id,titulo,autor,anio,isbn,editorial,proveedor,formato,tematica,subtematica&id=in.('+chunk.map(encodeURIComponent).join(',')+')');
    for(const r of arr(rows))catalogCache.set(r.id,r);
   }catch(e){console.warn('Metadatos no accesibles para algunos registros',e.message);break}
  }
 }
 function groupedBooks(votes){
  const groups=new Map();
  for(const r of votes){
   const metadata=catalogCache.get(r.libro_id)||{};
   const key=workKey(r.titulo);if(!key)continue;
   if(!groups.has(key))groups.set(key,{titulo:metadata.titulo||r.titulo,votos:0,fisico:0,digital:0,sin_formato:0,stands:new Set(),ids:new Set(),isbns:new Set(),autores:new Set(),editoriales:new Set(),anios:new Set(),tematicas:new Set(),subtematicas:new Set(),variantes:new Set()});
   const g=groups.get(key);g.votos++;g[getFormat(r)==='sin'?'sin_formato':getFormat(r)]++;
   if(r.proveedor)g.stands.add(r.proveedor);if(r.libro_id)g.ids.add(r.libro_id);
   if(metadata.isbn)g.isbns.add(String(metadata.isbn));if(metadata.tematica)g.tematicas.add(metadata.tematica);
   if(metadata.subtematica)g.subtematicas.add(metadata.subtematica);
   if(metadata.autor||r.autor)g.autores.add(metadata.autor||r.autor);
   if(metadata.editorial||r.editorial)g.editoriales.add(metadata.editorial||r.editorial);
   if(metadata.anio||r.anio)g.anios.add(metadata.anio||r.anio);
   g.variantes.add(r.titulo);
   if(metadata.titulo&&metadata.titulo.length>g.titulo.length)g.titulo=metadata.titulo;
  }
  const join=x=>[...x].join(' | ');
  return [...groups.values()].map(g=>({titulo:g.titulo,votos:g.votos,fisico:g.fisico,digital:g.digital,sin_formato:g.sin_formato,
   proveedor:join(g.stands),stands:join(g.stands),isbn:join(g.isbns),autor:join(g.autores),editorial:join(g.editoriales),anio:join(g.anios),tematica:join(g.tematicas),subtematica:join(g.subtematicas),libro_id:join(g.ids),variantes:join(g.variantes),revision:g.isbns.size>1?'Validar ISBN/ediciones':g.sin_formato?'Validar formato manual':'OK'})).sort((a,b)=>b.votos-a.votos||a.titulo.localeCompare(b.titulo,'es'));
 }
 function groupedStands(votes,forms){
  const groups=new Map();const get=s=>{const k=cleanStand(s).replace(/^editorial /,'');if(!groups.has(k))groups.set(k,{stand:s,recomendaciones:0,encuestas:0,favorables:0,participants:new Set(),recursos:new Map()});return groups.get(k)};
  for(const r of votes){const g=get(r.proveedor);g.recomendaciones++;if(r.documento)g.participants.add(r.documento)}
  for(const r of forms.filter(f=>!f.excluida)){const g=get(r.stand);g.encuestas++;const fav=/^(si|sí)$/i.test(String(r.interes||'').trim());if(fav)g.favorables++;
   const note=String(r.recurso||'').trim();if(note)g.recursos.set(note,(g.recursos.get(note)||0)+1)}
  return [...groups.values()].map(g=>({stand:g.stand,tipo:g.recomendaciones&&g.encuestas?'Ambos':g.recomendaciones?'Proveedor de libros (físicos o digitales)':'Proveedor de medios educativos digitales',
   recomendaciones:g.recomendaciones,encuestas:g.encuestas,favorables:g.favorables,favorabilidad:g.encuestas?(100*g.favorables/g.encuestas).toFixed(1)+' %':'No aplica',
   recursos:[...g.recursos].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).join(' | '),participantes:g.participants.size})).sort((a,b)=>(b.recomendaciones+b.encuestas)-(a.recomendaciones+a.encuestas));
 }
 async function refreshBooksGrouped(){
  voteCache=await getPagedRpc('panel_feria_detalle_libros');await loadCatalog(voteCache);
  formsCache=await getPagedRpc('panel_feria_detalle_forms');
  if(!dashboardData)return;
  dashboardData.libros=groupedBooks(voteCache);
  dashboardData.stands_libros=groupedStands(voteCache,formsCache);
  dashboardData.recursos_digitales=dashboardData.stands_libros.filter(x=>x.encuestas);
  table('books',dashboardData.libros,[(r,i)=>i+1,r=>r.titulo,r=>r.stands,r=>r.votos,r=>r.fisico,r=>r.digital,r=>r.sin_formato]);
  table('stands',dashboardData.stands_libros,[r=>r.stand,r=>r.tipo,r=>r.recomendaciones,r=>r.encuestas,r=>r.favorabilidad]);
  table('resources',dashboardData.recursos_digitales,[r=>r.stand,r=>r.encuestas,r=>r.recursos]);
  el('booksInfo').textContent=`${dashboardData.libros.length} obras agrupadas sin discriminar stand; ${voteCache.length} recomendaciones. El formato no declarado queda sin determinar. Diferentes ISBN para una misma obra requieren revisión.`;
 }
 function render(d){
  dashboardData=d;
  el('kVotes').textContent=n(d.total_votos);el('kPeople').textContent=n(d.participantes_libros);el('kForms').textContent=n(d.evaluaciones_digitales);
  table('books',arr(d.libros),[(r,i)=>i+1,r=>r.titulo,r=>r.proveedor,r=>r.votos,r=>r.fisico,r=>r.digital,r=>0]);
  table('stands',arr(d.stands_libros),[r=>r.stand,r=>'Proveedor de libros',r=>r.votos,r=>0,r=>'No aplica']);
  table('participants',arr(d.participantes),[r=>r.documento||'(sin documento)',r=>r.perfil,r=>r.dependencia,r=>Number(r.stands_libros||0)+Number(r.stands_digitales||0),r=>r.interacciones,r=>r.votos_libros]);
  
  table('resources',arr(d.recursos_digitales),[r=>r.stand,r=>r.evaluaciones,r=>r.recurso]);
 }
 async function refresh(){
  el('status').textContent='Consultando resultados…';
  try{render(await request('/rest/v1/rpc/panel_feria_resumen',{method:'POST',body:JSON.stringify({p_evento:'feria-2026'})}));el('status').textContent='Información actualizada.';try{await refreshBooksGrouped()}catch(err){el('booksInfo').textContent='No se pudo consolidar el ranking: '+err.message+'; se muestra el ranking original.'}await refreshAnalytics();await loadPeople();await loadManageForms();await loadLottery()}
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
  libros:['titulo','votos','fisico','digital','sin_formato','stands','isbn','autor','anio','editorial','tematica','subtematica','libro_id','variantes','revision'],
  stands_libros:['stand','tipo','recomendaciones','encuestas','favorables','favorabilidad','recursos'],
  participantes:['documento','perfil','dependencia','stands_libros','stands_digitales','interacciones','votos_libros'],
  recursos_digitales:['stand','encuestas','recursos']
 };
 function exportXlsx(name,rows){if(!rows.length)throw Error('No hay registros');if(!window.FeriaExcel)throw Error('Falta el archivo excel.js');window.FeriaExcel.save(name,rows)}
 document.querySelectorAll('.export').forEach(b=>b.addEventListener('click',()=>{
  if(!dashboardData)return;const kind=b.dataset.kind;
  try{exportXlsx('feria_'+kind+'.xlsx',arr(dashboardData[kind]).map(r=>Object.fromEntries(columns[kind].map(k=>[k,r[k]]))))}catch(e){alert(e.message)}
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
 const canonical=o=>({id:String(get(o,'id')??'').trim(),inicio:isoDate(get(o,'hora de inicio')),
   correo:String(get(o,'correo electrónico')||''),nombre:String(get(o,'nombre')||''),finalizacion:isoDate(get(o,'hora de finalización')),
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
  const rows=imported;
  if(!rows.length){el('uploadStatus').textContent='No hay respuestas para importar.';return}
  el('upload').disabled=true;el('uploadStatus').textContent=`Importando ${rows.length} respuestas…`;
  try{
   for(let i=0;i<rows.length;i+=100){
    await request('/rest/v1/rpc/panel_feria_importar_forms',{method:'POST',body:JSON.stringify({p_filas:rows.slice(i,i+100)})});
    el('uploadStatus').textContent=`Procesadas ${Math.min(i+100,rows.length)} de ${rows.length} respuestas.`;
   }
   el('uploadStatus').textContent+= ' Importación completada.';await refresh();await loadManageForms();
  }catch(e){el('uploadStatus').textContent='Error de importación: '+e.message+'; revisa los resultados antes de reintentar.'}
  finally{el('upload').disabled=false}
 });

 // Normalizacion de dependencias. Bioetica y Humanidades se cuentan como unidades academicas.
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
 function classify(dep){
  const s=normalize(dep);
  if(/bioetica|humanidades/.test(s))return 'Académica';
  if(/facultad|programa de|escuela de|odontolog|medicina|enfermer|ingenier|psicolog|educacion|nutricion|arquitectura|ciencias economicas|creacion|arte|derecho|filosofia/.test(s))return 'Académica';
  return 'Administrativa / investigación / otra';
 }
 const csvFull=(name,rows)=>exportXlsx(name.replace(/\.csv$/i,'.xlsx'),rows);
 function drawAnalytics(){
  if(!analytics)return;
  const all=arr(analytics.dependencias).map(x=>({...x,tipo:classify(x.dependencia)}));
  const show=el('onlyAcademic').checked?all.filter(x=>x.tipo==='Académica'):all;
  const total=all.reduce((a,x)=>a+Number(x.personas),0);
  const max=Math.max(1,...show.map(x=>Number(x.personas)));
  el('facultyChart').innerHTML=show.slice(0,16).map(x=>`<div class="barItem"><span>${esc(x.dependencia)}</span><div class="barTrack"><div class="barFill" style="width:${Math.max(1,100*Number(x.personas)/max)}%"></div></div><strong>${n(x.personas)}</strong></div>`).join('')||'<p class="muted">Aún no hay datos para estas categorías.</p>';
  table('faculties',show,[r=>r.dependencia,r=>r.tipo,r=>r.personas,r=>total?(100*r.personas/total).toFixed(1)+' %':'0 %']);
  const stand=el('hoursStand').value;
  const measures=Array(24).fill(0);
  arr(analytics.horas).filter(r=>!stand||r.stand===stand).forEach(r=>{if(r.hora>=0&&r.hora<24)measures[r.hora]+=Number(r.interacciones)});
  const peak=Math.max(1,...measures);
  el('hoursChart').innerHTML=measures.map((v,i)=>i<8||i>17?'':`<div class="hourItem" title="${i}:00 - ${v} interacciones"><div class="hourColumn" style="height:${v?Math.max(3,100*v/peak):1}%"></div><small>${i}</small></div>`).join('');
 }
 async function refreshAnalytics(){
  try{
   analytics=await request('/rest/v1/rpc/panel_feria_analitica',{method:'POST',body:'{}'});
   const st=[...new Set(arr(analytics.horas).map(x=>x.stand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
   const current=el('hoursStand').value;
   el('hoursStand').innerHTML='<option value="">Todos los stands</option>'+st.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
   if(st.includes(current))el('hoursStand').value=current;
   drawAnalytics();
  }catch(e){el('facultyChart').textContent='No se pudo consultar la analítica: '+e.message}
 }
 el('onlyAcademic').addEventListener('change',drawAnalytics);
 el('hoursStand').addEventListener('change',drawAnalytics);
 el('exportDependencias').addEventListener('click',()=>{
  try{if(!analytics)throw Error('Todavía no hay datos');csvFull('feria_distribucion_unidades.csv',arr(analytics.dependencias).map(x=>({...x,tipo:classify(x.dependencia)})))}catch(e){alert(e.message)}
 });
 document.querySelectorAll('.fullExport').forEach(b=>b.addEventListener('click',async()=>{
  const kind=b.dataset.kind;const fn=kind==='libros'?'panel_feria_detalle_libros':'panel_feria_detalle_forms';
  const out=el('exportStatus');out.textContent='Descargando registros detallados…';b.disabled=true;
  try{
   let all=[];
   for(let offset=0;;offset+=500){
    const part=await request('/rest/v1/rpc/'+fn,{method:'POST',body:JSON.stringify({p_desde:offset,p_cantidad:500})});
    all.push(...arr(part));out.textContent=`Recibidos ${all.length} registros…`;
    if(part.length<500)break;
    if(all.length>300000)throw Error('Límite preventivo de exportación superado');
   }
   csvFull('feria_'+kind+'_detallado.csv',all);
   out.textContent=`Exportados ${all.length} registros. Archivo confidencial.`;
  }catch(e){out.textContent='No se pudo exportar: '+e.message}finally{b.disabled=false}
 }));
 // Consolidado paginado, independiente del top de clasificaciones.
 async function getPagedRpc(name){const all=[];for(let offset=0;;offset+=500){
  const batch=await request('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify({p_desde:offset,p_cantidad:500})});
  all.push(...arr(batch));if(batch.length<500)break;if(all.length>300000)throw Error('Demasiados registros para exportar en navegador');
 }return all}
 let participantsFull=[];
 function cleanDoc(r){return String(r.documento||r.numero_documento||r.numeroDocumento||'').trim()}
 function groupedPeople(basePeople){
  const m=new Map();
  const touch=doc=>{if(!m.has(doc))m.set(doc,{documento:doc,perfil:'',dependencia:'',libros:0,evaluaciones:0,interacciones:0,stands:new Set(),perfiles:new Set(),dependencias:new Set()});return m.get(doc)};
  for(const r of basePeople){const doc=cleanDoc(r);if(!doc)continue;const g=touch(doc);g.perfil=r.perfil||'';g.dependencia=r.dependencia||'';g.libros=Number(r.libros||r.votos_libros||0);g.evaluaciones=Number(r.evaluaciones||r.evaluaciones_digitales||0);g.interacciones=Number(r.interacciones||g.libros+g.evaluaciones);
   if(g.perfil)g.perfiles.add(g.perfil);if(g.dependencia)g.dependencias.add(g.dependencia)}
  const feed=(rows,kind)=>{for(const r of rows){if(kind==='forms'&&r.excluida)continue;const doc=cleanDoc(r);if(!doc||!m.has(doc))continue;const g=m.get(doc);
   const provider=String(r.proveedor||r.stand||'').trim();if(provider)g.stands.add(cleanStand(provider).replace(/^editorial /,''));
   if(r.perfil)g.perfiles.add(r.perfil);if(r.dependencia)g.dependencias.add(r.dependencia)
  }};
  feed(voteCache,'votos');feed(formsCache,'forms');
  return [...m.values()].map(g=>({documento:g.documento,perfil:g.perfil,dependencia:g.dependencia,stands_distintos:g.stands.size||'Sin desglose',
    lista_stands:[...g.stands].join(' | '),libros:g.libros,evaluaciones:g.evaluaciones,interacciones:g.interacciones,
    perfiles_observados:[...g.perfiles].join(' | '),dependencias_observadas:[...g.dependencias].join(' | '),
    revision:g.perfiles.size>1||g.dependencias.size>1?'Revisar perfil/dependencia':'Sin discrepancia observada'}))
    .sort((a,b)=>b.interacciones-a.interacciones||Number(b.stands_distintos||0)-Number(a.stands_distintos||0));
 }
 async function loadPeople(){
  try{
   const raw=await getPagedRpc('panel_feria_asistentes');participantsFull=groupedPeople(raw);
   el('kUnique').textContent=n(participantsFull.length);
   table('peopleRows',participantsFull.slice(0,100),[r=>r.documento,r=>r.perfil,r=>r.dependencia,r=>r.stands_distintos,r=>r.interacciones,r=>r.libros,r=>r.revision]);
   if(dashboardData){dashboardData.participantes=participantsFull;table('participants',participantsFull.slice(0,100),[r=>r.documento,r=>r.perfil,r=>r.dependencia,r=>r.stands_distintos,r=>r.interacciones,r=>r.libros]);}
   const flagged=participantsFull.filter(r=>r.revision.startsWith('Revisar')).length;
   el('peopleStatus').textContent=`${participantsFull.length} documentos únicos identificados. ${flagged} discrepancias observables entre registros detallados disponibles. La suma de stands depende de que los RPC devuelvan el documento y stand por registro. Excel contiene todos los resultados.`;
  }catch(e){el('peopleStatus').textContent='Error: '+e.message}
 }
 el('downloadPeople').addEventListener('click',()=>{try{csvFull('feria_asistentes_unicos.csv',participantsFull)}catch(e){alert(e.message)}});
 async function loadManageForms(){
  try{
   const rows=await getPagedRpc('panel_feria_detalle_forms');
   el('formsManageStatus').textContent=`${rows.length} respuestas de Forms, incluidas las excluidas. Se muestran hasta 150.`;
   const tbody=el('manageFormsRows');tbody.innerHTML='';
   for(const r of rows.slice(0,150)){
    const tr=document.createElement('tr');
    for(const value of [r.respuesta_id,r.numero_documento||'Sin documento',r.stand,r.recurso,r.excluida?'Excluida':'Activa']){
     const td=document.createElement('td');td.textContent=String(value??'');tr.append(td);
    }
    const td=document.createElement('td'),btn=document.createElement('button');btn.className='secondary';
    btn.textContent=r.excluida?'Restaurar':'Papelera / excluir';
    btn.addEventListener('click',async()=>{
     const exclude=!r.excluida;
     const motivo=exclude?prompt('Motivo de la exclusión (ej.: prueba, identificación inconsistente):','Revisión administrativa'):'';
     if(exclude&&motivo===null)return;
     if(!confirm(`${exclude?'Excluir':'Restaurar'} respuesta ${r.respuesta_id}?`))return;
     btn.disabled=true;
     try{await request('/rest/v1/rpc/panel_feria_control_respuesta',{method:'POST',body:JSON.stringify({p_id:r.respuesta_id,p_excluir:exclude,p_motivo:motivo})});await refresh()}
     catch(e){alert('No se pudo actualizar: '+e.message);btn.disabled=false}
    });td.append(btn);tr.append(td);tbody.append(tr);
   }
  }catch(e){el('formsManageStatus').textContent='Error: '+e.message}
 }
 el('reloadForms').addEventListener('click',loadManageForms);
 let lotteryBusy=false;
 async function loadLottery(){try{
  const data=await request('/rest/v1/rpc/panel_feria_sorteo_estado',{method:'POST',body:'{}'});
  table('winnersRows',arr(data.ganadores),[r=>r.sorteado_en,r=>r.ronda,r=>r.orden,r=>r.documento]);
  table('exclusionsRows',arr(data.exclusiones),[r=>r.documento||'(no recuperable)',r=>r.motivo]);
 }catch(e){el('lotteryStatus').textContent='Error: '+e.message}}
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 el('draw').addEventListener('click',async()=>{
  if(lotteryBusy)return;
  const count=Number(el('winnerCount').value);
  if(!Number.isInteger(count)||count<1||count>20){alert('Elige entre 1 y 20 ganadores');return}
  if(!confirm(`¿Realizar sorteo de ${count} ganador(es) y registrar el resultado definitivo?`))return;
  lotteryBusy=true;el('draw').disabled=true;el('lotteryStatus').textContent='Generando resultados aleatorios en la base de datos…';
  try{
   // Primero se registra la selección segura en el servidor. La animación no decide quién gana.
   const result=await request('/rest/v1/rpc/panel_feria_sortear',{method:'POST',body:JSON.stringify({p_cantidad:count})});
   el('lotteryStatus').textContent='Resultado registrado. Mostrando balotera…';
   el('lotteryAnimation').classList.add('rolling');
   await pause(2800);
   el('lotteryAnimation').classList.remove('rolling');
   const docs=arr(result.ganadores).map(x=>x.documento);
   el('lotteryAnimation').querySelector('.lotteryBall').textContent='★';
   el('lotteryAnimation').querySelector('span').textContent=docs.join(' · ');
   el('lotteryStatus').textContent=`Ronda ${result.ronda}. Ganadores: ${docs.join(', ')}. Elegibles antes: ${result.candidatos_antes}.`;
   await loadLottery();await loadPeople();
  }catch(e){el('lotteryAnimation').classList.remove('rolling');el('lotteryStatus').textContent='No se realizó el sorteo: '+e.message}
  finally{lotteryBusy=false;el('draw').disabled=false}
 });
 async function exclusionAction(excluir){
  const documento=el('excludeDoc').value.trim(),motivo=el('excludeReason').value.trim();
  if(!/^\d{5,15}$/.test(documento)){alert('Documento inválido');return}
  if(!confirm(`${excluir?'Excluir':'Rehabilitar'} documento ${documento} del sorteo?`))return;
  try{await request('/rest/v1/rpc/panel_feria_sorteo_excluir',{method:'POST',body:JSON.stringify({p_documento:documento,p_excluir:excluir,p_motivo:motivo})});
   el('lotteryStatus').textContent='Exclusión actualizada.';await loadLottery();await loadPeople();
  }catch(e){el('lotteryStatus').textContent='Error: '+e.message}
 }
 el('excludeDraw').addEventListener('click',()=>exclusionAction(true));
 el('restoreDraw').addEventListener('click',()=>exclusionAction(false));
})();
