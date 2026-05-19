const userInfo = document.getElementById('userInfo');
const adminModule = document.getElementById('adminModule');
const teacherModule = document.getElementById('teacherModule');
const studentModule = document.getElementById('studentModule');
const controlModule = document.getElementById('controlModule');
const themeToggleBtn = document.getElementById('themeToggleBtn');

let usersCache = [];
let classesCache = [];
let gradesCache = [];
let scannerStarted = false;
let currentUser = null;

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
}

function switchAdminView(view){ resetAdminViewFields(); document.querySelectorAll('.admin-tab').forEach(b=>b.classList.toggle('active',b.dataset.adminView===view)); document.querySelectorAll('.admin-view').forEach(v=>v.classList.toggle('hidden',v.id!==`adminView-${view}`)); animateAdminView(view); }
function fillSimpleSelect(id,list,placeholder){ const el=document.getElementById(id); if(!el) return; el.innerHTML=`<option value="">${placeholder}</option>`; list.forEach(v=>{const op=document.createElement('option'); op.value=v; op.textContent=v; el.appendChild(op);}); }

function renderUsers(){ const q=(document.getElementById('userSearchName')?.value||'').toLowerCase().trim(); const data=q?usersCache.filter(u=>(u.nombre||'').toLowerCase().includes(q)):usersCache; const tb=document.querySelector('#usersTable tbody'); if(!tb) return; tb.innerHTML=''; data.forEach(u=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${u.id}</td><td>${u.nombre}</td><td><button class="link-btn" data-qr="${u.id}">${u.username||''}</button></td><td>${u.email}</td><td>${u.rol}</td><td class="actions"><button data-edit="${u.id}">Editar</button><button data-del="${u.id}">Eliminar</button></td>`; tb.appendChild(tr);}); }

async function showUserQr(user){ const qrId='qrUserBox'; await Swal.fire({ title:`QR de ${user.username}`, html:`<div id="${qrId}" style="display:flex;justify-content:center;margin:8px 0"></div><button id="saveQrBtn" class="swal2-confirm swal2-styled" style="margin-top:8px">Guardar</button>`, showConfirmButton:false, didOpen:()=>{ const box=document.getElementById(qrId); box.innerHTML=''; new QRCode(box,{text:user.qr_payload||JSON.stringify(user),width:220,height:220}); document.getElementById('saveQrBtn').addEventListener('click',()=>{ const img=box.querySelector('img')||box.querySelector('canvas'); if(!img) return; const url=img.tagName.toLowerCase()==='img'?img.src:img.toDataURL('image/png'); const a=document.createElement('a'); a.href=url; a.download=`${user.username||'usuario'}-qr.png`; a.click();}); }}); }

function renderGrades(){ const tb=document.querySelector('#gradesTable tbody'); if(!tb) return; tb.innerHTML=''; gradesCache.forEach(g=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${g.id}</td><td>${g.nivel||''}</td><td>${g.grado_mostrar||g.nombre||''}</td><td>${g.seccion||''}</td><td>${g.cupos??''}</td><td>${g.docente_guia||''}</td>`; tb.appendChild(tr); }); }
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
}

function hasGradeBySeccion(nivel, grado, seccion) {
  const sec = String(seccion || '').trim().toUpperCase();
  return gradesCache.some((g) => {
    if (g.nivel !== nivel) return false;
    if (String(g.seccion || '').trim().toUpperCase() !== sec) return false;
    const val = nivel === 'Primaria' ? (g.grado_primaria || g.nombre) : (g.grado_basico || g.nombre);
    return String(val || '').toLowerCase() === String(grado || '').toLowerCase();
  });
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

  const lockSequence = (selectId, list, existsPrev) => {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    [...sel.options].forEach((opt, idx) => {
      if (!opt.value) return;
      if (idx === 1) { opt.disabled = false; return; }
      opt.disabled = !existsPrev(list[idx - 2]);
    });
  };

  lockSequence('gradePrimaria', prim, (prev) => hasGradeBySeccion('Primaria', prev, sec));
  lockSequence('gradeBasico', bas, (prev) => hasGradeBySeccion('Basico', prev, sec));
  lockSequence('gradeDiversificado', div, (prev) => hasGradeByCarrera(prev, carrera));
}

