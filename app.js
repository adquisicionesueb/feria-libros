 'use strict';
const $=id=>document.getElementById(id);
let verifyStatus='idle',verifySeq=0,verifiedDocument='',verifyTimer=null; const chosen=new Map(); let catalog=[],filtered=[],page=0,sending=false,completed=false; let savedByStand={}, savedByStandTipo={}, savedTotal=0; const savedThisVisit=[]; const MAX_POR_STAND=5,MAX_MANUALES_EXTRA=2,pageSize=8,config=window.FERIA_CONFIG||{};
const configured=(()=>{try{return new URL(config.supabaseUrl).protocol==='https:' && !!config.supabaseAnonKey && !config.supabaseAnonKey.startsWith('PEGAR')}catch{return false}})();
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
const value=v=>String(v??'').trim();
function node(tag,cls,text){const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a}
function option(select,value,label){const o=node('option','',label);o.value=value;select.append(o)}
function canSelect(){return verifyStatus==='ready' && value($('documento').value)===verifiedDocument}
function showVerify(msg){$('documentoEstado').textContent=msg}
async function verifyDocument(){
 const doc=value($('documento').value);const serial=++verifySeq;clearTimeout(verifyTimer);
 if(!/^[0-9]{5,15}$/.test(doc)){verifyStatus='idle';verifiedDocument='';savedByStand={};savedByStandTipo={};savedTotal=0;showVerify('Ingresa tu documento (5 a 15 dígitos) para comprobar tus recomendaciones.');refresh();draw();return}
 if(!configured){verifyStatus='error';showVerify('No pudimos verificar tus recomendaciones. Intenta más tarde.');refresh();draw();return}
 verifyStatus='loading';showVerify('Comprobando tus recomendaciones...');refresh();draw();
 try{
 const res=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/consultar_recomendaciones_documento',{method:'POST',headers:{apikey:config.supabaseAnonKey,...(config.supabaseAnonKey.startsWith('sb_publishable_')?{}:{Authorization:'Bearer '+config.supabaseAnonKey}),'Content-Type':'application/json'},body:JSON.stringify({p_evento:config.eventId,p_documento:doc})});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data={message:raw}}
 if(!res.ok)throw Error(data.message||'No disponible');
 if(serial!==verifySeq||doc!==value($('documento').value))return;
 savedByStand=data.por_stand||{};savedByStandTipo=data.por_stand_tipo||{};savedTotal=data.total_votos||0;verifiedDocument=doc;verifyStatus='ready';
 showVerify(savedTotal?`Consulta realizada. Tienes ${savedTotal} recomendaciones guardadas. Puedes seguir eligiendo en las editoriales disponibles.`:'Consulta realizada. Puedes comenzar a recomendar tus libros favoritos.');
 }catch(e){if(serial!==verifySeq)return;verifyStatus='error';verifiedDocument='';savedByStand={};savedByStandTipo={};savedTotal=0;showVerify('No pudimos comprobar tus recomendaciones. Revisa tu conexión e intenta de nuevo.')}
 refresh();draw();
}
function choosePreferredFormat(){
 return new Promise(resolve=>{
  const d=$('formatoDialog');let settled=false;
  const finish=(choice)=>{if(settled)return;settled=true;d.close();resolve(choice)};
  $('formatoFisico').onclick=()=>finish('Físico');
  $('formatoDigital').onclick=()=>finish('Digital');
  $('formatoCancelar').onclick=()=>finish(null);
  d.oncancel=e=>{e.preventDefault();finish(null)};
  d.showModal();
 });
}
function counts(stand){
 const saved=savedByStandTipo[stand]||{};
 const catSaved=Number(saved.catalogo||0),manSaved=Number(saved.manual||0);
 const catPending=[...chosen.values()].filter(x=>x.proveedor===stand&&x.tipo==='catalogo').length;
 const manPending=[...chosen.values()].filter(x=>x.proveedor===stand&&x.tipo==='manual').length;
 return {cat:catSaved+catPending,manual:manSaved+manPending,total:catSaved+manSaved+catPending+manPending};
}
function manualLimit(stand){const c=counts(stand);return c.cat===0?5:c.cat>=5?2:Math.max(0,5-c.cat)}
function canAddCatalog(stand){const c=counts(stand);return c.cat<5&&(c.manual<=2||c.cat+c.manual<5)}
function countFor(stand){return counts(stand).total}
function chooseDigitalExtra(){return new Promise(resolve=>{const d=$('digitalExtraDialog');let settled=false;const finish=x=>{if(settled)return;settled=true;d.close();resolve(x)};$('digitalExtraSi').onclick=()=>finish(true);$('digitalExtraNo').onclick=()=>finish(false);$('digitalExtraCancelar').onclick=()=>finish(null);d.oncancel=e=>{e.preventDefault();finish(null)};d.showModal()})}
function selectedStands(){return [...new Set([...chosen.values()].map(x=>x.proveedor))]}
function checkProfile(){if(!$('perfil').value||!$('dependencia').value){$('setupNotice').hidden=false;$('setupNotice').textContent='Para continuar, selecciona tu perfil y facultad o dependencia.';window.scrollTo({top:0,behavior:'smooth'});return false}return true}
function refresh(){
 $('nselected').textContent=chosen.size;
 $('nstands').textContent=selectedStands().length;
 $('review').disabled=!chosen.size||completed;
 const active=$('proveedor').value;
 const c=counts(active),ready=canSelect();
 $('standHint').textContent=!ready?'Primero ingresa tu documento para verificar tus recomendaciones.':active?`${c.cat} de 5 libros del catálogo · ${c.manual} solicitudes manuales en ${active}`:'Puedes elegir hasta cinco libros del catálogo por stand.';
 $('manualLimit').textContent=active?`Solicitudes manuales: ${c.manual} de ${manualLimit(active)} disponibles para ${active}.`:'';
 const banner=$('standComplete');banner.replaceChildren();banner.hidden=!active||c.cat<5;
 if(!banner.hidden){banner.append(node('strong','','¡Ya completaste tus cinco libros del catálogo!'));banner.append(node('p','','Puedes seguir explorando los libros de '+active+' y añadir hasta dos solicitudes manuales si no encontraste otros títulos.'));}
 const s=$('summary');s.replaceChildren();
 const stands=[...new Set([...savedThisVisit.map(x=>x.proveedor),...selectedStands()])];
 for(const stand of stands){
  const pending=[...chosen].filter(([,x])=>x.proveedor===stand);
  const saved=savedThisVisit.filter(x=>x.proveedor===stand);
  const d=node('div','summary-entry');
  d.append(node('strong','',`${stand}: ${counts(stand).cat} del catálogo · ${counts(stand).manual} manuales`));
  if(saved.length){d.append(node('p','summary-subheading','✓ Guardadas durante tu visita'));const ul=node('ul');for(const x of saved){const li=node('li','saved-item',x.titulo);li.append(node('span','saved-mark',' ✓ Guardado'));ul.append(li)}d.append(ul)}
  if(pending.length){d.append(node('p','summary-subheading','Por guardar'));const ul=node('ul');for(const [key,x] of pending){const li=node('li','',x.titulo+' '),b=node('button','remove','Quitar');b.type='button';b.onclick=()=>{chosen.delete(key);refresh();draw()};li.append(b);ul.append(li)}d.append(ul)}
  s.append(d);
 }
 if(!stands.length)s.append(node('p','muted','Todavía no has elegido ningún libro.'));
 const savedOther=Object.entries(savedByStand).filter(([stand,count])=>count>0&&!stands.includes(stand));
 if(savedOther.length){const p=node('p','muted','También tienes recomendaciones anteriores registradas en: '+savedOther.map(([stand,count])=>`${stand} (${count} de 5)`).join(', ')+'.');s.append(p)}
}


