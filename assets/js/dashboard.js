const userInfo = document.getElementById('userInfo');
const teacherModule = document.getElementById('teacherModule');
const studentModule = document.getElementById('studentModule');
const adminModule = document.getElementById('adminModule');

let currentUser = null;
let scannerStarted = false;
let classesCache = [];
let usersCache = [];

const GRADOS = ['1ro', '2do', '3ro', '4to', '5to', '6to'];
const NIVELES = ['Primaria', 'Basico', 'Diversificado'];
const SECCIONES = ['A', 'B', 'C', 'D'];

function alertOk(text) { return Swal.fire({ icon: 'success', title: 'Correcto', text }); }
function alertErr(text) { return Swal.fire({ icon: 'error', title: 'Error', text }); }
function safeParseJson(raw) { return JSON.parse(String(raw || '').replace(/^\uFEFF/, '').trim()); }

async function api(url, options = {}) {
  const r = await fetch(url, options);
  const raw = await r.text();
  try { return safeParseJson(raw); } catch { return { ok: false, message: `Respuesta invalida en ${url}` }; }
}

function genUsernamePreview(nombre) {
  const parts = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = (parts[0][0] || 'u').toLowerCase();
  const last = (parts[1] || parts[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
  const rnd = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `${first}${last}${rnd}`;
}

function calcAge(fecha) {
  if (!fecha) return '';
  const birth = new Date(fecha + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : '';
}

function switchAdminView(view) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.adminView === view));
  document.querySelectorAll('.admin-view').forEach(v => {
    const isTarget = v.id === `adminView-${view}`;
    v.classList.toggle('hidden', !isTarget);
    v.classList.remove('view-anim');
    if (isTarget) { void v.offsetWidth; v.classList.add('view-anim'); }
  });
}

function renderUsersTable(users) {
  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id}</td><td>${u.nombre}</td><td>${u.username || ''}</td><td>${u.email}</td><td>${u.rol}</td><td class="actions"><button data-edit="${u.id}">Editar</button><button data-del="${u.id}">Eliminar</button></td>`;
    tbody.appendChild(tr);
  });
}

function applyUserNameFilter() {
  const q = (document.getElementById('userSearchName')?.value || '').toLowerCase().trim();
  if (!q) return renderUsersTable(usersCache);
  renderUsersTable(usersCache.filter(u => (u.nombre || '').toLowerCase().includes(q)));
}

function fillSelect(id, list, placeholder) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<option value="">${placeholder}</option>`;
  list.forEach(v => {
    const op = document.createElement('option');
    op.value = v;
    op.textContent = v;
    el.appendChild(op);
  });
}

function toggleAlumnoFields() {
  const rol = document.getElementById('adminRol')?.value;
  const box = document.getElementById('alumnoExtraFields');
  if (!box) return;
  box.classList.toggle('hidden', rol !== 'alumno');
}

function fillAdminFiltersAndClassSelects() {
  const alumnos = usersCache.filter(u => u.rol === 'alumno' || u.rol === 'estudiante');
  const docentes = usersCache.filter(u => u.rol === 'docente');

  const repAlumno = document.getElementById('repAlumno');
  if (repAlumno) {
    repAlumno.innerHTML = '<option value="">Nombre de alumno</option>';
    alumnos.forEach(a => {
      const op = document.createElement('option');
      op.value = a.id;
      op.textContent = a.nombre;
      repAlumno.appendChild(op);
    });
  }

  const classDoc = document.getElementById('classDocente');
  if (classDoc) {
    classDoc.innerHTML = '<option value="">Docente asignado</option>';
    docentes.forEach(d => {
      const op = document.createElement('option');
      op.value = d.id;
      op.textContent = `${d.nombre} (${d.email})`;
      classDoc.appendChild(op);
    });
  }

  const alumnoClase = document.getElementById('alumnoClase');
  if (alumnoClase) {
    alumnoClase.innerHTML = '<option value="">Nombre de la clase</option>';
    classesCache.forEach(c => {
      const op = document.createElement('option');
      op.value = c.id;
      op.textContent = `${c.nombre} (${c.codigo})`;
      op.dataset.cupos = c.cupos_disponibles ?? '';
      alumnoClase.appendChild(op);
    });
  }

  fillSelect('repGrado', GRADOS, 'Grado');
  fillSelect('repNivel', NIVELES, 'Nivel');
  fillSelect('repSeccion', SECCIONES, 'Seccion');
}