function fillDynamic(){
  const repAlumno=document.getElementById('repAlumno'); if(repAlumno){ repAlumno.innerHTML='<option value="">Nombre de alumno</option>'; usersCache.filter(u=>u.rol==='alumno'||u.rol==='estudiante').forEach(a=>{const op=document.createElement('option'); op.value=a.id; op.textContent=a.nombre; repAlumno.appendChild(op);}); }
  const gradeDoc=document.getElementById('gradeDocenteGuia'); if(gradeDoc){ gradeDoc.innerHTML='<option value="">Docente guia</option>'; usersCache.filter(u=>u.rol==='docente').forEach(d=>{const op=document.createElement('option'); op.value=d.id; op.textContent=`${d.nombre} (${d.email})`; gradeDoc.appendChild(op);}); }
  const alumnoClase=document.getElementById('alumnoClase'); if(alumnoClase){ alumnoClase.innerHTML='<option value="">Nombre de la clase</option>'; classesCache.forEach(c=>{const op=document.createElement('option'); op.value=c.id; op.textContent=`${c.nombre} (${c.codigo})`; op.dataset.cupos=c.cupos_disponibles??''; alumnoClase.appendChild(op);}); }
  const teacherClass=document.getElementById('tRepClase'); if(teacherClass){ teacherClass.innerHTML='<option value="">Todas / Seleccione</option>'; classesCache.forEach(c=>{const op=document.createElement('option'); op.value=c.id; op.textContent=`${c.nombre} (${c.codigo})`; teacherClass.appendChild(op);}); }
  const reportClass=document.getElementById('reportClaseDocente'); if(reportClass){ reportClass.innerHTML='<option value="">Seleccione clase</option>'; classesCache.forEach(c=>{const op=document.createElement('option'); op.value=c.id; op.textContent=`${c.nombre} (${c.codigo})`; reportClass.appendChild(op);}); }
  const controlClase=document.getElementById('controlClase'); if(controlClase){ controlClase.innerHTML='<option value="">Seleccione clase</option>'; classesCache.forEach(c=>{const op=document.createElement('option'); op.value=c.id; op.textContent=`${c.nombre} (${c.codigo})`; controlClase.appendChild(op);}); }
  const classGrado=document.getElementById('classGrado');
  const nivelSel = document.getElementById('classNivel')?.value || '';
  const gradoSelPrev = document.getElementById('classGrado')?.value || '';
  if(classGrado){
    classGrado.innerHTML='<option value="">Grado</option>';
    if(gradesCache.length){
      gradesCache.filter(g => !nivelSel || g.nivel===nivelSel).forEach(g=>{ const op=document.createElement('option'); op.value=g.nombre; op.textContent=`${g.grado_mostrar||g.nombre} (${g.nivel})`; classGrado.appendChild(op); });
    } else {
      GRADOS.forEach(v=>{ const op=document.createElement('option'); op.value=v; op.textContent=v; classGrado.appendChild(op); });
    }
    if (gradoSelPrev) classGrado.value = gradoSelPrev;
  }
  updateClassSecciones();
  fillSimpleSelect('repGrado',GRADOS,'Grado'); fillSimpleSelect('repNivel',NIVELES,'Nivel'); fillSimpleSelect('repSeccion',SECCIONES,'Seccion');
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
  if(!primaria||!basico||!diversificado||!carrera) return;
  const showPrim=nivel==='Primaria';
  const showBas=nivel==='Basico';
  const showCarr=nivel==='Diversificado';
  primaria.classList.toggle('hidden',!showPrim); primaria.required=showPrim; if(!showPrim) primaria.value='';
  basico.classList.toggle('hidden',!showBas); basico.required=showBas; if(!showBas) basico.value='';
  diversificado.classList.toggle('hidden',!showCarr); diversificado.required=showCarr; if(!showCarr) diversificado.value='';
  carrera.classList.toggle('hidden',!showCarr); carrera.required=showCarr; if(!showCarr) carrera.value='';
  updateGradeLocks();
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
  const alumnoClase = document.getElementById('alumnoClase');
  const alumnoSeccion = document.getElementById('alumnoSeccion');
  const alumnoCiclo = document.getElementById('alumnoCiclo');
  const alumnoCupos = document.getElementById('alumnoCuposDisp');
  const docenteFecha = document.getElementById('docenteFechaNac');
  const docenteEdad = document.getElementById('docenteEdad');
  if (alumnoFecha) alumnoFecha.value = '';
  if (alumnoEdad) alumnoEdad.value = '';
  if (alumnoNivel) alumnoNivel.value = '';
  if (alumnoClase) alumnoClase.value = '';
  if (alumnoSeccion) alumnoSeccion.value = '';
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
async function loadMyStudents(){ const r=await api('api/my_students.php'); if(!r.ok) return; const s=document.getElementById('reportAlumno'); if(!s) return; s.innerHTML='<option value="">Seleccione alumno</option>'; r.data.forEach(st=>{const op=document.createElement('option'); op.value=st.id; op.textContent=`${st.nombre} (${st.email})`; s.appendChild(op);}); }
async function loadStudentReports(){ const r=await api('api/student_reports.php'); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#myReportsTable tbody'); if(!tb) return; tb.innerHTML=''; r.data.forEach(x=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha}</td><td>${x.clase}</td><td>${x.docente}</td><td>${x.reporte}</td><td>${x.comentario||''}</td>`; tb.appendChild(tr);}); }

function initControlScanner(){
  if (scannerStarted || typeof Html5Qrcode === 'undefined') return;
  const reader = document.getElementById('reader');
  if (!reader) return;
  scannerStarted = true;
  const qr = new Html5Qrcode('reader');
  qr.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    async (decodedText) => {
      const claseId = Number(document.getElementById('controlClase')?.value || 0);
      if (!claseId) return alertErr('Selecciona una clase antes de escanear');
      const r = await api('api/control_mark_attendance.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clase_id: claseId, qr_data: decodedText })
      });
      if (!r.ok) return alertErr(r.message);
      alertOk(`${r.message}: ${r.data?.alumno || ''}`);
    },
    () => {}
  ).catch(() => alertErr('No se pudo iniciar la camara.'));
}