// Selector de temáticas accesible, desplegable y filtrable (sin dependencias externas).
let allTemas=[],temaOpen=false,temaActive=-1;
function closeTemas(){temaOpen=false;temaActive=-1;$('tematicasOpciones').hidden=true;$('temaFiltro').setAttribute('aria-expanded','false');$('temaDesplegar').setAttribute('aria-expanded','false');}
function filteredForFacets(exclude=''){
 const stand=$('proveedor').value,q=norm($('buscar').value),year=exclude==='anio'?'':$('anio').value,
  fmt=exclude==='formato'?'':$('formatoFiltro').value,theme=exclude==='tema'?'':norm($('temaFiltro').value);
 return catalog.filter(x=>stand&&x.proveedor===stand&&(!year||String(x.anio)===year)&&
  (!fmt||x.formato===fmt||x.formato==='Ambos')&&
  (!theme||norm(x.tematica||'').includes(theme)||norm(x.subtematica||'').includes(theme))&&
  (!q||norm(`${x.titulo} ${x.autor} ${x.anio} ${x.isbn}`).includes(q)));
}
function updateFacetOptions(){
 // Cada opción depende del stand, la búsqueda y los DEMÁS filtros, pero no de sí misma.
 const year=$('anio'),currentYear=year.value;
 const validYears=[...new Set(filteredForFacets('anio').map(x=>String(x.anio||'')).filter(y=>/^\d{4}$/.test(y)&&+y>=1450&&+y<=2100))].sort((a,b)=>b.localeCompare(a));
 year.replaceChildren();option(year,'','Todos los años');validYears.forEach(y=>option(year,y,y));
 year.value=validYears.includes(currentYear)?currentYear:'';
 const fmt=$('formatoFiltro'),currentFormat=fmt.value;
 const available=new Set(filteredForFacets('formato').flatMap(x=>x.formato==='Ambos'?['Físico','Digital']:[x.formato]));
 fmt.replaceChildren();option(fmt,'','Todos los formatos');
 for(const f of ['Físico','Digital'])if(available.has(f))option(fmt,f,f);
 fmt.value=available.has(currentFormat)?currentFormat:'';
}
function renderTemas(){
 const list=$('tematicasOpciones'),q=norm($('temaFiltro').value);
 const applicable=new Set(filteredForFacets('tema').flatMap(x=>[value(x.tematica),value(x.subtematica)]).filter(Boolean));
 const matches=[...applicable].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).filter(x=>!q||norm(x).includes(q));
 list.replaceChildren();temaActive=-1;
 if(!matches.length){const e=node('div','tema-empty','No hay temáticas coincidentes');list.append(e)}
 else for(const [i,t] of matches.entries()){
  const b=node('button','tema-option',t);b.type='button';b.setAttribute('role','option');b.id='tema-option-'+i;b.setAttribute('aria-selected',norm(t)===q?'true':'false');
  b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',()=>{ $('temaFiltro').value=t;closeTemas();filter();$('temaFiltro').focus(); });list.append(b);
 }
 list.hidden=false;temaOpen=true;$('temaFiltro').setAttribute('aria-expanded','true');$('temaDesplegar').setAttribute('aria-expanded','true');
}
function setupTemas(){
 const input=$('temaFiltro'),arrow=$('temaDesplegar');
 input.addEventListener('focus',renderTemas);
 input.addEventListener('input',()=>{renderTemas();filter()});
 arrow.addEventListener('click',()=>{if(temaOpen){closeTemas();}else{renderTemas();input.focus();}});
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closeTemas();return}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();if(!temaOpen)renderTemas();const opts=[...$('tematicasOpciones').querySelectorAll('[role="option"]')];if(!opts.length)return;
   temaActive=(temaActive+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length;
   opts.forEach((o,i)=>{o.classList.toggle('tema-active',i===temaActive);o.setAttribute('aria-selected',i===temaActive?'true':'false')});opts[temaActive].scrollIntoView({block:'nearest'});
   input.setAttribute('aria-activedescendant',opts[temaActive].id);
  }else if(e.key==='Enter'&&temaOpen&&temaActive>=0){e.preventDefault();$('tematicasOpciones').querySelectorAll('[role="option"]')[temaActive]?.click();}
 });
 document.addEventListener('pointerdown',e=>{if(!$('temaCombo').contains(e.target))closeTemas()});
}