async function loadSession() {
  const res = await api('api/session.php');
  if (!res.ok || !res.data) return location.href = 'index.html';
  currentUser = res.data;
  userInfo.textContent = `${currentUser.nombre} (${currentUser.rol}) - ${currentUser.email}`;
  if (currentUser.rol === 'admin') { adminModule.classList.remove('hidden'); switchAdminView('users'); }
  if (currentUser.rol === 'docente') teacherModule.classList.remove('hidden');
  if (currentUser.rol === 'alumno' || currentUser.rol === 'estudiante') { studentModule.classList.remove('hidden'); initScanner(); }

  ['repFecha', 'reportFecha', 'tRepFecha', 'sRepFecha'].forEach(setDate);

  await loadClasses();
  if (currentUser.rol === 'admin') await loadUsers();
  if (currentUser.rol === 'docente') await loadMyStudents();
  toggleAlumnoFields();
}

function setDate(id) { const el = document.getElementById(id); if (el) el.valueAsDate = new Date(); }

async function loadClasses() {
  const res = await api('api/classes.php');
  if (!res.ok || !Array.isArray(res.data)) return;
  classesCache = res.data;

  ['reportClaseDocente', 'tRepClase'].forEach(id => {
    const s = document.getElementById(id);
    if (!s) return;
    s.innerHTML = '<option value="">Todas / Seleccione</option>';
    classesCache.forEach(c => {
      const op = document.createElement('option');
      op.value = c.id;
      op.textContent = `${c.nombre} (${c.codigo})`;
      s.appendChild(op);
    });
  });

  fillAdminFiltersAndClassSelects();
}

async function loadUsers() {
  const res = await api('api/users.php');
  if (!res.ok) return alertErr(res.message);
  usersCache = Array.isArray(res.data) ? res.data : [];
  applyUserNameFilter();
  fillAdminFiltersAndClassSelects();
}

async function loadMyStudents() {
  const res = await api('api/my_students.php');
  if (!res.ok) return;
  const s = document.getElementById('reportAlumno');
  if (!s) return;
  s.innerHTML = '<option value="">Seleccione alumno</option>';
  res.data.forEach(st => {
    const op = document.createElement('option');
    op.value = st.id;
    op.textContent = `${st.nombre} (${st.email})`;
    s.appendChild(op);
  });
}

document.getElementById('logoutBtn').addEventListener('click', async () => { await api('api/logout.php', { method: 'POST' }); location.href = 'index.html'; });
document.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => switchAdminView(btn.dataset.adminView)));
document.getElementById('userSearchName')?.addEventListener('input', applyUserNameFilter);
document.getElementById('adminRol')?.addEventListener('change', toggleAlumnoFields);
document.getElementById('adminNombre')?.addEventListener('input', (e) => { const u = document.getElementById('adminUsername'); if (u) u.value = genUsernamePreview(e.target.value); });
document.getElementById('alumnoFechaNac')?.addEventListener('change', (e) => { const age = document.getElementById('alumnoEdad'); if (age) age.value = calcAge(e.target.value); });
document.getElementById('alumnoClase')?.addEventListener('change', (e) => {
  const op = e.target.selectedOptions[0];
  const c = document.getElementById('alumnoCuposDisp');
  if (c) c.value = op?.dataset?.cupos ?? '';
});

document.getElementById('adminCreateUserForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rol = document.getElementById('adminRol').value;
  const payload = {
    nombre: document.getElementById('adminNombre').value,
    email: document.getElementById('adminEmail').value,
    password: document.getElementById('adminPass').value,
    rol
  };
  if (rol === 'alumno') {
    payload.fecha_nacimiento = document.getElementById('alumnoFechaNac').value;
    payload.nivel = document.getElementById('alumnoNivel').value;
    payload.seccion = document.getElementById('alumnoSeccion').value;
    payload.ciclo_escolar = document.getElementById('alumnoCiclo').value;
    payload.clase_id = Number(document.getElementById('alumnoClase').value);
  }

  const res = await api('api/register.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return alertErr(res.message);
  e.target.reset();
  toggleAlumnoFields();
  await Promise.all([loadUsers(), loadClasses()]);
  switchAdminView('users');
  alertOk(`${res.message}. Usuario: ${res.data?.username || ''}`);
});

document.getElementById('adminClassForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('classNombre').value,
    codigo: document.getElementById('classCodigo').value,
    horario: document.getElementById('classHorario').value,
    docente_id: Number(document.getElementById('classDocente').value),
    grado: document.getElementById('classGrado').value,
    nivel: document.getElementById('classNivel').value,
    seccion: document.getElementById('classSeccion').value,
    ciclo_escolar: document.getElementById('classCiclo').value,
    cupos: Number(document.getElementById('classCupos').value)
  };
  const res = await api('api/classes.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return alertErr(res.message);
  e.target.reset();
  await loadClasses();
  alertOk(res.message);
});

document.getElementById('loadUsersBtn')?.addEventListener('click', loadUsers);

