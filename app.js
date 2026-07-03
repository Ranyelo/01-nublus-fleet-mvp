/* ===========================
   Nublus — Prototipo MVP
   Persistencia simple en localStorage
=========================== */
const $ = (q, ctx = document) => ctx.querySelector(q);
const $$ = (q, ctx = document) => Array.from(ctx.querySelectorAll(q));

const store = {
  get key(){ return 'nublus-demo-v1'; },
  load(){
    const raw = localStorage.getItem(this.key);
    return raw ? JSON.parse(raw) : { tenant: '', vehiculos: [], documentos: [], gastos: [] };
  },
  save(data){ localStorage.setItem(this.key, JSON.stringify(data)); },
  reset(){ localStorage.removeItem(this.key); }
};

let state = store.load();

/* ===== Navegación entre vistas ===== */
$$('.nav-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.nav-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    $$('.view').forEach(v=>v.classList.remove('visible'));
    $(`#view-${view}`).classList.add('visible');
    renderAll();
  });
});

/* ===== Tenant ===== */
$('#tenantName').value = state.tenant || '';
$('#saveTenant').addEventListener('click', ()=>{
  state.tenant = $('#tenantName').value.trim();
  store.save(state);
  alert('Tenant guardado.');
});

/* ===== Vehículos ===== */
const modalVehiculo = $('#modalVehiculo');
$('#btn-add-vehiculo').addEventListener('click', ()=> modalVehiculo.showModal());

$('#formVehiculo').addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const v = Object.fromEntries(fd.entries());
  v.placa = (v.placa || '').toUpperCase().trim();
  if(!v.placa){ return; }
  // Unicidad de placa por tenant
  if(state.vehiculos.some(x=>x.placa === v.placa)){
    alert('La placa ya existe en este tenant.');
    return;
  }
  v.createdAt = new Date().toISOString();
  state.vehiculos.push(v);
  store.save(state);
  e.target.reset();
  modalVehiculo.close();
  renderVehiculos();
  renderKPIs();
});

$('#searchVehiculo').addEventListener('input', renderVehiculos);

