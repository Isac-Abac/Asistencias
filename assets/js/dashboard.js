const userInfo = document.getElementById('userInfo');
const adminModule = document.getElementById('adminModule');
const teacherModule = document.getElementById('teacherModule');
const studentModule = document.getElementById('studentModule');
const controlModule = document.getElementById('controlModule');
const themeToggleBtn = document.getElementById('themeToggleBtn');

let usersCache = [];
let classesCache = [];
let gradesCache = [];
let myStudentsCache = [];
let todayReportsByStudent = new Set();
let scannerStarted = false;
let currentUser = null;
let controlInfoTimer = null;
let controlScanCooldown = false;
const HORARIOS = ['07:30-08:10','08:10-08:50','08:50-09:30','09:30-10:05','10:45-11:20','11:20-11:55','11:55-12:30'];
const DIAS = ['Lunes','Martes','Miercoles','Jueves','Viernes'];

const GRADOS = ['1ro','2do','3ro','4to','5to','6to'];
const NIVELES = ['Primaria','Basico','Diversificado'];
const SECCIONES = ['A','B','C','D'];

const alertOk = (text) => Swal.fire({ icon: 'success', title: 'Correcto', text });
const alertErr = (text) => Swal.fire({ icon: 'error', title: 'Error', text });

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? '\u263C Modo claro' : '\u263E Modo oscuro';
    themeToggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}

function animateAdminView(view) {
  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.fromTo(`#adminView-${view}`, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' });
}

function initGsapDashboard() {
  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.from('.topbar', { y: -26, opacity: 0, duration: 0.5, ease: 'power2.out' });
  gsap.from('.layout > .card', { y: 18, opacity: 0, duration: 0.46, stagger: 0.06, ease: 'power2.out' });

  const cards = document.querySelectorAll('.card');
  cards.forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const dx = ((e.clientX - r.left) / r.width - 0.5) * 6;
      const dy = ((e.clientY - r.top) / r.height - 0.5) * 6;
      gsap.to(card, { x: dx, y: dy, duration: 0.25, overwrite: 'auto', ease: 'power1.out' });
    });
    card.addEventListener('mouseleave', () => {
      gsap.to(card, { x: 0, y: 0, duration: 0.35, ease: 'power2.out' });
    });
  });
}
async function api(url, options = {}) {
  const r = await fetch(url, options);
  const t = await r.text();
  try { return JSON.parse(String(t).replace(/^\uFEFF/, '').trim()); }
  catch { return { ok: false, message: `Respuesta invalida en ${url}` }; }
}