document.getElementById('logoutBtn')?.addEventListener('click',async()=>{ await api('api/logout.php',{method:'POST'}); location.href='index.html';});
themeToggleBtn?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});
document.querySelectorAll('.admin-tab').forEach(b=>b.addEventListener('click',()=>switchAdminView(b.dataset.adminView)));
document.getElementById('loadUsersBtn')?.addEventListener('click', loadUsers);
document.getElementById('userSearchName')?.addEventListener('input',renderUsers);
document.getElementById('adminRol')?.addEventListener('change',()=>{ resetByRoleChange(); toggleRoleFields(); });
document.getElementById('gradeNivel')?.addEventListener('change',()=>{ resetByNivelChange(); toggleGradeFields(); });
document.getElementById('classNivel')?.addEventListener('change',fillDynamic);
document.getElementById('classGrado')?.addEventListener('change',updateClassSecciones);
document.getElementById('gradeSeccion')?.addEventListener('input',()=>{ updateGradeLocks(); });
document.getElementById('gradeCarrera')?.addEventListener('input',()=>{ updateGradeLocks(); });
document.getElementById('adminNombres')?.addEventListener('input',e=>{ e.target.value=sanitizeLetters(e.target.value); const u=document.getElementById('adminUsername'); if(u) u.value=genUserPreview(document.getElementById('adminNombres').value,document.getElementById('adminApellidos').value);});
document.getElementById('adminApellidos')?.addEventListener('input',e=>{ e.target.value=sanitizeLetters(e.target.value); const u=document.getElementById('adminUsername'); if(u) u.value=genUserPreview(document.getElementById('adminNombres').value,document.getElementById('adminApellidos').value);});
document.getElementById('alumnoFechaNac')?.addEventListener('change',e=>{ const age=document.getElementById('alumnoEdad'); if(age) age.value=calcAge(e.target.value);});
document.getElementById('docenteFechaNac')?.addEventListener('change',e=>{ const age=document.getElementById('docenteEdad'); if(age) age.value=calcAge(e.target.value);});
document.getElementById('alumnoClase')?.addEventListener('change',e=>{ const c=document.getElementById('alumnoCuposDisp'); if(c) c.value=e.target.selectedOptions[0]?.dataset?.cupos ?? '';});
document.getElementById('loadMyReports')?.addEventListener('click', loadStudentReports);