document.querySelector('#usersTable')?.addEventListener('click', async (e) => {
  const editId = e.target.getAttribute('data-edit');
  const delId = e.target.getAttribute('data-del');
  if (editId) {
    const current = usersCache.find(u => String(u.id) === String(editId));
    const { value: formValues } = await Swal.fire({
      title: `Editar usuario #${editId}`,
      html: `<input id="swName" class="swal2-input" placeholder="Nombre" value="${current?.nombre || ''}"><input id="swEmail" class="swal2-input" placeholder="Email" value="${current?.email || ''}"><select id="swRol" class="swal2-input"><option value="alumno">alumno</option><option value="docente">docente</option><option value="admin">admin</option></select><input id="swPass" type="password" class="swal2-input" placeholder="Nueva contrasena (opcional)">`,
      didOpen: () => { const rol = document.getElementById('swRol'); if (rol && current?.rol) rol.value = current.rol; },
      preConfirm: () => ({ nombre: document.getElementById('swName').value, email: document.getElementById('swEmail').value, rol: document.getElementById('swRol').value, password: document.getElementById('swPass').value })
    });
    if (!formValues) return;
    const res = await api('api/users.php', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(editId), ...formValues }) });
    if (!res.ok) return alertErr(res.message);
    await loadUsers();
    return alertOk(res.message);
  }
  if (delId) {
    const ask = await Swal.fire({ icon: 'warning', title: 'Eliminar usuario', text: 'Esta accion no se puede deshacer', showCancelButton: true });
    if (!ask.isConfirmed) return;
    const res = await api(`api/users.php?id=${delId}`, { method: 'DELETE' });
    if (!res.ok) return alertErr(res.message);
    await loadUsers();
    alertOk(res.message);
  }
});

document.getElementById('studentReportForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { clase_id: Number(document.getElementById('reportClaseDocente').value), alumno_id: Number(document.getElementById('reportAlumno').value), fecha: document.getElementById('reportFecha').value, reporte: document.getElementById('reportTexto').value, comentario: document.getElementById('commentTexto').value };
  const res = await api('api/student_reports.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) return alertErr(res.message);
  e.target.reset();
  alertOk(res.message);
});

function renderAttendanceRows(rows, tbodySelector, studentOnly = false) {
  const tbody = document.querySelector(tbodySelector);
  if (!tbody) return;
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = studentOnly
      ? `<td>${r.fecha}</td><td>${r.clase}</td><td>${r.codigo}</td><td>${r.estado}</td><td>${r.registrado_en}</td>`
      : `<td>${r.fecha}</td><td>${r.clase}</td><td>${r.codigo}</td><td>${r.alumno}</td><td>${r.email}</td><td>${r.grado || ''}</td><td>${r.nivel || ''}</td><td>${r.seccion || ''}</td><td>${r.ciclo_escolar || ''}</td><td>${r.estado}</td><td>${r.registrado_en}</td>`;
    tbody.appendChild(tr);
  });
}

async function queryAttendance(prefix, tbodySelector, studentOnly = false) {
  const params = new URLSearchParams();
  const keys = studentOnly
    ? [['fecha', `${prefix}Fecha`]]
    : [['fecha', `${prefix}Fecha`], ['alumno_id', `${prefix}Alumno`], ['clase_id', `${prefix}Clase`], ['grado', `${prefix}Grado`], ['nivel', `${prefix}Nivel`], ['seccion', `${prefix}Seccion`], ['ciclo_escolar', `${prefix}Ciclo`], ['email', `${prefix}Email`]];
  keys.forEach(([k, id]) => { const el = document.getElementById(id); if (el && el.value) params.set(k, el.value); });
  const res = await api(`api/report.php?${params.toString()}`);
  if (!res.ok) return alertErr(res.message);
  renderAttendanceRows(res.data, tbodySelector, studentOnly);
}

document.getElementById('reportForm')?.addEventListener('submit', async (e) => { e.preventDefault(); await queryAttendance('rep', '#reportTable tbody'); });
document.getElementById('teacherReportForm')?.addEventListener('submit', async (e) => { e.preventDefault(); await queryAttendance('tRep', '#teacherReportTable tbody'); });
document.getElementById('studentReportFormOnly')?.addEventListener('submit', async (e) => { e.preventDefault(); await queryAttendance('sRep', '#studentOnlyAttendanceTable tbody', true); });

function initScanner() {
  if (scannerStarted || typeof Html5Qrcode === 'undefined') return;
  scannerStarted = true;
  const html5QrCode = new Html5Qrcode('reader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    async (decodedText) => {
      try {
        const parsed = JSON.parse(decodedText);
        if (!parsed.token) throw new Error();
        const res = await api('api/mark_attendance.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: parsed.token }) });
        if (!res.ok) return alertErr(res.message);
        alertOk(res.message);
      } catch { alertErr('QR invalido.'); }
    },
    () => {}
  ).catch(() => alertErr('No se pudo iniciar la camara.'));
}

loadSession();