function filter(){
 updateFacetOptions();
 filtered=filteredForFacets();page=0;draw();refresh();
 if(temaOpen)renderTemas();
}
function draw(){const grid=$('books');grid.replaceChildren();if(!$('proveedor').value){$('counter').textContent='Selecciona un stand para explorar sus libros.';$('pageInfo').textContent='';$('prev').disabled=true;$('next').disabled=true;return;}for(const x of filtered.slice(page*pageSize,(page+1)*pageSize)){const card=node('article','book');card.append(node('h2','',x.titulo),node('p','',x.autor||'Autor no informado'),node('p','provider',x.proveedor),node('p','',`Editorial: ${x.editorial||'No informada'}`),node('p','meta',`${x.anio||'Año no informado'} · ISBN: ${x.isbn||'No informado'}`));const active=chosen.has(x.id),b=node('button',active?'chosen':'',active?'✓ Me interesa':'Me interesa este libro');b.type='button';b.disabled=!canSelect()||completed||(!active&&!canAddCatalog(x.proveedor));if(!active&&!canAddCatalog(x.proveedor))b.textContent='Cupo de este stand completado';if(!canSelect())b.textContent='Verifica tu documento para elegir';b.onclick=async()=>{
 if(!canSelect()||!checkProfile())return;
 if(chosen.has(x.id)){chosen.delete(x.id);refresh();draw();return}
 if(!canAddCatalog(x.proveedor))return;
 let formato_preferido=null,interes_fisico_adicional=null;
 const preseleccion=$('formatoFiltro').value;
 if(x.formato==='Ambos' && preseleccion==='Físico'){formato_preferido='Físico';}
 else if((x.formato==='Ambos' && preseleccion==='Digital') || x.formato==='Digital'){
   formato_preferido='Digital';interes_fisico_adicional=await chooseDigitalExtra();if(interes_fisico_adicional===null)return;
 }else if(x.formato==='Ambos'){
   formato_preferido=await choosePreferredFormat();if(!formato_preferido)return;
   if(formato_preferido==='Digital'){interes_fisico_adicional=await chooseDigitalExtra();if(interes_fisico_adicional===null)return;}
 }else if(x.formato==='Físico'){formato_preferido='Físico'}
 if(!canSelect()||!canAddCatalog(x.proveedor))return;
 chosen.set(x.id,{tipo:'catalogo',id:x.id,titulo:x.titulo,proveedor:x.proveedor,formato_preferido,interes_fisico_adicional});
 refresh();draw();
 };card.append(b); if(x.formato==='Ambos')card.append(node('p','meta','Disponible en físico y digital'));else if(x.formato==='Digital')card.append(node('p','meta','Formato digital'));else if(x.formato==='Físico')card.append(node('p','meta','Formato físico'));grid.append(card)}$('counter').textContent=`${filtered.length} títulos encontrados`;const total=Math.ceil(filtered.length/pageSize);$('pageInfo').textContent=total?`Página ${page+1} de ${total}`:'No hay resultados';$('prev').disabled=page===0;$('next').disabled=page>=total-1}