function renderVehiculos(){
  const q = ($('#searchVehiculo').value || '').toLowerCase().trim();
  const list = $('#vehiculosList');
  list.innerHTML = '';
  const data = state.vehiculos
    .filter(v => !q || Object.values(v).join(' ').toLowerCase().includes(q))
    .sort((a,b)=>a.placa.localeCompare(b.placa));
  if (!data.length){
    list.innerHTML = `<div class="placeholder"><p>No hay vehículos aún. Usa “Nuevo vehículo”.</p></div>`;
    return;
  }
  data.forEach(v=>{
    const docsStatus = computeDocStatusByPlaca(v.placa);
    const pill = statusPill(docsStatus);
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <h4>${v.placa} <span class="pill ${pill.cls}" title="${pill.title}">${pill.text}</span></h4>
      <p>${v.marca || '—'} ${v.modelo || ''} · ${v.clase || '—'}</p>
      <p>Línea: <strong>${v.linea || '—'}</strong> · Sede: <strong>${v.sede || '—'}</strong></p>
      <menu>
        <button class="btn ghost" data-act="doc" data-placa="${v.placa}">+ Doc</button>
        <button class="btn ghost" data-act="rm" data-placa="${v.placa}">Eliminar</button>
      </menu>
    `;
    list.appendChild(card);
  });

  // Delegación
  list.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if(!btn) return;
    const placa = btn.dataset.placa;
    if(btn.dataset.act === 'doc'){
      openDocModal(placa);
    }
    if(btn.dataset.act === 'rm'){
      if(confirm('¿Eliminar vehículo y sus documentos?')){
        state.vehiculos = state.vehiculos.filter(v=>v.placa !== placa);
        state.documentos = state.documentos.filter(d=>d.placa !== placa);
        store.save(state);
        renderAll();
      }
    }
  }, { once:true });
}

/* ===== Documentos ===== */
const modalDoc = $('#modalDoc');
function openDocModal(placa){
  modalDoc.showModal();
  $('#formDoc [name="placa"]').value = placa || '';
}
$('#btn-add-doc').addEventListener('click', ()=> openDocModal(''));

$('#formDoc').addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const d = Object.fromEntries(fd.entries());
  d.placa = (d.placa || '').toUpperCase().trim();
  if(!state.vehiculos.some(v=>v.placa === d.placa)){
    alert('La placa no existe. Cree el vehículo primero.');
    return;
  }
  // Validación mínima
  if(!d.numero || !d.emision || !d.vencimiento){
    alert('Número, Emisión y Vencimiento son obligatorios.');
    return;
  }
  d.emision = new Date(d.emision).toISOString();
  d.vencimiento = new Date(d.vencimiento).toISOString();
  d.estado = computeDocEstado(d.vencimiento);
  d.tipo = d.tipo || 'OTRO';
  d.id = 'DOC-' + Math.random().toString(36).slice(2,8).toUpperCase();
  d.createdAt = new Date().toISOString();

  state.documentos.push(d);
  store.save(state);
  e.target.reset();
  modalDoc.close();
  renderDocs();
  renderAlertas();
  renderKPIs();
});

$('#docFilter').addEventListener('change', renderDocs);

function computeDocEstado(vencISO){
  const today = new Date();
  const venc = new Date(vencISO);
  const diff = Math.ceil((venc - today) / (1000*60*60*24));
  if(diff < 0) return 'vencido';
  if(diff <= 30) return 'proximo';
  return 'vigente';
}

function statusPill(status){
  if(status==='vencido') return {text:'VENCIDO', cls:'danger', title:'Al menos un documento está vencido'};
  if(status==='proximo') return {text:'≤30d', cls:'warn', title:'Un documento vence en los próximos 30 días'};
  return {text:'OK', cls:'ok', title:'Documentación al día'};
}

function computeDocStatusByPlaca(placa){
  const docs = state.documentos.filter(d=>d.placa===placa);
  let hasVenc=false, hasProx=false;
  docs.forEach(d=>{
    const st = computeDocEstado(d.vencimiento);
    if(st==='vencido') hasVenc=true;
    else if(st==='proximo') hasProx=true;
  });
  return hasVenc ? 'vencido' : (hasProx ? 'proximo' : 'vigente');
}

function renderDocs(){
  const tbody = $('#docsTable tbody');
  tbody.innerHTML = '';
  const filter = $('#docFilter').value;
  // orden por fecha de vencimiento asc
  const rows = state.documentos
    .slice()
    .sort((a,b)=> new Date(a.vencimiento) - new Date(b.vencimiento))
    .filter(d=> filter==='all' ? true : d.estado===filter);

  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="8" style="color:#8ea1c4">No hay documentos para el filtro.</td></tr>`;
    return;
  }

  rows.forEach(d=>{
    const estado = statusPill(d.estado);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${d.placa}</td>
      <td>${d.tipo}</td>
      <td>${d.numero}</td>
      <td>${d.emisor || '—'}</td>
      <td>${fmtDate(d.emision)}</td>
      <td>${fmtDate(d.vencimiento)}</td>
      <td><span class="pill ${estado.cls}">${estado.text}</span></td>
      <td><button class="btn ghost" data-id="${d.id}">Eliminar</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if(!btn) return;
    const id = btn.dataset.id;
    state.documentos = state.documentos.filter(x=>x.id !== id);
    store.save(state);
    renderAll();
  }, { once:true });
}

/* ===== Alertas ===== */
$('#alertRange').addEventListener('change', renderAlertas);

function renderAlertas(){
  const days = parseInt($('#alertRange').value,10);
  const wrap = $('#alertasList');
  wrap.innerHTML = '';

  const today = new Date();
  const items = state.documentos
    .filter(d=>{
      const diff = Math.ceil((new Date(d.vencimiento) - today)/(1000*60*60*24));
      return diff >= 0 && diff <= days;
    })
    .sort((a,b)=> new Date(a.vencimiento)-new Date(b.vencimiento));

  if(!items.length){
    wrap.innerHTML = `<div class="placeholder"><p>Sin alertas en ≤ ${days} días.</p></div>`;
    return;
  }

  items.forEach(d=>{
    const diff = Math.ceil((new Date(d.vencimiento) - today)/(1000*60*60*24));
    const card = document.createElement('article');
    const pill = diff<=7 ? 'danger' : (diff<=15 ? 'warn' : 'ok');
    const pillText = diff + 'd';
    card.className = 'card';
    card.innerHTML = `
      <h4>${d.tipo} · ${d.placa} <span class="pill ${pill}">${pillText}</span></h4>
      <p>Vence: <strong>${fmtDate(d.vencimiento)}</strong> — Emisor: ${d.emisor || '—'}</p>
      <menu><button class="btn ghost" data-placa="${d.placa}" data-act="ir-docs">Ver en Documentos</button></menu>
    `;
    wrap.appendChild(card);
  });

  wrap.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button');
    if(!btn) return;
    const viewBtn = [...$$('.nav-btn')].find(b=>b.dataset.view==='documentos');
    viewBtn?.click();
  }, { once:true });
}