function sanitizeLetters(v) { return v.replace(/[^\p{L}\s]/gu, ''); }
function splitName(full) { const p = String(full || '').trim().split(/\s+/).filter(Boolean); return { nombres: p.slice(0, -1).join(' ') || (p[0] || ''), apellidos: p.slice(-1).join(' ') || '' }; }
function genUserPreview(nombres, apellidos) { const n=(nombres||'').trim(); const a=(apellidos||'').trim(); if(!n||!a) return ''; return `${n[0].toLowerCase()}${a.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g,'')}-${String(Math.floor(Math.random()*100000)).padStart(5,'0')}`; }
function calcAge(dateStr) { if(!dateStr) return ''; const b=new Date(dateStr+'T00:00:00'); const t=new Date(); let e=t.getFullYear()-b.getFullYear(); const m=t.getMonth()-b.getMonth(); if(m<0||(m===0&&t.getDate()<b.getDate())) e--; return e>=0?e:''; }
function dateISO(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function todayMinusYears(years){ const d=new Date(); d.setFullYear(d.getFullYear()-years); return d; }
function setBirthDateLimits(){
  const alumnoFecha = document.getElementById('alumnoFechaNac');
  const docenteFecha = document.getElementById('docenteFechaNac');
  const minDate = '1900-01-01';
  const alumnoMax = dateISO(todayMinusYears(7));
  const docenteMax = dateISO(todayMinusYears(18));
  if (alumnoFecha) { alumnoFecha.min = minDate; alumnoFecha.max = alumnoMax; }
  if (docenteFecha) { docenteFecha.min = minDate; docenteFecha.max = docenteMax; }
}
function validateBirthInput(inputEl, minAge, label){
  if (!inputEl || !inputEl.value) return true;
  const v = inputEl.value;
  const today = new Date();
  const birth = new Date(v + 'T00:00:00');
  const maxDate = todayMinusYears(minAge);
  if (isNaN(birth.getTime()) || birth > today || birth > maxDate) {
    inputEl.value = '';
    const ageEl = label === 'alumno' ? document.getElementById('alumnoEdad') : document.getElementById('docenteEdad');
    if (ageEl) ageEl.value = '';
    Swal.fire({
      icon: 'warning',
      title: 'Fecha invalida',
      text: `Para ${label}, la fecha debe ser anterior o igual a ${dateISO(maxDate)} y no puede ser futura.`
    });
    return false;
  }
  return true;
}

function resetAdminViewFields() {
  const forms = ['adminCreateUserForm', 'adminGradeForm', 'adminClassForm', 'reportForm'];
  forms.forEach((id) => {
    const form = document.getElementById(id);
    if (form) form.reset();
  });
  const userSearch = document.getElementById('userSearchName');
  if (userSearch) userSearch.value = '';
  toggleRoleFields();
  toggleGradeFields();
  setBirthDateLimits();
  setReportDateLimit();
  updateAdminReportFilters();
}

function switchAdminView(view){ resetAdminViewFields(); document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('active',b.dataset.adminView===view)); document.querySelectorAll('.admin-view').forEach(v=>v.classList.toggle('hidden',v.id!==`adminView-${view}`)); animateAdminView(view); }
function animateTeacherView(view) {
  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.fromTo(`#teacherView-${view}`, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' });
}
function switchTeacherView(view){
  document.querySelectorAll('.teacher-tab').forEach(b=>b.classList.toggle('active',b.dataset.teacherView===view));
  document.querySelectorAll('.teacher-view').forEach(v=>{
    const active = v.id===`teacherView-${view}`;
    v.classList.toggle('hidden', !active);
    v.classList.toggle('view-anim', active);
  });
  animateTeacherView(view);
  if (view === 'attendances') loadTeacherAttendances();
}
function switchStudentView(view){
  document.querySelectorAll('[data-student-view]').forEach(b=>b.classList.toggle('active',b.dataset.studentView===view));
  document.querySelectorAll('#studentModule .teacher-view').forEach(v=>v.classList.toggle('hidden', v.id!==`studentView-${view}`));
}
function fillSimpleSelect(id,list,placeholder){ const el=document.getElementById(id); if(!el) return; el.innerHTML=`<option value="">${placeholder}</option>`; list.forEach(v=>{const op=document.createElement('option'); op.value=v; op.textContent=v; el.appendChild(op);}); }

function teacherHasAssignedGrade(userId){
  return gradesCache.some((g) => Number(g.docente_guia_id || 0) === Number(userId));
}
async function teacherHasAssignedGradeLive(userId){
  const r = await api('api/grades.php');
  if(!r.ok || !Array.isArray(r.data)) return false;
  gradesCache = r.data;
  return r.data.some((g) => Number(g.docente_guia_id || 0) === Number(userId));
}
function renderUsers(){
  const q=(document.getElementById('userSearchName')?.value||'').toLowerCase().trim();
  const data=q?usersCache.filter(u=>(u.nombre||'').toLowerCase().includes(q)):usersCache;
  const tb=document.querySelector('#usersTable tbody');
  if(!tb) return;
  tb.innerHTML='';
  data.forEach(u=>{
    const isTeacher = u.rol === 'docente';
    const canCredential =
      u.rol === 'alumno' ||
      u.rol === 'estudiante' ||
      (isTeacher && teacherHasAssignedGrade(u.id));
    const credBtn = canCredential ? `<button data-cred="${u.id}">Credencial</button>` : '';
    const delBtn = (u.rol === 'admin' || u.rol === 'control') ? '' : `<button data-del="${u.id}">Eliminar</button>`;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${u.id}</td><td>${u.nombre}</td><td><button class="link-btn" data-qr="${u.id}">${u.username||''}</button></td><td>${u.email}</td><td>${u.rol}</td><td class="actions"><button data-edit="${u.id}">Editar</button>${delBtn}${credBtn}</td>`;
    tb.appendChild(tr);
  });
}

async function showUserQr(user){ const qrId='qrUserBox'; await Swal.fire({ title:`QR de ${user.username}`, html:`<div id="${qrId}" style="display:flex;justify-content:center;margin:8px 0"></div><button id="saveQrBtn" class="swal2-confirm swal2-styled" style="margin-top:8px">Guardar</button>`, showConfirmButton:false, didOpen:()=>{ const box=document.getElementById(qrId); box.innerHTML=''; new QRCode(box,{text:user.qr_payload||JSON.stringify(user),width:220,height:220}); document.getElementById('saveQrBtn').addEventListener('click',()=>{ const img=box.querySelector('img')||box.querySelector('canvas'); if(!img) return; const url=img.tagName.toLowerCase()==='img'?img.src:img.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download=`${user.username||'usuario'}-qr.png`; a.click();}); }}); }
async function buildQrDataUrl(text, size = 170) {
  const temp = document.createElement('div');
  temp.style.position = 'fixed';
  temp.style.left = '-9999px';
  document.body.appendChild(temp);
  new QRCode(temp, { text, width: size, height: size });
  await new Promise((r) => setTimeout(r, 60));
  const el = temp.querySelector('canvas') || temp.querySelector('img');
  const url = !el ? '' : (el.tagName.toLowerCase()==='canvas' ? el.toDataURL('image/png') : el.src);
  temp.remove();
  return url;
}
async function downloadCredential(user){
  if (!window.jspdf || !window.jspdf.jsPDF) return alertErr('No se pudo cargar generador de PDF');
  const qrText = user.qr_payload || JSON.stringify(user);
  const qrUrl = await buildQrDataUrl(qrText, 380);
  if (!qrUrl) return alertErr('No se pudo generar el QR de la credencial');
  let credNivel = user.nivel || '-';
  let credGrado = user.grado || '-';
  let credSeccion = user.seccion || '-';
  if (user.rol === 'docente') {
    const g = gradesCache.find((x) => Number(x.docente_guia_id || 0) === Number(user.id));
    if (g) {
      credNivel = g.nivel || '-';
      credGrado = g.grado_mostrar || g.nombre || '-';
      credSeccion = g.seccion || '-';
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 2000;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  if (!ctx) return alertErr('No se pudo crear la credencial');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 8;
  ctx.strokeRect(10,10,canvas.width-20,canvas.height-20);

  ctx.strokeStyle = '#16a34a';
  ctx.lineWidth = 6;
  const qrBox = { x: 90, y: 190, w: 640, h: 640 };
  ctx.beginPath(); ctx.roundRect(qrBox.x, qrBox.y, qrBox.w, qrBox.h, 42); ctx.stroke();

  ctx.strokeStyle = '#1d4ed8';
  const infoBox = { x: 900, y: 190, w: 980, h: 640 };
  ctx.beginPath(); ctx.roundRect(infoBox.x, infoBox.y, infoBox.w, infoBox.h, 42); ctx.stroke();

  const qrImg = new Image();
  await new Promise((resolve,reject)=>{ qrImg.onload=resolve; qrImg.onerror=reject; qrImg.src=qrUrl; }).catch(()=>null);
  if (qrImg.width) ctx.drawImage(qrImg, qrBox.x + 8, qrBox.y + 8, qrBox.w - 16, qrBox.h - 16);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 68px Segoe UI';
  ctx.fillText('CREDENCIAL', 90, 120);
  ctx.font = 'bold 40px Segoe UI';
  ctx.fillText(user.rol?.toUpperCase() || 'USUARIO', 1520, 120);

  const lines = user.rol === 'docente'
    ? [
        `Nombre: ${user.nombre || ''}`,
        `Nivel: ${credNivel}`,
        `Grado: ${credGrado}`,
        `Seccion: ${credSeccion}`
      ]
    : [
        `Nombre: ${user.nombre || ''}`,
        `Nivel: ${credNivel}`,
        `Grado: ${credGrado}`,
        `Seccion: ${credSeccion}`,
        `Ciclo escolar: ${user.ciclo_escolar || '-'}`
      ];
  ctx.fillStyle = '#1e293b';
  ctx.font = '44px Segoe UI';
  let textY = infoBox.y + 110;
  lines.forEach((line) => { ctx.fillText(line, infoBox.x + 40, textY); textY += 106; });

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const imgData = canvas.toDataURL('image/png');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const credW = 100; // 10 cm
  const credH = 50;  // 5 cm
  const x = (pageW - credW) / 2;
  const yPos = (pageH - credH) / 2;
  pdf.addImage(imgData, 'PNG', x, yPos, credW, credH, undefined, 'FAST');
  pdf.save(`credencial-${user.username||user.id}.pdf`);
  alertOk('Credencial PDF descargada en carta (credencial 10x5 cm)');
}

function renderGrades(){
  const tb=document.querySelector('#gradesTable tbody');
  if(!tb) return;
  tb.innerHTML='';
  gradesCache.forEach(g=>{
    const total = Number(g.cupos ?? 0);
    const disp = Number(g.cupos_disponibles ?? total);
    const cuposTxt = `${disp}/${total}`;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${g.id}</td><td>${g.nivel||''}</td><td>${g.grado_mostrar||g.nombre||''}</td><td>${g.seccion||''}</td><td>${cuposTxt}</td><td>${g.docente_guia||''}</td>`;
    tb.appendChild(tr);
  });
}
function updateAlumnoGradoSeccion() {
  const nivel = document.getElementById('alumnoNivel')?.value || '';
  const gradoSel = document.getElementById('alumnoGrado');
  const seccionSel = document.getElementById('alumnoSeccion');
  const cuposInp = document.getElementById('alumnoCuposDisp');
  if (!gradoSel || !seccionSel) return;

  const prevGrado = gradoSel.value;
  gradoSel.innerHTML = '<option value="">Nombre de grado</option>';
  if (nivel) {
    const grados = [...new Set(gradesCache.filter(g => g.nivel === nivel).map(g => g.nombre))];
    grados.forEach(g => { const op=document.createElement('option'); op.value=g; op.textContent=g; gradoSel.appendChild(op); });
    if (grados.includes(prevGrado)) gradoSel.value = prevGrado;
  }

  const grado = gradoSel.value;
  const prevSec = seccionSel.value;
  seccionSel.innerHTML = '<option value="">Seccion</option>';
  if (nivel && grado) {
    const secs = [...new Set(gradesCache.filter(g => g.nivel === nivel && g.nombre === grado).map(g => String(g.seccion || '').toUpperCase()))].sort();
    secs.forEach(s => { const op=document.createElement('option'); op.value=s; op.textContent=s; seccionSel.appendChild(op); });
    if (secs.includes(prevSec)) seccionSel.value = prevSec;
  }

  const sec = seccionSel.value;
  if (cuposInp) {
    const row = gradesCache.find(g => g.nivel === nivel && g.nombre === grado && String(g.seccion || '').toUpperCase() === String(sec || '').toUpperCase());
    cuposInp.value = row ? (row.cupos_disponibles ?? '') : '';
  }
}
function updateClassSecciones(){
  const classSeccion=document.getElementById('classSeccion');
  const nivelSel = document.getElementById('classNivel')?.value || '';
  const gradoSel = document.getElementById('classGrado')?.value || '';
  if (!classSeccion) return;
  classSeccion.innerHTML = '<option value="">Seccion</option>';
  if (gradesCache.length && nivelSel && gradoSel) {
    const secs = [...new Set(
      gradesCache
        .filter(g => g.nivel === nivelSel && g.nombre === gradoSel)
        .map(g => String(g.seccion || '').trim().toUpperCase())
        .filter(Boolean)
    )].sort();
    secs.forEach(s => { const op=document.createElement('option'); op.value=s; op.textContent=s; classSeccion.appendChild(op); });
  }
  updateHorarioLocks();
}

function updateHorarioLocks() {
  const selHorario = document.getElementById('classHorario');
  if (!selHorario) return;
  const nivel = document.getElementById('classNivel')?.value || '';
  const grado = document.getElementById('classGrado')?.value || '';
  const seccion = (document.getElementById('classSeccion')?.value || '').toUpperCase();
  const dia = document.getElementById('classDia')?.value || '';

  const ocupadas = new Set(
    classesCache
      .filter(c =>
        (!nivel || c.nivel === nivel) &&
        (!grado || c.grado === grado) &&
        (!seccion || String(c.seccion || '').toUpperCase() === seccion) &&
        (!dia || c.dia === dia)
      )
      .map(c => String(c.horario || '').trim())
      .filter(Boolean)
  );

  [...selHorario.options].forEach((opt) => {
    if (!opt.value) return;
    opt.disabled = ocupadas.has(opt.value);
  });
}

function renderAssignBoard() {
  const titleEl = document.getElementById('assignBoardTitle');
  const thead = document.querySelector('#assignBoardTable thead');
  const tbody = document.querySelector('#assignBoardTable tbody');
  if (!titleEl || !thead || !tbody) return;

  const nivel = document.getElementById('classNivel')?.value || '';
  const grado = document.getElementById('classGrado')?.value || '';
  const seccion = (document.getElementById('classSeccion')?.value || '').toUpperCase();

  titleEl.textContent = (nivel && grado && seccion)
    ? `${grado} - Seccion ${seccion} (${nivel})`
    : 'Horario del grado';

  thead.innerHTML = `<tr><th>Dia</th>${HORARIOS.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  tbody.innerHTML = '';

  DIAS.forEach((dia) => {
    const tr = document.createElement('tr');
    let row = `<td>${dia}</td>`;
    HORARIOS.forEach((hora) => {
      const cls = classesCache.find(c =>
        c.nivel === nivel &&
        c.grado === grado &&
        String(c.seccion || '').toUpperCase() === seccion &&
        c.dia === dia &&
        c.horario === hora
      );
      row += cls
        ? `<td class="course-filled">${cls.nombre}</td>`
        : '<td>-</td>';
    });
    tr.innerHTML = row;
    tbody.appendChild(tr);
  });
}

function hasGradeByNivel(nivel, grado) {
  return gradesCache.some((g) => {
    if (g.nivel !== nivel) return false;
    const val = nivel === 'Primaria' ? (g.grado_primaria || g.nombre) : (g.grado_basico || g.nombre);
    return String(val || '').toLowerCase() === String(grado || '').toLowerCase();
  });
}

function hasAvailableSlotsInGrade(nivel, grado) {
  return gradesCache.some((g) => {
    if (g.nivel !== nivel) return false;
    const val =
      nivel === 'Primaria' ? (g.grado_primaria || g.nombre) :
      nivel === 'Basico' ? (g.grado_basico || g.nombre) :
      (g.grado_diversificado || g.nombre);
    if (String(val || '').toLowerCase() !== String(grado || '').toLowerCase()) return false;
    return Number(g.cupos_disponibles ?? 0) > 0;
  });
}

function getAvailableSlotsInGrade(nivel, grado) {
  let total = 0;
  gradesCache.forEach((g) => {
    if (g.nivel !== nivel) return;
    const val =
      nivel === 'Primaria' ? (g.grado_primaria || g.nombre) :
      nivel === 'Basico' ? (g.grado_basico || g.nombre) :
      (g.grado_diversificado || g.nombre);
    if (String(val || '').toLowerCase() !== String(grado || '').toLowerCase()) return;
    total += Number(g.cupos_disponibles ?? 0);
  });
  return total;
}

function hasGradeByCarrera(grado, carrera) {
  const car = String(carrera || '').trim().toLowerCase();
  return gradesCache.some((g) =>
    g.nivel === 'Diversificado' &&
    String(g.grado_diversificado || '').toLowerCase() === String(grado || '').toLowerCase() &&
    String(g.carrera || '').trim().toLowerCase() === car
  );
}

function updateGradeLocks() {
  const sec = document.getElementById('gradeSeccion')?.value || '';
  const carrera = document.getElementById('gradeCarrera')?.value || '';
  const prim = ['1ro primaria','2do primaria','3ro primaria','4to primaria','5to primaria','6to primaria'];
  const bas = ['1ro basico','2do basico','3ro basico'];
  const div = ['4to diversificado','5to diversificado','6to diversificado'];

  const lockSequence = (selectId, list, existsPrev, nivel) => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    [...sel.options].forEach((opt, idx) => {
      if (!opt.value) return;
      if (!opt.dataset.baseText) opt.dataset.baseText = opt.textContent;
      const openSlots = getAvailableSlotsInGrade(nivel, opt.value);
      const hasOpenSlots = openSlots > 0;
      if (idx === 1) {
        opt.disabled = hasOpenSlots;
        opt.textContent = hasOpenSlots ? `${opt.dataset.baseText} (No disponible, ${openSlots} cupos)` : opt.dataset.baseText;
        return;
      }
      const available = existsPrev(list[idx - 2]);
      opt.disabled = !available || hasOpenSlots;
      opt.textContent = (!available || hasOpenSlots) ? `${opt.dataset.baseText} (No disponible, ${openSlots} cupos)` : opt.dataset.baseText;
    });
  };

  lockSequence('gradePrimaria', prim, (prev) => hasGradeByNivel('Primaria', prev), 'Primaria');
  lockSequence('gradeBasico', bas, (prev) => hasGradeByNivel('Basico', prev), 'Basico');
  lockSequence('gradeDiversificado', div, (prev) => hasGradeByCarrera(prev, carrera), 'Diversificado');
}

function setReportDateLimit() {
  const repFecha = document.getElementById('repFecha');
  if (!repFecha) return;
  repFecha.max = dateISO(new Date());
}

function updateAdminReportFilters() {
  const repNivel = document.getElementById('repNivel');
  const repGrado = document.getElementById('repGrado');
  const repSeccion = document.getElementById('repSeccion');
  const repAlumno = document.getElementById('repAlumno');
  if (!repNivel || !repGrado || !repSeccion || !repAlumno) return;

  const prevNivel = repNivel.value;
  const niveles = [...new Set(gradesCache.map(g => g.nivel).filter(Boolean))];
  repNivel.innerHTML = '<option value="">Nivel</option>';
  niveles.forEach(n => { const op=document.createElement('option'); op.value=n; op.textContent=n; repNivel.appendChild(op); });
  if (niveles.includes(prevNivel)) repNivel.value = prevNivel;

  const nivel = repNivel.value;
  const prevGrado = repGrado.value;
  repGrado.innerHTML = '<option value="">Grado</option>';
  if (nivel) {
    const grados = [...new Set(gradesCache.filter(g => g.nivel === nivel).map(g => g.nombre).filter(Boolean))];
    grados.forEach(g => { const op=document.createElement('option'); op.value=g; op.textContent=g; repGrado.appendChild(op); });
    if (grados.includes(prevGrado)) repGrado.value = prevGrado;
  }

  const grado = repGrado.value;
  const prevSec = repSeccion.value;
  repSeccion.innerHTML = '<option value="">Seccion</option>';
  if (nivel && grado) {
    const secciones = [...new Set(
      gradesCache
        .filter(g => g.nivel === nivel && g.nombre === grado)
        .map(g => String(g.seccion || '').trim().toUpperCase())
        .filter(Boolean)
    )].sort();
    secciones.forEach(s => { const op=document.createElement('option'); op.value=s; op.textContent=s; repSeccion.appendChild(op); });
    if (secciones.includes(prevSec)) repSeccion.value = prevSec;
  }

  const seccion = repSeccion.value;
  repAlumno.innerHTML = '<option value="">Nombre de alumno</option>';
  if (nivel && grado && seccion) {
    const alumnos = usersCache.filter(u => {
      const isStudent = u.rol === 'alumno' || u.rol === 'estudiante';
      return isStudent && u.nivel === nivel && String(u.seccion || '').toUpperCase() === seccion;
    });
    alumnos.forEach(a => { const op=document.createElement('option'); op.value=a.id; op.textContent=a.nombre; repAlumno.appendChild(op); });
  }
}

function fillDynamic(){
  const gradeDoc=document.getElementById('gradeDocenteGuia');
  if(gradeDoc){
    gradeDoc.innerHTML='<option value="">Docente guia</option>';
    const assignedDocIds = new Set(gradesCache.map(g => Number(g.docente_guia_id)).filter(n => n > 0));
    const disponibles = usersCache.filter(u => u.rol==='docente' && !assignedDocIds.has(Number(u.id)));
    if (!disponibles.length) {
      const op=document.createElement('option');
      op.value='';
      op.textContent='No hay docentes disponibles';
      op.disabled=true;
      gradeDoc.appendChild(op);
    } else {
      disponibles.forEach(d=>{const op=document.createElement('option'); op.value=d.id; op.textContent=`${d.nombre} (${d.email})`; gradeDoc.appendChild(op);});
    }
  }
  updateAlumnoGradoSeccion();
  const reportClass=document.getElementById('reportClaseDocente'); if(reportClass){ reportClass.innerHTML='<option value="">Seleccione clase</option>'; classesCache.forEach(c=>{const op=document.createElement('option'); op.value=c.id; op.textContent=`${c.nombre} (${c.codigo})`; reportClass.appendChild(op);}); }
  const classGrado=document.getElementById('classGrado');
  const nivelSel = document.getElementById('classNivel')?.value || '';
  const gradoSelPrev = document.getElementById('classGrado')?.value || '';
  if(classGrado){
    classGrado.innerHTML='<option value="">Nombre de grado</option>';
    if (nivelSel) {
      gradesCache
        .filter(g => g.nivel===nivelSel)
        .forEach(g=>{ const op=document.createElement('option'); op.value=g.nombre; op.textContent=`${g.grado_mostrar||g.nombre}`; classGrado.appendChild(op); });
      if (gradoSelPrev) classGrado.value = gradoSelPrev;
    }
  }
  updateClassSecciones();
  updateHorarioLocks();
  renderAssignBoard();
  fillCarrerasExistentes();
  updateAdminReportFilters();
  setReportDateLimit();
  updateGradeLocks();
}

function toggleRoleFields(){
  const rol=document.getElementById('adminRol')?.value;
  document.getElementById('alumnoExtraFields')?.classList.toggle('hidden',rol!=='alumno');
  const showDoc=rol==='docente';
  document.getElementById('docenteFechaNac')?.classList.toggle('hidden',!showDoc);
  document.getElementById('docenteEdad')?.classList.toggle('hidden',!showDoc);
}
function toggleGradeFields(){
  const nivel=document.getElementById('gradeNivel')?.value;
  const primaria=document.getElementById('gradePrimaria');
  const basico=document.getElementById('gradeBasico');
  const diversificado=document.getElementById('gradeDiversificado');
  const carrera=document.getElementById('gradeCarrera');
  const carreraRow=document.getElementById('gradeCarreraRow');
  const carreraExistente=document.getElementById('gradeCarreraExistente');
  if(!primaria||!basico||!diversificado||!carrera) return;
  const showPrim=nivel==='Primaria';
  const showBas=nivel==='Basico';
  const showCarr=nivel==='Diversificado';
  primaria.classList.toggle('hidden',!showPrim); primaria.required=showPrim; if(!showPrim) primaria.value='';
  basico.classList.toggle('hidden',!showBas); basico.required=showBas; if(!showBas) basico.value='';
  diversificado.classList.toggle('hidden',!showCarr); diversificado.required=showCarr; if(!showCarr) diversificado.value='';
  if (carreraRow) carreraRow.classList.toggle('hidden',!showCarr);
  carrera.required=showCarr; if(!showCarr) carrera.value='';
  if (carreraExistente) {
    carreraExistente.disabled = !showCarr;
    if (!showCarr) carreraExistente.value = '';
  }
  updateGradeLocks();
}

function fillCarrerasExistentes(){
  const sel = document.getElementById('gradeCarreraExistente');
  if(!sel) return;
  const carreras = [...new Set(
    gradesCache
      .filter(g => g.nivel === 'Diversificado')
      .map(g => String(g.carrera || '').trim())
      .filter(Boolean)
  )].sort((a,b)=>a.localeCompare(b,'es'));
  sel.innerHTML = '<option value="">Elegir carrera existente</option>';
  carreras.forEach(c => {
    const op=document.createElement('option');
    op.value=c; op.textContent=c;
    sel.appendChild(op);
  });
}

function resetByRoleChange() {
  document.getElementById('adminNombres').value = '';
  document.getElementById('adminApellidos').value = '';
  document.getElementById('adminUsername').value = '';
  document.getElementById('adminEmail').value = '';
  document.getElementById('adminPass').value = '';
  const alumnoFecha = document.getElementById('alumnoFechaNac');
  const alumnoEdad = document.getElementById('alumnoEdad');
  const alumnoNivel = document.getElementById('alumnoNivel');
  const alumnoGrado = document.getElementById('alumnoGrado');
  const alumnoSeccion = document.getElementById('alumnoSeccion');
  const alumnoCiclo = document.getElementById('alumnoCiclo');
  const alumnoCupos = document.getElementById('alumnoCuposDisp');
  const docenteFecha = document.getElementById('docenteFechaNac');
  const docenteEdad = document.getElementById('docenteEdad');
  if (alumnoFecha) alumnoFecha.value = '';
  if (alumnoEdad) alumnoEdad.value = '';
  if (alumnoNivel) alumnoNivel.value = '';
  if (alumnoGrado) alumnoGrado.innerHTML = '<option value="">Nombre de grado</option>';
  if (alumnoSeccion) alumnoSeccion.innerHTML = '<option value="">Seccion</option>';
  if (alumnoCiclo) alumnoCiclo.value = '';
  if (alumnoCupos) alumnoCupos.value = '';
  if (docenteFecha) docenteFecha.value = '';
  if (docenteEdad) docenteEdad.value = '';
}

function resetByNivelChange() {
  const primaria = document.getElementById('gradePrimaria');
  const basico = document.getElementById('gradeBasico');
  const diversificado = document.getElementById('gradeDiversificado');
  const carrera = document.getElementById('gradeCarrera');
  const seccion = document.getElementById('gradeSeccion');
  const cupos = document.getElementById('gradeCupos');
  const docente = document.getElementById('gradeDocenteGuia');
  if (primaria) primaria.value = '';
  if (basico) basico.value = '';
  if (diversificado) diversificado.value = '';
  if (carrera) carrera.value = '';
  if (seccion) seccion.value = '';
  if (cupos) cupos.value = '';
  if (docente) docente.value = '';
}

async function loadUsers(){ const r=await api('api/users.php'); if(!r.ok) return alertErr(r.message); usersCache=Array.isArray(r.data)?r.data:[]; renderUsers(); fillDynamic(); }
async function loadClasses(){ const r=await api('api/classes.php'); if(!r.ok) return; classesCache=Array.isArray(r.data)?r.data:[]; fillDynamic(); }
async function loadGrades(){ const r=await api('api/grades.php'); if(!r.ok) return; gradesCache=Array.isArray(r.data)?r.data:[]; renderGrades(); fillDynamic(); }
async function loadTeacherReportsToday(dateValue = ''){
  const q = new URLSearchParams();
  if (dateValue) q.set('fecha', dateValue);
  else q.set('today', '1');
  const r = await api(`api/student_reports.php?${q.toString()}`);
  if (!r.ok) { todayReportsByStudent = new Set(); return; }
  const rows = Array.isArray(r.data) ? r.data : [];
  todayReportsByStudent = new Set(
    rows
      .map(x => Number(x.alumno_id))
      .filter(n => n > 0)
  );
}
function renderTeacherAttendanceList(){
  const tb=document.querySelector('#teacherReportTable tbody');
  if(!tb) return;
  tb.innerHTML='';
  const selected = document.getElementById('teacherReportDate')?.value || dateISO(new Date());
  if (!myStudentsCache.length) {
    const tr=document.createElement('tr');
    tr.innerHTML='<td colspan="3">No hay alumnos asignados a este grado.</td>';
    tb.appendChild(tr);
    return;
  }
  myStudentsCache.forEach(st=>{
    const hasReport = todayReportsByStudent.has(Number(st.id));
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${selected}</td><td><button type="button" class="link-btn" data-teacher-student="${st.id}" style="font-weight:700;color:${hasReport?'#b91c1c':'#15803d'}">${st.nombre||''}</button></td><td>${st.email||''}</td>`;
    tb.appendChild(tr);
  });
}

