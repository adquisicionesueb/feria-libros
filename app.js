'use strict';
const $=id=>document.getElementById(id);
const chosen=new Set();let catalog=[],filtered=[],page=0;const limit=18;
function normalize(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim()}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
function filter(){const q=normalize($('buscar').value),year=$('anio').value;filtered=catalog.filter(x=>(!year||x.anio===year)&&(!q||normalize(`${x.titulo} ${x.autor} ${x.isbn}`).includes(q)));page=0;draw()}
function draw(){const grid=$('books');grid.replaceChildren();const start=page*limit;for(const x of filtered.slice(start,start+limit)){
 const card=el('article','book'),title=el('h2','',x.titulo),author=el('p','',x.autor||'Autor no informado'),meta=el('p','meta',`${x.anio||'Año no informado'} · ISBN: ${x.isbn||'No informado'}`),b=el('button',chosen.has(x.id)?'chosen':'',chosen.has(x.id)?'✓ Seleccionado':'+ Elegir');
 b.type='button';b.disabled=chosen.size>=3&&!chosen.has(x.id);b.addEventListener('click',()=>{chosen.has(x.id)?chosen.delete(x.id):chosen.add(x.id);update();draw()});card.append(title,author,meta,b);grid.append(card)}
 $('counter').textContent=`${filtered.length} títulos encontrados`;const pages=Math.ceil(filtered.length/limit);$('pageInfo').textContent=pages?`Página ${page+1} de ${pages}`:'Sin resultados';$('prev').disabled=page===0;$('next').disabled=page>=pages-1}
function update(){$('nselected').textContent=chosen.size;$('review').disabled=chosen.size===0}
$('buscar').addEventListener('input',filter);$('anio').addEventListener('change',filter);$('limpiar').addEventListener('click',()=>{$('buscar').value='';$('anio').value='';filter()});
$('prev').addEventListener('click',()=>{if(page>0){page--;draw();window.scrollTo({top:300,behavior:'smooth'})}});$('next').addEventListener('click',()=>{if((page+1)*limit<filtered.length){page++;draw();window.scrollTo({top:300,behavior:'smooth'})}});
$('review').addEventListener('click',()=>{const items=catalog.filter(x=>chosen.has(x.id));$('reviewList').textContent=items.map((x,i)=>`${i+1}. ${x.titulo}`).join('\n');$('confirmation').textContent='';$('dialog').showModal()});
$('close').addEventListener('click',()=>$('dialog').close());$('confirm').addEventListener('click',()=>{$('confirmation').textContent='Prueba correcta: seleccionaste tus favoritos. NO se ha registrado un voto real.'});
fetch('libros.json').then(r=>{if(!r.ok)throw Error('No se pudo cargar el catálogo');return r.json()}).then(data=>{catalog=data;const years=[...new Set(data.map(x=>x.anio).filter(Boolean))].sort().reverse();for(const y of years){let o=el('option','',y);o.value=y;$('anio').append(o)}filter()}).catch(e=>{$('counter').textContent='Error al cargar el catálogo: '+e.message});