/* ===== Reportes (KPIs) ===== */
function renderKPIs(){
  const totalVeh = state.vehiculos.length;
  const docs = state.documentos;
  const vig = docs.filter(d=> computeDocEstado(d.vencimiento)==='vigente').length;
  const ven = docs.filter(d=> computeDocEstado(d.vencimiento)==='vencido').length;
  const soon = docs.filter(d=> computeDocEstado(d.vencimiento)==='proximo').length;

  $('#kpiVehiculos').textContent = totalVeh;
  $('#kpiDocsVig').textContent = vig;
  $('#kpiDocsVenc').textContent = ven;
  $('#kpiDocs30').textContent = soon;
}

/* ===== Gastos (mock modal) ===== */
const modalGasto = $('#modalGasto');
$('#btn-add-gasto').addEventListener('click', ()=> modalGasto.showModal());
$('#formGasto').addEventListener('submit', (e)=>{
  e.preventDefault();
  const fd = new FormData(e.target);
  const g = Object.fromEntries(fd.entries());
  g.id = 'GST-' + Math.random().toString(36).slice(2,8).toUpperCase();
  state.gastos.push(g);
  store.save(state);
  e.target.reset();
  modalGasto.close();
  alert('Gasto registrado (mock).');
});

/* ===== Exportaciones (mock CSV) ===== */
$('#btn-export').addEventListener('click', ()=>{
  const rows = [
    ['KPI','Valor'],
    ['Vehículos', state.vehiculos.length],
    ['Docs vigentes', $('#kpiDocsVig').textContent],
    ['Docs vencidos', $('#kpiDocsVenc').textContent],
    ['Docs ≤30 días', $('#kpiDocs30').textContent],
  ];
  const csv = rows.map(r=>r.join(',')).join('\n');
  downloadFile('reporte_nublus.csv', csv, 'text/csv');
});

/* ===== Help ===== */
const modalHelp = $('#modalHelp');
$('#btn-open-help').addEventListener('click', ()=> modalHelp.showModal());
$('#closeHelp').addEventListener('click', ()=> modalHelp.close());

/* ===== Utilidades ===== */
function fmtDate(iso){
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-CO', { year:'numeric', month:'2-digit', day:'2-digit' });
}
function downloadFile(name, content, type='text/plain'){
  const blob = new Blob([content], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ===== Render inicial ===== */
function renderAll(){
  renderVehiculos();
  renderDocs();
  renderAlertas();
  renderKPIs();
}
renderAll();