async function showTeacherStudentReports(studentId){
  const alumno = myStudentsCache.find(s => String(s.id) === String(studentId));
  if (!alumno) return;
  const r = await api(`api/student_reports.php?alumno_id=${encodeURIComponent(studentId)}`);
  if (!r.ok) return alertErr(r.message);
  const rows = Array.isArray(r.data) ? r.data : [];
  if (!rows.length) {
    await Swal.fire({
      title: `Reportes de ${alumno.nombre}`,
      text: 'Ningun reporte',
      icon: 'info'
    });
    return;
  }
  const html = `
    <div style="max-height:320px;overflow:auto;text-align:left">
      ${rows.map(x => `
        <div style="border:1px solid #d1d5db;border-radius:8px;padding:8px;margin-bottom:8px">
          <div><strong>Fecha:</strong> ${x.fecha || ''}</div>
          <div><strong>Clase:</strong> ${x.clase || ''}</div>
          <div><strong>Reporte:</strong> ${x.reporte || ''}</div>
          <div><strong>Comentario:</strong> ${x.comentario || 'Sin comentario'}</div>
          <div><strong>Origen:</strong> ${x.origen || 'manual'}</div>
          ${((x.origen || 'manual') === 'manual' && Number(x.docente_id) === Number(currentUser?.id))
            ? `<button type="button" data-del-report="${x.id}" style="margin-top:8px">Eliminar reporte</button>`
            : ''}
        </div>
      `).join('')}
    </div>
  `;
  await Swal.fire({
    title: `Reportes de ${alumno.nombre}`,
    html,
    width: 760,
    didOpen: () => {
      document.querySelectorAll('[data-del-report]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const repId = btn.getAttribute('data-del-report');
          if (!repId) return;
          const ask = await Swal.fire({ icon: 'warning', title: 'Eliminar reporte', text: 'Esta accion no se puede deshacer', showCancelButton: true });
          if (!ask.isConfirmed) return;
          const del = await api(`api/student_reports.php?id=${encodeURIComponent(repId)}`, { method: 'DELETE' });
          if (!del.ok) return alertErr(del.message);
          await loadTeacherReportsToday();
          renderTeacherAttendanceList();
          Swal.close();
          await showTeacherStudentReports(studentId);
        });
      });
    }
  });
}
function renderTeacherSummary(){
  const nivelEl = document.getElementById('teacherNivel');
  const gradoEl = document.getElementById('teacherGrado');
  const seccionEl = document.getElementById('teacherSeccion');
  const cantEl = document.getElementById('teacherCantidad');
  if (!nivelEl || !gradoEl || !seccionEl || !cantEl) return;
  const firstClass = classesCache[0] || null;
  nivelEl.textContent = firstClass?.nivel || '-';
  gradoEl.textContent = firstClass?.grado || '-';
  seccionEl.textContent = firstClass?.seccion || '-';
  cantEl.textContent = String(myStudentsCache.length || 0);
}
function renderTeacherScheduleBoard() {
  const titleEl = document.getElementById('teacherScheduleTitle');
  const thead = document.querySelector('#teacherScheduleTable thead');
  const tbody = document.querySelector('#teacherScheduleTable tbody');
  if (!titleEl || !thead || !tbody) return;

  const base = classesCache[0] || null;
  const nivel = base?.nivel || '';
  const grado = base?.grado || '';
  const seccion = String(base?.seccion || '').toUpperCase();
  titleEl.textContent = base ? `${grado} - Seccion ${seccion} (${nivel})` : 'Horario del grado';

  thead.innerHTML = `<tr><th>Dia</th>${HORARIOS.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  tbody.innerHTML = '';
  DIAS.forEach((dia) => {
    const tr = document.createElement('tr');
    let row = `<td>${dia}</td>`;
    HORARIOS.forEach((hora) => {
      const c = classesCache.find(x =>
        x.dia === dia &&
        x.horario === hora &&
        (!base || (x.nivel === nivel && x.grado === grado && String(x.seccion || '').toUpperCase() === seccion))
      );
      row += c ? `<td class="course-filled">${c.nombre}</td>` : '<td>-</td>';
    });
    tr.innerHTML = row;
    tbody.appendChild(tr);
  });
}
function downloadTeacherSchedulePdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) return alertErr('No se pudo cargar generador de PDF');
  const table = document.getElementById('teacherScheduleTable');
  const title = document.getElementById('teacherScheduleTitle')?.textContent || 'Horario del grado';
  if (!table) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  pdf.setFontSize(14);
  pdf.text(title, 14, 14);

  let y = 24;
  const dayW = 26;
  const cellW = 35;
  const rowH = 9;
  const x0 = 10;
  const headers = ['Dia', ...HORARIOS];

  headers.forEach((h, idx) => {
    const w = idx === 0 ? dayW : cellW;
    const x = idx === 0 ? x0 : x0 + dayW + (idx - 1) * cellW;
    pdf.rect(x, y, w, rowH);
    pdf.setFontSize(8);
    pdf.text(h, x + 1.5, y + 6);
  });
  y += rowH;

  DIAS.forEach((dia) => {
    pdf.rect(x0, y, dayW, rowH);
    pdf.setFontSize(9);
    pdf.text(dia, x0 + 1.5, y + 6);
    HORARIOS.forEach((hora, i) => {
      const x = x0 + dayW + i * cellW;
      const c = classesCache.find(cl => cl.dia === dia && cl.horario === hora);
      pdf.rect(x, y, cellW, rowH);
      if (c?.nombre) {
        const txt = String(c.nombre).slice(0, 20);
        pdf.setFontSize(8);
        pdf.text(txt, x + 1.5, y + 6);
      }
    });
    y += rowH;
  });

  pdf.save('horario-grado.pdf');
}
async function loadMyStudents(){ const r=await api('api/my_students.php'); if(!r.ok) return; myStudentsCache=Array.isArray(r.data)?r.data:[]; const s=document.getElementById('reportAlumno'); if(s){ s.innerHTML='<option value="">Seleccione alumno</option>'; myStudentsCache.forEach(st=>{const op=document.createElement('option'); op.value=st.id; op.textContent=`${st.nombre} (${st.email})`; s.appendChild(op);}); } await loadTeacherReportsToday(); renderTeacherSummary(); renderTeacherAttendanceList(); }
async function loadTeacherAttendances(dateValue = ''){
  const p = new URLSearchParams();
  const selected = dateValue || document.getElementById('teacherAttendanceDate')?.value || dateISO(new Date());
  if (selected) p.set('fecha', selected);
  const r = await api(`api/report.php?${p.toString()}`);
  if(!r.ok) return alertErr(r.message);
  const tb = document.querySelector('#teacherAttendanceTable tbody');
  if(!tb) return;
  const rows = Array.isArray(r.data) ? r.data : [];
  tb.innerHTML = '';
  if (!rows.length) {
    const tr=document.createElement('tr');
    tr.innerHTML = '<td colspan="4">No hay asistencias registradas.</td>';
    tb.appendChild(tr);
    return;
  }
  rows.forEach(x=>{
    const tok = String(x.sesion_token || '');
    let tipo = 'Asistencia';
    if (tok.endsWith('-op1')) tipo = 'Entrada puntual';
    else if (tok.endsWith('-op2')) tipo = 'Entrada tarde';
    else if (tok.endsWith('-op4')) tipo = 'Salida del colegio';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${x.fecha||''}</td><td>${x.alumno||''}</td><td>${tipo}</td><td>${x.registrado_en||''}</td>`;
    tb.appendChild(tr);
  });
}
async function loadStudentReports(dateValue = ''){ const p=new URLSearchParams(); const selected=dateValue||document.getElementById('studentReportsDate')?.value||''; if(selected) p.set('fecha',selected); const r=await api(`api/student_reports.php?${p.toString()}`); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#myReportsTable tbody'); if(!tb) return; tb.innerHTML=''; const rows=Array.isArray(r.data)?r.data:[]; if(!rows.length){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="4">No hay reportes registrados.</td>'; tb.appendChild(tr); return; } rows.forEach(x=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha}</td><td>${x.clase}</td><td>${x.reporte}</td><td>${x.comentario||''}</td>`; tb.appendChild(tr);}); }
function renderStudentSummary(){
  const n=document.getElementById('studentNivel');
  const g=document.getElementById('studentGrado');
  const s=document.getElementById('studentSeccion');
  const d=document.getElementById('studentDocente');
  if(!n||!g||!s||!d) return;
  const c=classesCache[0]||null;
  n.textContent=c?.nivel||'-';
  g.textContent=c?.grado||'-';
  s.textContent=c?.seccion||'-';
  d.textContent=c?.docente||'-';
}

function initControlScanner(){
  if (scannerStarted || typeof Html5Qrcode === 'undefined') return;
  const reader = document.getElementById('reader');
  if (!reader) return;
  scannerStarted = true;
  const qr = new Html5Qrcode('reader');
  qr.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: undefined },
    async (decodedText) => {
      if (controlScanCooldown) return;
      controlScanCooldown = true;
      const r = await api('api/control_mark_attendance.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_data: decodedText })
      });
      if (!r.ok) {
        alertErr(r.message);
      } else {
        const d = r.data || {};
        const nombre = document.getElementById('cInfoNombre');
        const nivel = document.getElementById('cInfoNivel');
        const grado = document.getElementById('cInfoGrado');
        const seccion = document.getElementById('cInfoSeccion');
        const box = document.getElementById('controlInfoBox');
        if (nombre) nombre.textContent = d.alumno || '-';
        if (nivel) nivel.textContent = d.nivel || '-';
        if (grado) grado.textContent = d.grado || '-';
        if (seccion) seccion.textContent = d.seccion || '-';
        if (box) box.classList.add('active');

        if (controlInfoTimer) clearTimeout(controlInfoTimer);
        controlInfoTimer = setTimeout(() => {
          if (nombre) nombre.textContent = '-';
          if (nivel) nivel.textContent = '-';
          if (grado) grado.textContent = '-';
          if (seccion) seccion.textContent = '-';
          if (box) box.classList.remove('active');
        }, 3000);
      }
      setTimeout(() => { controlScanCooldown = false; }, 3000);
    },
    () => {}
  ).catch(() => alertErr('No se pudo iniciar la camara.'));
}

