 'use strict';
const $=id=>document.getElementById(id);
const chosen=new Map(); let catalog=[],filtered=[],page=0,sending=false,completed=false; let savedByStand={}, savedTotal=0; const savedThisVisit=[]; const MAX_POR_STAND=5,pageSize=8,config=window.FERIA_CONFIG||{};
const configured=(()=>{try{return new URL(config.supabaseUrl).protocol==='https:' && !!config.supabaseAnonKey && !config.supabaseAnonKey.startsWith('PEGAR')}catch{return false}})();
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();
const value=v=>String(v??'').trim();
function node(tag,cls,text){const a=document.createElement(tag);if(cls)a.className=cls;if(text!==undefined)a.textContent=text;return a}
function option(select,value,label){const o=node('option','',label);o.value=value;select.append(o)}
function countFor(stand){return [...chosen.values()].filter(x=>x.proveedor===stand).length+(savedByStand[stand]||0)}
function selectedStands(){return [...new Set([...chosen.values()].map(x=>x.proveedor))]}
function checkProfile(){if(!$('perfil').value||!$('dependencia').value){$('setupNotice').hidden=false;$('setupNotice').textContent='Para continuar, selecciona tu perfil y facultad o dependencia.';window.scrollTo({top:0,behavior:'smooth'});return false}return true}
function refresh(){
 $('nselected').textContent=chosen.size;
 $('nstands').textContent=selectedStands().length;
 $('review').disabled=!chosen.size||completed;
 const active=$('proveedor').value;
 const total=active?countFor(active):0;
 $('standHint').textContent=active?`${total} de ${MAX_POR_STAND} recomendaciones en ${active}`:'Puedes recomendar hasta cinco libros por editorial o distribuidor.';
 const banner=$('standComplete');
 banner.replaceChildren();banner.hidden=!active||total<MAX_POR_STAND;
 if(!banner.hidden){
   banner.append(node('strong','','¡Ya seleccionaste tus 5 libros favoritos!'));
   banner.append(node('p','','Tus recomendaciones para '+active+' quedaron registradas o están listas para guardar. ¡Gracias por ayudarnos a elegir los próximos libros de la Biblioteca!'));
   const confirmed=savedByStand[active]||0;
   banner.append(node('p','muted',confirmed===5?'5 de 5 recomendaciones guardadas':`${confirmed} guardadas · ${total-confirmed} pendientes de guardar`));
 }
 const s=$('summary');s.replaceChildren();
 const stands=[...new Set([...savedThisVisit.map(x=>x.proveedor),...selectedStands()])];
 for(const stand of stands){
  const pending=[...chosen].filter(([,x])=>x.proveedor===stand);
  const saved=savedThisVisit.filter(x=>x.proveedor===stand);
  const d=node('div','summary-entry');
  d.append(node('strong','',`${stand}: ${countFor(stand)} de ${MAX_POR_STAND} recomendaciones`));
  if(saved.length){d.append(node('p','summary-subheading','✓ Guardadas durante tu visita'));const ul=node('ul');for(const x of saved){const li=node('li','saved-item',x.titulo);li.append(node('span','saved-mark',' ✓ Guardado'));ul.append(li)}d.append(ul)}
  if(pending.length){d.append(node('p','summary-subheading','Por guardar'));const ul=node('ul');for(const [key,x] of pending){const li=node('li','',x.titulo+' '),b=node('button','remove','Quitar');b.type='button';b.onclick=()=>{chosen.delete(key);refresh();draw()};li.append(b);ul.append(li)}d.append(ul)}
  s.append(d);
 }
 if(!stands.length)s.append(node('p','muted','Todavía no has elegido ningún libro.'));
 const savedOther=Object.entries(savedByStand).filter(([stand,count])=>count>0&&!stands.includes(stand));
 if(savedOther.length){const p=node('p','muted','También tienes recomendaciones anteriores registradas en: '+savedOther.map(([stand,count])=>`${stand} (${count} de 5)`).join(', ')+'.');s.append(p)}
}