$('proveedor').onchange=()=>{$('mProveedor').value=$('proveedor').value;$('anio').value='';$('formatoFiltro').value='';$('temaFiltro').value='';$('buscar').value='';closeTemas();filter()};$('buscar').oninput=filter;$('anio').onchange=filter;$('formatoFiltro').onchange=filter;setupTemas();$('limpiar').onclick=()=>{$('buscar').value='';$('anio').value='';$('formatoFiltro').value='';$('temaFiltro').value='';closeTemas();filter()};
$('prev').onclick=()=>{if(page){page--;draw();$('buscar').scrollIntoView({behavior:'smooth',block:'start'})}};$('next').onclick=()=>{if((page+1)*pageSize<filtered.length){page++;draw();$('buscar').scrollIntoView({behavior:'smooth',block:'start'})}};
let afterSaveNavigate=false;
function navigateStands(){ $('proveedor').value='';$('buscar').value='';filter();$('proveedor').focus();$('proveedor').scrollIntoView({behavior:'smooth',block:'center'}); }
$('another').onclick=()=>{
 if(sending)return;
 if(!chosen.size){navigateStands();return;}
 afterSaveNavigate=true;
 openReview();
};
$('manualForm').noValidate=true;
$('manualForm').onsubmit=e=>{
 e.preventDefault();const msg=$('manualMsg');msg.textContent='';
 if(completed){msg.textContent='Hay una participación guardada; continúa agregando libros hasta llegar al límite por stand.';return}
 if(!canSelect()){msg.textContent='Primero verifica tu documento de identidad al inicio de la página.';return}
 if(!checkProfile()){msg.textContent='Selecciona primero tu perfil y facultad o dependencia.';return}
 const stand=value($('mProveedor').value),titulo=value($('mTitulo').value),autor=value($('mAutor').value),anio=value($('mAnio').value),editorial=value($('mEditorial').value);
 if(!stand){msg.textContent='Selecciona el stand donde viste el libro.';$('mProveedor').focus();return}
 if(titulo.length<2){msg.textContent='Escribe el título (mínimo 2 caracteres).';$('mTitulo').focus();return}
 if(autor.length<2){msg.textContent='Escribe el autor (mínimo 2 caracteres).';$('mAutor').focus();return}
 if(anio && (!/^\d{4}$/.test(anio)||Number(anio)<1450||Number(anio)>2100)){msg.textContent='Ingresa un año de cuatro dígitos válido o déjalo vacío.';$('mAnio').focus();return}
 if(counts(stand).manual>=manualLimit(stand)){msg.textContent=`Has completado el cupo de solicitudes manuales de ${stand}.`;return}
 if([...chosen.values()].some(x=>x.tipo==='manual'&&x.proveedor===stand&&norm(x.titulo)===norm(titulo)&&norm(x.autor)===norm(autor)&&norm(x.editorial||'')===norm(editorial)&&String(x.anio||'').trim()===String(anio||'').trim())){msg.textContent='Este libro manual ya está entre tus favoritos de este stand.';return}
 const key='manual-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
 chosen.set(key,{tipo:'manual',titulo,autor,anio,editorial,proveedor:stand});
 $('mTitulo').value='';$('mAutor').value='';$('mAnio').value='';$('mEditorial').value='';
 msg.textContent=`✓ «${titulo}» agregado a ${stand}. Lo verás en «Tus favoritos por stand».`;
 refresh();draw();
};
function openReview(){
 if(!canSelect()){showVerify('Espera a que se comprueben tus recomendaciones antes de guardar.');$('documento').scrollIntoView({behavior:'smooth',block:'center'});return}
 if(!checkProfile())return;
 $('confirm').disabled=false;
 const doc=value($('documento').value);
 if(!/^[0-9]{5,15}$/.test(doc)){
  $('setupNotice').hidden=false;
  $('setupNotice').textContent='Ingresa tu documento de identidad al inicio (5 a 15 dígitos, sin puntos ni espacios) antes de guardar.';
  $('documento').focus();$('documento').scrollIntoView({behavior:'smooth',block:'center'});return;
 }
 const list=$('reviewList');list.replaceChildren();
 for(const stand of selectedStands()){
  const h=node('h3','',stand),ol=node('ol');
  for(const x of chosen.values())if(x.proveedor===stand)ol.append(node('li','',x.titulo));
  list.append(h,ol);
 }
 $('reviewProfile').textContent=`${$('perfil').value} · ${$('dependencia').value}`;
 $('confirmation').textContent='';
 $('confirm').textContent=afterSaveNavigate?'Guardar y descubrir otro stand':'Guardar mis recomendaciones';
 $('dialog').showModal();
}
$('review').onclick=()=>{afterSaveNavigate=false;openReview()};
$('close').onclick=()=>{afterSaveNavigate=false;$('dialog').close()};