function toMinutes(hhmm) {
  if (!hhmm || !String(hhmm).includes(':')) return -1;
  const [h,m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

function syncReportsControlStarts() {
  const e1 = document.getElementById('rcEnd1')?.value || '';
  const e2 = document.getElementById('rcEnd2')?.value || '';
  const e3 = document.getElementById('rcEnd3')?.value || '';
  const s2 = document.getElementById('rcStart2');
  const s3 = document.getElementById('rcStart3');
  const s4 = document.getElementById('rcStart4');
  if (s2) s2.value = e1;
  if (s3) s3.value = e2;
  if (s4) s4.value = e3;
}

function loadReportsControlConfig() {
  return api('api/reports_control.php').then((r) => {
    if (!r.ok || !r.data) return;
    const cfg = r.data;
    const map = {
      rcStart1: cfg.start1,
      rcEnd1: cfg.end1,
      rcEnd2: cfg.end2,
      rcEnd3: cfg.end3,
      rcEnd4: cfg.end4
    };
    Object.entries(map).forEach(([id,val]) => {
      const el = document.getElementById(id);
      if (el && val) el.value = String(val).slice(0,5);
    });
    syncReportsControlStarts();
  });
}

function initReportsControl() {
  const form = document.getElementById('reportsControlForm');
  if (!form) return;
  loadReportsControlConfig();
  ['rcEnd1','rcEnd2','rcEnd3'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', syncReportsControlStarts);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncReportsControlStarts();
    const s1 = document.getElementById('rcStart1')?.value || '';
    const e1 = document.getElementById('rcEnd1')?.value || '';
    const s2 = document.getElementById('rcStart2')?.value || '';
    const e2 = document.getElementById('rcEnd2')?.value || '';
    const s3 = document.getElementById('rcStart3')?.value || '';
    const e3 = document.getElementById('rcEnd3')?.value || '';
    const s4 = document.getElementById('rcStart4')?.value || '';
    const e4 = document.getElementById('rcEnd4')?.value || '';

    if (!s1 || !e1 || !e2 || !e3 || !e4) return alertErr('Completa todas las horas requeridas');
    const m = [s1,e1,s2,e2,s3,e3,s4,e4].map(toMinutes);
    if (m.some(x => x < 0)) return alertErr('Formato de hora invalido');
    if (!(m[0] < m[1] && m[2] < m[3] && m[4] < m[5] && m[6] < m[7])) return alertErr('Cada bloque debe tener hora inicio menor que hora final');
    if (!(m[1] === m[2] && m[3] === m[4] && m[5] === m[6])) return alertErr('Las horas deben ser continuas entre bloques');
    if (!(m[0] < m[1] && m[1] < m[3] && m[3] < m[5] && m[5] < m[7])) return alertErr('La secuencia de bloques no puede retroceder');

    const r = await api('api/reports_control.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start1: s1, end1: e1, end2: e2, end3: e3, end4: e4 })
    });
    if (!r.ok) return alertErr(r.message);
    alertOk(r.message);
  });
}