document.querySelector('#usersTable')?.addEventListener('click', async (e)=>{
  const qrId=e.target.getAttribute('data-qr'); const editId=e.target.getAttribute('data-edit'); const delId=e.target.getAttribute('data-del');
  if(qrId){ const user=usersCache.find(u=>String(u.id)===String(qrId)); if(user) await showUserQr(user); return; }
  if(editId){ const current=usersCache.find(u=>String(u.id)===String(editId)); const sp=splitName(current?.nombre||''); const {value:fv}=await Swal.fire({title:`Editar usuario #${editId}`, html:`<input id="swNombres" class="swal2-input" placeholder="Nombres" value="${sp.nombres||''}"><input id="swApellidos" class="swal2-input" placeholder="Apellidos" value="${sp.apellidos||''}"><input id="swEmail" class="swal2-input" placeholder="Email" value="${current?.email||''}"><select id="swRol" class="swal2-input"><option value="alumno">alumno</option><option value="docente">docente</option><option value="admin">admin</option></select><input id="swPass" type="password" class="swal2-input" placeholder="Nueva contrasena (opcional)">`, didOpen:()=>{const rol=document.getElementById('swRol'); if(rol&&current?.rol) rol.value=current.rol;}, preConfirm:()=>({nombres:document.getElementById('swNombres').value,apellidos:document.getElementById('swApellidos').value,email:document.getElementById('swEmail').value,rol:document.getElementById('swRol').value,password:document.getElementById('swPass').value})}); if(!fv) return; const r=await api('api/users.php',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:Number(editId),...fv})}); if(!r.ok) return alertErr(r.message); await loadUsers(); return alertOk(r.message); }
  if(delId){ const ask=await Swal.fire({icon:'warning',title:'Eliminar usuario',text:'Esta accion no se puede deshacer',showCancelButton:true}); if(!ask.isConfirmed) return; const r=await api(`api/users.php?id=${delId}`,{method:'DELETE'}); if(!r.ok) return alertErr(r.message); await loadUsers(); alertOk(r.message); }
});

document.getElementById('adminCreateUserForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const rol=document.getElementById('adminRol').value; const payload={nombres:document.getElementById('adminNombres').value.trim(),apellidos:document.getElementById('adminApellidos').value.trim(),email:document.getElementById('adminEmail').value.trim(),password:document.getElementById('adminPass').value,rol}; if(rol==='alumno'){ payload.fecha_nacimiento=document.getElementById('alumnoFechaNac').value; payload.nivel=document.getElementById('alumnoNivel').value; payload.seccion=document.getElementById('alumnoSeccion').value; payload.ciclo_escolar=document.getElementById('alumnoCiclo').value; payload.clase_id=Number(document.getElementById('alumnoClase').value);} if(rol==='docente'){ payload.fecha_nacimiento=document.getElementById('docenteFechaNac').value;} const r=await api('api/register.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); toggleRoleFields(); await Promise.all([loadUsers(),loadClasses()]); switchAdminView('users'); alertOk(`${r.message}. Usuario: ${r.data?.username||''}`); });