$('documento').addEventListener('input',()=>{
 ++verifySeq;clearTimeout(verifyTimer);verifyStatus='idle';verifiedDocument='';savedByStand={};savedByStandTipo={};savedTotal=0;
 chosen.clear();savedThisVisit.length=0;
 showVerify('Comprobación pendiente...');refresh();draw();
 if(/^[0-9]{5,15}$/.test(value($('documento').value)))verifyTimer=setTimeout(verifyDocument,550);
});
$('documento').addEventListener('blur',()=>{if(/^[0-9]{5,15}$/.test(value($('documento').value))&&!canSelect())verifyDocument()});
$('reintentarConsulta').onclick=verifyDocument;
for(const id of ['perfil','dependencia']){$(id).addEventListener('change',()=>{sessionStorage.setItem('feria'+(id==='perfil'?'Perfil':'Dependencia'),$(id).value)})}
$('confirm').onclick=async()=>{if(sending||completed||!canSelect()||!checkProfile())return;const documento=value($('documento').value);if(!/^[0-9]{5,15}$/.test(documento)){$('confirmation').textContent='Escribe un número de documento válido de 5 a 15 dígitos, sin puntos ni espacios.';return}if(!$('consentimiento').checked){$('confirmation').textContent='Debes aceptar el uso del documento para el control de participación.';return}if(!configured){$('confirmation').textContent='La conexión a Supabase todavía no está configurada.';return}const selections=[...chosen.values()].map(x=>x.tipo==='catalogo'?{tipo:'catalogo',id:x.id,formato_preferido:x.formato_preferido,interes_fisico_adicional:x.interes_fisico_adicional}:{tipo:'manual',titulo:x.titulo,autor:x.autor,anio:x.anio,editorial:x.editorial,proveedor:x.proveedor});if(!selections.length)return;sending=true;$('confirm').disabled=true;$('confirmation').textContent='Guardando tus recomendaciones...';try{const res=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/registrar_voto_documento',{method:'POST',headers:{apikey:config.supabaseAnonKey,...(config.supabaseAnonKey.startsWith('sb_publishable_')?{}:{Authorization:'Bearer '+config.supabaseAnonKey}),'Content-Type':'application/json'},body:JSON.stringify({p_evento:config.eventId,p_documento:documento,p_perfil:$('perfil').value,p_dependencia:$('dependencia').value,p_elecciones:selections})});const raw=await res.text();let result;try{result=JSON.parse(raw)}catch{result={message:raw}}if(!res.ok)throw Error(result.message||'El servidor no pudo registrar los votos');savedByStand=result.por_stand||savedByStand;savedByStandTipo=result.por_stand_tipo||savedByStandTipo;savedTotal=result.total_votos||savedTotal;savedThisVisit.push(...[...chosen.values()].map(x=>({...x}))); $('confirmation').textContent=`¡Gracias! Guardamos ${selections.length} recomendaciones nuevas. Llevas ${savedTotal} en total. Pulsa Volver para seguir descubriendo libros.`;$('confirm').textContent='Guardar mis recomendaciones';$('close').hidden=false;$('confirm').disabled=true;chosen.clear();refresh();draw();if(afterSaveNavigate){$('dialog').close();afterSaveNavigate=false;navigateStands();$('manualMsg').textContent='Tus recomendaciones se guardaron correctamente. ¡Sigue descubriendo otros libros!';}}catch(e){$('confirmation').textContent='No pudimos guardar estas recomendaciones: '+e.message;$('confirm').disabled=false}finally{sending=false}};
if(!configured){$('setupNotice').hidden=false;$('setupNotice').textContent='El catálogo funciona, pero el registro real de votos está deshabilitado hasta configurar Supabase en config.js.';$('confirm').disabled=true}
const standAliases={'alpha':'Alpha Editorial','diaz de santos':'Ediciones Díaz de Santos','ecoe':'Ecoe Ediciones','el bibliotecologo':'El Bibliotecólogo','panamericana':'Editorial Médica Panamericana','tirant':'Tirant lo Blanch','trillas':'Editorial Trillas','cobag':'Cobag Libros'};
const canonicalStand=s=>standAliases[norm(s)]||s;
Promise.all([fetch('libros.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Error de catálogo');return r.json()}),fetch('stands.json').then(r=>r.json()),fetch('perfiles.json').then(r=>r.json())]).then(([books,stands,metadata])=>{catalog=books.map(x=>({...x,proveedor:canonicalStand(x.proveedor)}));const complete=[...new Set([...stands.map(canonicalStand),...catalog.map(x=>x.proveedor)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));complete.forEach(p=>{option($('proveedor'),p,p);option($('mProveedor'),p,p)});metadata.perfiles.forEach(x=>option($('perfil'),x,x));metadata.dependencias.forEach(x=>option($('dependencia'),x,x));$('perfil').value=sessionStorage.getItem('feriaPerfil')||'';$('dependencia').value=sessionStorage.getItem('feriaDependencia')||'';allTemas=[...new Set(books.flatMap(x=>[x.tematica,x.subtematica]).map(value).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));filter()}).catch(e=>{$('counter').textContent='No fue posible cargar el catálogo: '+e.message});


showVerify('Ingresa tu documento (5 a 15 dígitos) para comprobar tus recomendaciones.');