document.getElementById('logoutBtn')?.addEventListener('click',async()=>{ await api('api/logout.php',{method:'POST'}); location.href='index.html';});
themeToggleBtn?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});
document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>switchAdminView(b.dataset.adminView)));
document.querySelectorAll('.teacher-tab').forEach(b=>b.addEventListener('click',()=>switchTeacherView(b.dataset.teacherView)));
document.getElementById('downloadTeacherScheduleBtn')?.addEventListener('click', downloadTeacherSchedulePdf);
document.getElementById('loadUsersBtn')?.addEventListener('click', loadUsers);
document.getElementById('userSearchName')?.addEventListener('input',renderUsers);
document.getElementById('adminRol')?.addEventListener('change',()=>{ resetByRoleChange(); toggleRoleFields(); });
document.getElementById('gradeNivel')?.addEventListener('change',()=>{ resetByNivelChange(); toggleGradeFields(); });
document.getElementById('classNivel')?.addEventListener('change',fillDynamic);
document.getElementById('classGrado')?.addEventListener('change',()=>{ updateClassSecciones(); renderAssignBoard(); });
document.getElementById('classSeccion')?.addEventListener('change',()=>{ updateHorarioLocks(); renderAssignBoard(); });
document.getElementById('classDia')?.addEventListener('change',()=>{ updateHorarioLocks(); renderAssignBoard(); });
document.getElementById('gradeSeccion')?.addEventListener('input',()=>{ updateGradeLocks(); });
document.getElementById('gradeCarrera')?.addEventListener('input',(e)=>{
  const sel=document.getElementById('gradeCarreraExistente');
  if(sel && !String(e.target.value||'').trim()) sel.value='';
  updateGradeLocks();
});
document.getElementById('gradeCarreraExistente')?.addEventListener('change',(e)=>{ const c=document.getElementById('gradeCarrera'); if(c && e.target.value) c.value=e.target.value; updateGradeLocks(); });
document.getElementById('adminNombres')?.addEventListener('input',e=>{ e.target.value=sanitizeLetters(e.target.value); const u=document.getElementById('adminUsername'); if(u) u.value=genUserPreview(document.getElementById('adminNombres').value,document.getElementById('adminApellidos').value);});
document.getElementById('adminApellidos')?.addEventListener('input',e=>{ e.target.value=sanitizeLetters(e.target.value); const u=document.getElementById('adminUsername'); if(u) u.value=genUserPreview(document.getElementById('adminNombres').value,document.getElementById('adminApellidos').value);});
document.getElementById('alumnoFechaNac')?.addEventListener('change',e=>{
  if (!validateBirthInput(e.target, 7, 'alumno')) return;
  const age=document.getElementById('alumnoEdad'); if(age) age.value=calcAge(e.target.value);
});
document.getElementById('docenteFechaNac')?.addEventListener('change',e=>{
  if (!validateBirthInput(e.target, 18, 'docente')) return;
  const age=document.getElementById('docenteEdad'); if(age) age.value=calcAge(e.target.value);
});
document.getElementById('alumnoNivel')?.addEventListener('change',updateAlumnoGradoSeccion);
document.getElementById('alumnoGrado')?.addEventListener('change',updateAlumnoGradoSeccion);
document.getElementById('alumnoSeccion')?.addEventListener('change',updateAlumnoGradoSeccion);
document.getElementById('repNivel')?.addEventListener('change',updateAdminReportFilters);
document.getElementById('repGrado')?.addEventListener('change',updateAdminReportFilters);
document.getElementById('repSeccion')?.addEventListener('change',updateAdminReportFilters);
document.getElementById('repFecha')?.addEventListener('change', (e) => {
  const max = e.target.max || dateISO(new Date());
  if (e.target.value && e.target.value > max) {
    e.target.value = '';
    Swal.fire({ icon: 'warning', title: 'Fecha invalida', text: 'No puedes seleccionar una fecha posterior a hoy.' });
  }
});
document.querySelectorAll('[data-student-view]').forEach(b=>b.addEventListener('click', async ()=>{ switchStudentView(b.dataset.studentView); if(b.dataset.studentView==='reports') await loadStudentReports(); if(b.dataset.studentView==='attendances') await loadStudentAttendances(); }));
document.getElementById('studentAttendanceDate')?.addEventListener('change', async (e) => {
  const max = e.target.max || dateISO(new Date());
  if (e.target.value && e.target.value > max) {
    e.target.value = max;
    Swal.fire({ icon:'warning', title:'Fecha invalida', text:'No puedes elegir un dia posterior al actual.' });
  }
  await loadStudentAttendances(e.target.value || '');
});
document.getElementById('studentReportsDate')?.addEventListener('change', async (e) => {
  const max = e.target.max || dateISO(new Date());
  if (e.target.value && e.target.value > max) {
    e.target.value = max;
    Swal.fire({ icon:'warning', title:'Fecha invalida', text:'No puedes elegir un dia posterior al actual.' });
  }
  await loadStudentReports(e.target.value || '');
});
document.getElementById('studentAttendanceTodayBtn')?.addEventListener('click', async () => {
  const el=document.getElementById('studentAttendanceDate'); if(!el) return;
  const today=dateISO(new Date()); el.value=today; await loadStudentAttendances(today);
});
document.getElementById('studentReportsTodayBtn')?.addEventListener('click', async () => {
  const el=document.getElementById('studentReportsDate'); if(!el) return;
  const today=dateISO(new Date()); el.value=today; await loadStudentReports(today);
});
document.getElementById('teacherReportDate')?.addEventListener('change', async (e) => {
  const max = e.target.max || dateISO(new Date());
  if (e.target.value && e.target.value > max) {
    e.target.value = max;
    Swal.fire({ icon: 'warning', title: 'Fecha invalida', text: 'No puedes elegir un dia posterior al actual.' });
  }
  await loadTeacherReportsToday(e.target.value || '');
  renderTeacherAttendanceList();
});
document.getElementById('teacherAttendanceDate')?.addEventListener('change', async (e) => {
  const max = e.target.max || dateISO(new Date());
  if (e.target.value && e.target.value > max) {
    e.target.value = max;
    Swal.fire({ icon: 'warning', title: 'Fecha invalida', text: 'No puedes elegir un dia posterior al actual.' });
  }
  await loadTeacherAttendances(e.target.value || '');
});
document.getElementById('teacherReportTodayBtn')?.addEventListener('click', async () => {
  const teacherDate = document.getElementById('teacherReportDate');
  if (!teacherDate) return;
  const today = dateISO(new Date());
  teacherDate.value = today;
  await loadTeacherReportsToday(today);
  renderTeacherAttendanceList();
});
document.getElementById('teacherAttendanceTodayBtn')?.addEventListener('click', async () => {
  const dateInput = document.getElementById('teacherAttendanceDate');
  if (!dateInput) return;
  const today = dateISO(new Date());
  dateInput.value = today;
  await loadTeacherAttendances(today);
});