function filter(){const q=norm($('buscar').value),y=$('anio').value,stand=$('proveedor').value;filtered=catalog.filter(x=>(stand&&x.proveedor===stand)&&(!y||x.anio===y)&&(!q||norm(`${x.titulo} ${x.autor} ${x.anio} ${x.isbn}`).includes(q)));page=0;draw();refresh()}
function draw(){const grid=$('books');grid.replaceChildren();if(!$('proveedor').value){$('counter').textContent='Selecciona un stand para explorar sus libros.';$('pageInfo').textContent='';$('prev').disabled=true;$('next').disabled=true;return;}for(const x of filtered.slice(page*pageSize,(page+1)*pageSize)){const card=node('article','book');card.append(node('h2','',x.titulo),node('p','',x.autor||'Autor no informado'),node('p','provider',x.proveedor),node('p','',`Editorial: ${x.editorial||'No informada'}`),node('p','meta',`${x.anio||'Año no informado'} · ISBN: ${x.isbn||'No informado'}`));const active=chosen.has(x.id),b=node('button',active?'chosen':'',active?'✓ Me interesa':'Me interesa este libro');b.type='button';b.disabled=completed||(!active&&countFor(x.proveedor)>=MAX_POR_STAND);if(!active&&countFor(x.proveedor)>=MAX_POR_STAND)b.textContent='5 recomendaciones completadas';b.onclick=()=>{if(!checkProfile())return;if(chosen.has(x.id))chosen.delete(x.id);else if(countFor(x.proveedor)<MAX_POR_STAND)chosen.set(x.id,{tipo:'catalogo',id:x.id,titulo:x.titulo,proveedor:x.proveedor});refresh();draw()};card.append(b);grid.append(card)}$('counter').textContent=`${filtered.length} títulos encontrados`;const total=Math.ceil(filtered.length/pageSize);$('pageInfo').textContent=total?`Página ${page+1} de ${total}`:'No hay resultados';$('prev').disabled=page===0;$('next').disabled=page>=total-1}
$('proveedor').onchange=()=>{$('mProveedor').value=$('proveedor').value;filter()};$('buscar').oninput=filter;$('anio').onchange=filter;$('limpiar').onclick=()=>{$('buscar').value='';$('anio').value='';filter()};
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
 if(!checkProfile()){msg.textContent='Selecciona primero tu perfil y facultad o dependencia.';return}
 const stand=value($('mProveedor').value),titulo=value($('mTitulo').value),autor=value($('mAutor').value),anio=value($('mAnio').value),editorial=value($('mEditorial').value);
 if(!stand){msg.textContent='Selecciona el stand donde viste el libro.';$('mProveedor').focus();return}
 if(titulo.length<2){msg.textContent='Escribe el título (mínimo 2 caracteres).';$('mTitulo').focus();return}
 if(autor.length<2){msg.textContent='Escribe el autor (mínimo 2 caracteres).';$('mAutor').focus();return}
 if(anio && (!/^\d{4}$/.test(anio)||Number(anio)<1450||Number(anio)>2100)){msg.textContent='Ingresa un año de cuatro dígitos válido o déjalo vacío.';$('mAnio').focus();return}
 if(countFor(stand)>=MAX_POR_STAND){msg.textContent=`Ya recomendaste 5 libros en ${stand}. Puedes seguir explorando otros stands.`;return}
 if([...chosen.values()].some(x=>x.tipo==='manual'&&x.proveedor===stand&&norm(x.titulo)===norm(titulo)&&norm(x.autor)===norm(autor)&&norm(x.editorial||'')===norm(editorial)&&String(x.anio||'').trim()===String(anio||'').trim())){msg.textContent='Este libro manual ya está entre tus favoritos de este stand.';return}
 const key='manual-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2));
 chosen.set(key,{tipo:'manual',titulo,autor,anio,editorial,proveedor:stand});
 $('mTitulo').value='';$('mAutor').value='';$('mAnio').value='';$('mEditorial').value='';
 msg.textContent=`✓ «${titulo}» agregado a ${stand}. Lo verás en «Tus favoritos por stand».`;
 refresh();draw();
};
function openReview(){
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

$('documento').addEventListener('change',()=>{if(savedThisVisit.length||Object.keys(savedByStand).length){savedThisVisit.length=0;savedByStand={};savedTotal=0;chosen.clear();refresh();draw()}});
for(const id of ['perfil','dependencia']){$(id).addEventListener('change',()=>{sessionStorage.setItem('feria'+(id==='perfil'?'Perfil':'Dependencia'),$(id).value)})}
$('confirm').onclick=async()=>{if(sending||completed||!checkProfile())return;const documento=value($('documento').value);if(!/^[0-9]{5,15}$/.test(documento)){$('confirmation').textContent='Escribe un número de documento válido de 5 a 15 dígitos, sin puntos ni espacios.';return}if(!$('consentimiento').checked){$('confirmation').textContent='Debes aceptar el uso del documento para el control de participación.';return}if(!configured){$('confirmation').textContent='La conexión a Supabase todavía no está configurada.';return}const selections=[...chosen.values()].map(x=>x.tipo==='catalogo'?{tipo:'catalogo',id:x.id}:{tipo:'manual',titulo:x.titulo,autor:x.autor,anio:x.anio,editorial:x.editorial,proveedor:x.proveedor});if(!selections.length)return;sending=true;$('confirm').disabled=true;$('confirmation').textContent='Guardando tus recomendaciones...';try{const res=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/registrar_voto_documento',{method:'POST',headers:{apikey:config.supabaseAnonKey,...(config.supabaseAnonKey.startsWith('sb_publishable_')?{}:{Authorization:'Bearer '+config.supabaseAnonKey}),'Content-Type':'application/json'},body:JSON.stringify({p_evento:config.eventId,p_documento:documento,p_perfil:$('perfil').value,p_dependencia:$('dependencia').value,p_elecciones:selections})});const raw=await res.text();let result;try{result=JSON.parse(raw)}catch{result={message:raw}}if(!res.ok)throw Error(result.message||'El servidor no pudo registrar los votos');savedByStand=result.por_stand||savedByStand;savedTotal=result.total_votos||savedTotal;savedThisVisit.push(...[...chosen.values()].map(x=>({...x}))); $('confirmation').textContent=`¡Gracias! Guardamos ${selections.length} recomendaciones nuevas. Llevas ${savedTotal} en total. Pulsa Volver para seguir descubriendo libros.`;$('confirm').textContent='Guardar mis recomendaciones';$('close').hidden=false;$('confirm').disabled=true;chosen.clear();refresh();draw();if(afterSaveNavigate){$('dialog').close();afterSaveNavigate=false;navigateStands();$('manualMsg').textContent='Tus recomendaciones se guardaron correctamente. ¡Sigue descubriendo otros libros!';}}catch(e){$('confirmation').textContent='No pudimos guardar estas recomendaciones: '+e.message;$('confirm').disabled=false}finally{sending=false}};
if(!configured){$('setupNotice').hidden=false;$('setupNotice').textContent='El catálogo funciona, pero el registro real de votos está deshabilitado hasta configurar Supabase en config.js.';$('confirm').disabled=true}
const standAliases={'alpha':'Alpha Editorial','diaz de santos':'Ediciones Díaz de Santos','ecoe':'Ecoe Ediciones','el bibliotecologo':'El Bibliotecólogo','panamericana':'Editorial Médica Panamericana','tirant':'Tirant lo Blanch','trillas':'Editorial Trillas'};
const canonicalStand=s=>standAliases[norm(s)]||s;
Promise.all([fetch('libros.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Error de catálogo');return r.json()}),fetch('stands.json').then(r=>r.json()),fetch('perfiles.json').then(r=>r.json())]).then(([books,stands,metadata])=>{catalog=books.map(x=>({...x,proveedor:canonicalStand(x.proveedor)}));const complete=[...new Set([...stands.map(canonicalStand),...catalog.map(x=>x.proveedor)])].filter(Boolean).sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));complete.forEach(p=>{option($('proveedor'),p,p);option($('mProveedor'),p,p)});metadata.perfiles.forEach(x=>option($('perfil'),x,x));metadata.dependencias.forEach(x=>option($('dependencia'),x,x));$('perfil').value=sessionStorage.getItem('feriaPerfil')||'';$('dependencia').value=sessionStorage.getItem('feriaDependencia')||'';[...new Set(books.map(x=>x.anio).filter(Boolean))].sort().reverse().forEach(y=>option($('anio'),y,y));filter()}).catch(e=>{$('counter').textContent='No fue posible cargar el catálogo: '+e.message});