document.getElementById('adminClassForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload={nivel:document.getElementById('classNivel').value,grado:document.getElementById('classGrado').value,seccion:document.getElementById('classSeccion').value.trim().toUpperCase(),nombre:document.getElementById('classNombre').value.trim(),dia:document.getElementById('classDia').value,horario:document.getElementById('classHorario').value}; const r=await api('api/classes.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); await loadClasses(); alertOk(r.message); });
document.getElementById('adminGradeForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload={nivel:document.getElementById('gradeNivel').value,grado_primaria:document.getElementById('gradePrimaria').value,grado_basico:document.getElementById('gradeBasico').value,grado_diversificado:document.getElementById('gradeDiversificado').value,carrera:document.getElementById('gradeCarrera').value.trim(),seccion:document.getElementById('gradeSeccion').value.trim(),cupos:Number(document.getElementById('gradeCupos').value),docente_guia_id:Number(document.getElementById('gradeDocenteGuia').value)}; const r=await api('api/grades.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); toggleGradeFields(); await loadGrades(); alertOk(r.message); });
document.getElementById('reportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const p=new URLSearchParams(); const f=document.getElementById('repFecha')?.value; const a=document.getElementById('repAlumno')?.value; const g=document.getElementById('repGrado')?.value; const n=document.getElementById('repNivel')?.value; const s=document.getElementById('repSeccion')?.value; if(f) p.set('fecha',f); if(a) p.set('alumno_id',a); if(g) p.set('grado',g); if(n) p.set('nivel',n); if(s) p.set('seccion',s); const r=await api(`api/report.php?${p.toString()}`); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#reportTable tbody'); if(!tb) return; tb.innerHTML=''; r.data.forEach(x=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha||''}</td><td>${x.clase||''}</td><td>${x.codigo||''}</td><td>${x.alumno||''}</td><td>${x.email||''}</td><td>${x.grado||''}</td><td>${x.nivel||''}</td><td>${x.seccion||''}</td><td>${x.ciclo_escolar||''}</td><td>${x.estado||''}</td><td>${x.registrado_en||''}</td>`; tb.appendChild(tr);}); });

document.getElementById('teacherReportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const p=new URLSearchParams(); const f=document.getElementById('tRepFecha')?.value; const em=document.getElementById('tRepEmail')?.value; const c=document.getElementById('tRepClase')?.value; if(f) p.set('fecha',f); if(em) p.set('email',em); if(c) p.set('clase_id',c); const r=await api(`api/report.php?${p.toString()}`); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#teacherReportTable tbody'); if(!tb) return; tb.innerHTML=''; r.data.forEach(x=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha}</td><td>${x.clase}</td><td>${x.alumno}</td><td>${x.email}</td><td>${x.estado}</td>`; tb.appendChild(tr);}); });

document.getElementById('studentReportForm')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const payload={clase_id:Number(document.getElementById('reportClaseDocente').value),alumno_id:Number(document.getElementById('reportAlumno').value),fecha:document.getElementById('reportFecha').value,reporte:document.getElementById('reportTexto').value,comentario:document.getElementById('commentTexto').value}; const r=await api('api/student_reports.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok) return alertErr(r.message); e.target.reset(); alertOk(r.message); });

document.getElementById('studentReportFormOnly')?.addEventListener('submit', async (e)=>{ e.preventDefault(); const p=new URLSearchParams(); const f=document.getElementById('sRepFecha')?.value; if(f) p.set('fecha',f); const r=await api(`api/report.php?${p.toString()}`); if(!r.ok) return alertErr(r.message); const tb=document.querySelector('#studentOnlyAttendanceTable tbody'); if(!tb) return; tb.innerHTML=''; r.data.forEach(x=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${x.fecha}</td><td>${x.clase}</td><td>${x.codigo}</td><td>${x.estado}</td><td>${x.registrado_en}</td>`; tb.appendChild(tr);}); });

async function init(){
  applyTheme(localStorage.getItem('theme') || 'light');
  initGsapDashboard();
  const s=await api('api/session.php');
  if(!s.ok||!s.data) return location.href='index.html';
  currentUser=s.data;
  userInfo.textContent=`${s.data.nombre} (${s.data.rol}) - ${s.data.email}`;
  await loadClasses();
  await loadGrades();

  if(s.data.rol==='admin'){ adminModule.classList.remove('hidden'); switchAdminView('users'); await loadUsers(); toggleRoleFields(); toggleGradeFields(); }
  if(s.data.rol==='docente'){ teacherModule.classList.remove('hidden'); await loadMyStudents(); }
  if(s.data.rol==='alumno'||s.data.rol==='estudiante'){ studentModule.classList.remove('hidden'); }
  if(s.data.rol==='control'){ controlModule.classList.remove('hidden'); initControlScanner(); }
}

init();