document.querySelector('#usersTable')?.addEventListener('click', async (e)=>{
  const qrId=e.target.getAttribute('data-qr'); const editId=e.target.getAttribute('data-edit'); const delId=e.target.getAttribute('data-del'); const credId=e.target.getAttribute('data-cred');
  if(qrId){ const user=usersCache.find(u=>String(u.id)===String(qrId)); if(user) await showUserQr(user); return; }
  if(credId){
    const user=usersCache.find(u=>String(u.id)===String(credId));
    if(!user) return;
    if(user.rol==='docente'){
      const okAssigned = await teacherHasAssignedGradeLive(user.id);
      if(!okAssigned) return alertErr('Asigne a un curso');
    }
    await downloadCredential(user);
    return;
  }
  if(editId){ const current=usersCache.find(u=>String(u.id)===String(editId)); const sp=splitName(current?.nombre||''); const {value:fv}=await Swal.fire({title:`Editar usuario #${editId}`, html:`<input id="swNombres" class="swal2-input" placeholder="Nombres" value="${sp.nombres||''}"><input id="swApellidos" class="swal2-input" placeholder="Apellidos" value="${sp.apellidos||''}"><input id="swEmail" class="swal2-input" placeholder="Email" value="${current?.email||''}"><select id="swRol" class="swal2-input"><option value="alumno">alumno</option><option value="docente">docente</option><option value="admin">admin</option></select><input id="swPass" type="password" class="swal2-input" placeholder="Nueva contrasena (opcional)">`, didOpen:()=>{const rol=document.getElementById('swRol'); if(rol&&current?.rol) rol.value=current.rol;}, preConfirm:()=>({nombres:document.getElementById('swNombres').value,apellidos:document.getElementById('swApellidos').value,email:document.getElementById('swEmail').value,rol:document.getElementById('swRol').value,password:document.getElementById('swPass').value})}); if(!fv) return; const r=await api('api/users.php',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(editId),...fv})}); if(!r.ok) return alertErr(r.message); await loadUsers(); return alertOk(r.message); }
  if(delId){
    const target = usersCache.find(u=>String(u.id)===String(delId));
    if(target && (target.rol==='admin' || target.rol==='control')) return;
    const ask=await Swal.fire({icon:'warning',title:'Eliminar usuario',text:'Esta accion no se puede deshacer',showCancelButton:true});
    if(!ask.isConfirmed) return;
    const r=await api(`api/users.php?id=${delId}`,{method:'DELETE'});
    if(!r.ok) return alertErr(r.message);
    await loadUsers();
    alertOk(r.message);
  }
});

document.querySelector('#teacherReportTable')?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-teacher-student]');
  if (!btn) return;
  const studentId = btn.getAttribute('data-teacher-student');
  if (!studentId) return;
  await showTeacherStudentReports(studentId);
});

document.getElementById('adminCreateUserForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const rol=document.getElementById('adminRol').value; const payload={nombres:document.getElementById('adminNombres').value.trim(),apellidos:document.getElementById('adminApellidos').value.trim(),email:document.getElementById('adminEmail').value.trim(),password:document.getElementById('adminPass').value,rol}; if(rol==='alumno'){ payload.fecha_nacimiento=document.getElementById('alumnoFechaNac').value; payload.nivel=document.getElementById('alumnoNivel').value; payload.grado=document.getElementById('alumnoGrado').value; payload.seccion=document.getElementById('alumnoSeccion').value; payload.ciclo_escolar=document.getElementById('alumnoCiclo').value; } if(rol==='docente'){ payload.fecha_nacimiento=document.getElementById('docenteFechaNac').value;} const r=await api('api/register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); toggleRoleFields(); await Promise.all([loadUsers(),loadClasses(),loadGrades()]); switchAdminView('users'); alertOk(`${r.message}. Usuario: ${r.data?.username||''}`); });

document.getElementById('adminClassForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload={nivel:document.getElementById('classNivel').value,grado:document.getElementById('classGrado').value,seccion:document.getElementById('classSeccion').value.trim().toUpperCase(),nombre:document.getElementById('classNombre').value.trim(),dia:document.getElementById('classDia').value,horario:document.getElementById('classHorario').value}; const r=await api('api/classes.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); await loadClasses(); renderAssignBoard(); alertOk(r.message); });
document.getElementById('adminGradeForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload={nivel:document.getElementById('gradeNivel').value,grado_primaria:document.getElementById('gradePrimaria').value,grado_basico:document.getElementById('gradeBasico').value,grado_diversificado:document.getElementById('gradeDiversificado').value,carrera:document.getElementById('gradeCarrera').value.trim(),seccion:document.getElementById('gradeSeccion').value.trim(),cupos:Number(document.getElementById('gradeCupos').value),docente_guia_id:Number(document.getElementById('gradeDocenteGuia').value)}; const r=await api('api/grades.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); toggleGradeFields(); await loadGrades(); alertOk(r.message); });
document.getElementById('reportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const p=new URLSearchParams(); const f=document.getElementById('repFecha')?.value; const a=document.getElementById('repAlumno')?.value; const g=document.getElementById('repGrado')?.value; const n=document.getElementById('repNivel')?.value; const s=document.getElementById('repSeccion')?.value; if(f) p.set('fecha',f); if(a) p.set('alumno_id',a); if(g) p.set('grado',g); if(n) p.set('nivel',n); if(s) p.set('seccion',s); const r=await api(`api/report.php?${p.toString()}`); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#reportTable tbody'); if(!tb) return; tb.innerHTML=''; const rows=Array.isArray(r.data)?r.data:[]; if(!rows.length){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="6">No hay registros de asistencia</td>'; tb.appendChild(tr); return; } rows.forEach(x=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha||''}</td><td>${x.nivel||''}</td><td>${x.grado||''}</td><td>${x.seccion||''}</td><td>${x.alumno||''}</td><td>${x.registrado_en||''}</td>`; tb.appendChild(tr);}); });

document.getElementById('studentReportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload={clase_id:Number(document.getElementById('reportClaseDocente').value),alumno_id:Number(document.getElementById('reportAlumno').value),reporte:document.getElementById('reportTexto').value,comentario:document.getElementById('commentTexto').value}; const r=await api('api/student_reports.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); await loadTeacherReportsToday(); renderTeacherAttendanceList(); alertOk(r.message); });

async function loadStudentAttendances(){ const r=await api('api/report.php'); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#studentOnlyAttendanceTable tbody'); if(!tb) return; tb.innerHTML=''; const rows=Array.isArray(r.data)?r.data:[]; if(!rows.length){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="5">No hay asistencias registradas.</td>'; tb.appendChild(tr); return; } rows.forEach(x=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha}</td><td>${x.clase}</td><td>${x.codigo}</td><td>${x.estado}</td><td>${x.registrado_en}</td>`; tb.appendChild(tr);}); }
async function loadStudentAttendances(dateValue = ''){ const p=new URLSearchParams(); const selected=dateValue||document.getElementById('studentAttendanceDate')?.value||''; if(selected) p.set('fecha',selected); const r=await api(`api/report.php?${p.toString()}`); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#studentOnlyAttendanceTable tbody'); if(!tb) return; tb.innerHTML=''; const rows=Array.isArray(r.data)?r.data:[]; if(!rows.length){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="3">No hay asistencias registradas.</td>'; tb.appendChild(tr); return; } rows.forEach(x=>{ const tok=String(x.sesion_token||''); let tipo='Asistencia'; if(tok.endsWith('-op1')) tipo='Entrada puntual'; else if(tok.endsWith('-op2')) tipo='Entrada tarde'; else if(tok.endsWith('-op4')) tipo='Salida del colegio'; const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha||''}</td><td>${tipo}</td><td>${x.registrado_en||''}</td>`; tb.appendChild(tr);}); }

async function init(){
  applyTheme(localStorage.getItem('theme') || 'light');
  setBirthDateLimits();
  setReportDateLimit();
  initGsapDashboard();
  initReportsControl();
  const s=await api('api/session.php');
  if(!s.ok||!s.data) return location.href='index.html';
  currentUser=s.data;
  userInfo.textContent=`${s.data.nombre} (${s.data.rol}) - ${s.data.email}`;
  const teacherDate = document.getElementById('teacherReportDate');
  const teacherAttendanceDate = document.getElementById('teacherAttendanceDate');
  const studentAttendanceDate = document.getElementById('studentAttendanceDate');
  const studentReportsDate = document.getElementById('studentReportsDate');
  if (teacherDate) {
    const today = dateISO(new Date());
    teacherDate.max = today;
    if (!teacherDate.value) teacherDate.value = today;
  }
  if (teacherAttendanceDate) {
    const today = dateISO(new Date());
    teacherAttendanceDate.max = today;
    if (!teacherAttendanceDate.value) teacherAttendanceDate.value = today;
  }
  if (studentAttendanceDate) {
    const today = dateISO(new Date());
    studentAttendanceDate.max = today;
    if (!studentAttendanceDate.value) studentAttendanceDate.value = today;
  }
  if (studentReportsDate) {
    const today = dateISO(new Date());
    studentReportsDate.max = today;
    if (!studentReportsDate.value) studentReportsDate.value = today;
  }
  await loadClasses();
  await loadGrades();

  if(s.data.rol==='admin'){ adminModule.classList.remove('hidden'); switchAdminView('users'); await loadUsers(); toggleRoleFields(); toggleGradeFields(); }
  if(s.data.rol==='docente'){ teacherModule.classList.remove('hidden'); switchTeacherView('attendances'); renderTeacherSummary(); renderTeacherScheduleBoard(); await loadMyStudents(); renderTeacherScheduleBoard(); }
  if(s.data.rol==='alumno'||s.data.rol==='estudiante'){ studentModule.classList.remove('hidden'); switchStudentView('attendances'); renderStudentSummary(); await loadStudentAttendances(document.getElementById('studentAttendanceDate')?.value||''); await loadStudentReports(document.getElementById('studentReportsDate')?.value||''); renderStudentSummary(); }
  if(s.data.rol==='control'){ controlModule.classList.remove('hidden'); initControlScanner(); }
}

init();







