const userInfo = document.getElementById('userInfo');
const adminModule = document.getElementById('adminModule');
const teacherModule = document.getElementById('teacherModule');
const studentModule = document.getElementById('studentModule');

let usersCache = [];
let classesCache = [];
let scannerStarted = false;

const GRADOS = ['1ro','2do','3ro','4to','5to','6to'];
const NIVELES = ['Primaria','Basico','Diversificado'];
const SECCIONES = ['A','B','C','D'];

const alertOk = (text) => Swal.fire({ icon: 'success', title: 'Correcto', text });
const alertErr = (text) => Swal.fire({ icon: 'error', title: 'Error', text });

async function api(url, options = {}) {
  const r = await fetch(url, options);
  const t = await r.text();
  try { return JSON.parse(String(t).replace(/^\uFEFF/, '').trim()); }
  catch { return { ok: false, message: `Respuesta invalida en ${url}` }; }
}

function sanitizeLetters(v) { return v.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ\s]/g, ''); }
function splitName(full) {
  const p = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { nombres: p.slice(0, -1).join(' ') || (p[0] || ''), apellidos: p.slice(-1).join(' ') || '' };
}
function genUserPreview(nombres, apellidos) {
  const n = (nombres || '').trim();
  const a = (apellidos || '').trim();
  if (!n || !a) return '';
  const ini = n[0].toLowerCase();
  const priApe = a.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  const num = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  return `${ini}${priApe}-${num}`;
}
function calcAge(dateStr) {
  if (!dateStr) return '';
  const b = new Date(dateStr + 'T00:00:00');
  const t = new Date();
  let e = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) e--;
  return e >= 0 ? e : '';
}

function switchAdminView(view) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.adminView === view));
  document.querySelectorAll('.admin-view').forEach(v => v.classList.toggle('hidden', v.id !== `adminView-${view}`));
}

function fillSimpleSelect(id, list, placeholder) {
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

function renderUsers() {
  const q = (document.getElementById('userSearchName')?.value || '').toLowerCase().trim();
  const data = q ? usersCache.filter(u => (u.nombre || '').toLowerCase().includes(q)) : usersCache;
  const tb = document.querySelector('#usersTable tbody');
  if (!tb) return;
  tb.innerHTML = '';
  data.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.id}</td><td>${u.nombre}</td><td><button class="link-btn" data-qr="${u.id}">${u.username || ''}</button></td><td>${u.email}</td><td>${u.rol}</td><td class="actions"><button data-edit="${u.id}">Editar</button><button data-del="${u.id}">Eliminar</button></td>`;
    tb.appendChild(tr);
  });
}

async function showUserQr(user) {
  const qrId = 'qrUserBox';
  await Swal.fire({
    title: `QR de ${user.username}`,
    html: `<div id="${qrId}" style="display:flex;justify-content:center;margin:8px 0"></div><button id="saveQrBtn" class="swal2-confirm swal2-styled" style="margin-top:8px">Guardar</button>`,
    showConfirmButton: false,
    didOpen: () => {
      const qrContainer = document.getElementById(qrId);
      qrContainer.innerHTML = '';
      new QRCode(qrContainer, { text: user.qr_payload || JSON.stringify(user), width: 220, height: 220 });
      document.getElementById('saveQrBtn').addEventListener('click', () => {
        const img = qrContainer.querySelector('img') || qrContainer.querySelector('canvas');
        if (!img) return;
        const url = img.tagName.toLowerCase() === 'img' ? img.src : img.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `${user.username || 'usuario'}-qr.png`;
        a.click();
      });
    }
  });
}

function fillDynamic() {
  const repAlumno = document.getElementById('repAlumno');
  if (repAlumno) {
    repAlumno.innerHTML = '<option value="">Nombre de alumno</option>';
    usersCache.filter(u => u.rol === 'alumno' || u.rol === 'estudiante').forEach(a => {
      const op = document.createElement('option'); op.value = a.id; op.textContent = a.nombre; repAlumno.appendChild(op);
    });
  }

  const classDoc = document.getElementById('classDocente');
  if (classDoc) {
    classDoc.innerHTML = '<option value="">Docente asignado</option>';
    usersCache.filter(u => u.rol === 'docente').forEach(d => {
      const op = document.createElement('option'); op.value = d.id; op.textContent = `${d.nombre} (${d.email})`; classDoc.appendChild(op);
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

  const teacherClass = document.getElementById('tRepClase');
  if (teacherClass) {
    teacherClass.innerHTML = '<option value="">Todas / Seleccione</option>';
    classesCache.forEach(c => {
      const op = document.createElement('option'); op.value = c.id; op.textContent = `${c.nombre} (${c.codigo})`; teacherClass.appendChild(op);
    });
  }

  const reportClass = document.getElementById('reportClaseDocente');
  if (reportClass) {
    reportClass.innerHTML = '<option value="">Seleccione clase</option>';
    classesCache.forEach(c => {
      const op = document.createElement('option'); op.value = c.id; op.textContent = `${c.nombre} (${c.codigo})`; reportClass.appendChild(op);
    });
  }

  fillSimpleSelect('repGrado', GRADOS, 'Grado');
  fillSimpleSelect('repNivel', NIVELES, 'Nivel');
  fillSimpleSelect('repSeccion', SECCIONES, 'Seccion');
}

function toggleRoleFields() {
  const rol = document.getElementById('adminRol')?.value;
  document.getElementById('alumnoExtraFields')?.classList.toggle('hidden', rol !== 'alumno');
  const showDoc = rol === 'docente';
  document.getElementById('docenteFechaNac')?.classList.toggle('hidden', !showDoc);
  document.getElementById('docenteEdad')?.classList.toggle('hidden', !showDoc);
}

async function loadUsers() {
  const r = await api('api/users.php');
  if (!r.ok) return alertErr(r.message);
  usersCache = Array.isArray(r.data) ? r.data : [];
  renderUsers();
  fillDynamic();
}

async function loadClasses() {
  const r = await api('api/classes.php');
  if (!r.ok) return;
  classesCache = Array.isArray(r.data) ? r.data : [];
  fillDynamic();
}

async function loadMyStudents() {
  const res = await api('api/my_students.php');
  if (!res.ok) return;
  const s = document.getElementById('reportAlumno');
  if (!s) return;
  s.innerHTML = '<option value="">Seleccione alumno</option>';
  res.data.forEach(st => {
    const op = document.createElement('option'); op.value = st.id; op.textContent = `${st.nombre} (${st.email})`; s.appendChild(op);
  });
}

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
  await api('api/logout.php', { method: 'POST' });
  location.href = 'index.html';
});

document.querySelectorAll('.admin-tab').forEach(b => b.addEventListener('click', () => switchAdminView(b.dataset.adminView)));
document.getElementById('userSearchName')?.addEventListener('input', renderUsers);
document.getElementById('adminRol')?.addEventListener('change', toggleRoleFields);

document.getElementById('adminNombres')?.addEventListener('input', e => {
  e.target.value = sanitizeLetters(e.target.value);
  const u = document.getElementById('adminUsername');
  if (u) u.value = genUserPreview(document.getElementById('adminNombres').value, document.getElementById('adminApellidos').value);
});
document.getElementById('adminApellidos')?.addEventListener('input', e => {
  e.target.value = sanitizeLetters(e.target.value);
  const u = document.getElementById('adminUsername');
  if (u) u.value = genUserPreview(document.getElementById('adminNombres').value, document.getElementById('adminApellidos').value);
});
document.getElementById('alumnoFechaNac')?.addEventListener('change', e => { const age = document.getElementById('alumnoEdad'); if (age) age.value = calcAge(e.target.value); });
document.getElementById('docenteFechaNac')?.addEventListener('change', e => { const age = document.getElementById('docenteEdad'); if (age) age.value = calcAge(e.target.value); });
document.getElementById('alumnoClase')?.addEventListener('change', e => { const c = document.getElementById('alumnoCuposDisp'); if (c) c.value = e.target.selectedOptions[0]?.dataset?.cupos ?? ''; });

document.querySelector('#usersTable')?.addEventListener('click', async (e) => {
  const qrId = e.target.getAttribute('data-qr');
  const editId = e.target.getAttribute('data-edit');
  const delId = e.target.getAttribute('data-del');
  if (qrId) {
    const user = usersCache.find(u => String(u.id) === String(qrId));
    if (user) await showUserQr(user);
    return;
  }
  if (editId) {
    const current = usersCache.find(u => String(u.id) === String(editId));
    const sp = splitName(current?.nombre || '');
    const { value: formValues } = await Swal.fire({
      title: `Editar usuario #${editId}`,
      html: `<input id="swNombres" class="swal2-input" placeholder="Nombres" value="${sp.nombres || ''}"><input id="swApellidos" class="swal2-input" placeholder="Apellidos" value="${sp.apellidos || ''}"><input id="swEmail" class="swal2-input" placeholder="Email" value="${current?.email || ''}"><select id="swRol" class="swal2-input"><option value="alumno">alumno</option><option value="docente">docente</option><option value="admin">admin</option></select><input id="swPass" type="password" class="swal2-input" placeholder="Nueva contrasena (opcional)">`,
      didOpen: () => { const rol = document.getElementById('swRol'); if (rol && current?.rol) rol.value = current.rol; },
      preConfirm: () => ({ nombres: document.getElementById('swNombres').value, apellidos: document.getElementById('swApellidos').value, email: document.getElementById('swEmail').value, rol: document.getElementById('swRol').value, password: document.getElementById('swPass').value })
    });
    if (!formValues) return;
    const r = await api('api/users.php', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(editId), ...formValues }) });
    if (!r.ok) return alertErr(r.message);
    await loadUsers();
    return alertOk(r.message);
  }
  if (delId) {
    const ask = await Swal.fire({ icon: 'warning', title: 'Eliminar usuario', text: 'Esta accion no se puede deshacer', showCancelButton: true });
    if (!ask.isConfirmed) return;
    const r = await api(`api/users.php?id=${delId}`, { method: 'DELETE' });
    if (!r.ok) return alertErr(r.message);
    await loadUsers();
    alertOk(r.message);
  }
});

document.getElementById('adminCreateUserForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const rol = document.getElementById('adminRol').value;
  const payload = {
    nombres: document.getElementById('adminNombres').value.trim(),
    apellidos: document.getElementById('adminApellidos').value.trim(),
    email: document.getElementById('adminEmail').value.trim(),
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
  if (rol === 'docente') payload.fecha_nacimiento = document.getElementById('docenteFechaNac').value;

  const r = await api('api/register.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) return alertErr(r.message);
  e.target.reset();
  toggleRoleFields();
  await Promise.all([loadUsers(), loadClasses()]);
  switchAdminView('users');
  alertOk(`${r.message}. Usuario: ${r.data?.username || ''}`);
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
  const r = await api('api/classes.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) return alertErr(r.message);
  e.target.reset();
  await loadClasses();
  alertOk(r.message);
});

document.getElementById('teacherReportForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const params = new URLSearchParams();
  const f = document.getElementById('tRepFecha')?.value;
  const eMail = document.getElementById('tRepEmail')?.value;
  const c = document.getElementById('tRepClase')?.value;
  if (f) params.set('fecha', f);
  if (eMail) params.set('email', eMail);
  if (c) params.set('clase_id', c);
  const r = await api(`api/report.php?${params.toString()}`);
  if (!r.ok) return alertErr(r.message);
  const tb = document.querySelector('#teacherReportTable tbody');
  if (!tb) return;
  tb.innerHTML = '';
  r.data.forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.fecha}</td><td>${x.clase}</td><td>${x.alumno}</td><td>${x.email}</td><td>${x.estado}</td>`;
    tb.appendChild(tr);
  });
});

document.getElementById('studentReportForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { clase_id: Number(document.getElementById('reportClaseDocente').value), alumno_id: Number(document.getElementById('reportAlumno').value), fecha: document.getElementById('reportFecha').value, reporte: document.getElementById('reportTexto').value, comentario: document.getElementById('commentTexto').value };
  const r = await api('api/student_reports.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!r.ok) return alertErr(r.message);
  e.target.reset();
  alertOk(r.message);
});

document.getElementById('studentReportFormOnly')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const params = new URLSearchParams();
  const f = document.getElementById('sRepFecha')?.value;
  if (f) params.set('fecha', f);
  const r = await api(`api/report.php?${params.toString()}`);
  if (!r.ok) return alertErr(r.message);
  const tb = document.querySelector('#studentOnlyAttendanceTable tbody');
  if (!tb) return;
  tb.innerHTML = '';
  r.data.forEach(x => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${x.fecha}</td><td>${x.clase}</td><td>${x.codigo}</td><td>${x.estado}</td><td>${x.registrado_en}</td>`;
    tb.appendChild(tr);
  });
});

function initScanner() {
  if (scannerStarted || typeof Html5Qrcode === 'undefined') return;
  const readerEl = document.getElementById('reader');
  if (!readerEl) return;
  scannerStarted = true;
  const html5QrCode = new Html5Qrcode('reader');
  html5QrCode.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, async (decodedText) => {
    try {
      const parsed = JSON.parse(decodedText);
      if (!parsed.token) throw new Error();
      const r = await api('api/mark_attendance.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: parsed.token }) });
      if (!r.ok) return alertErr(r.message);
      alertOk(r.message);
    } catch {
      alertErr('QR invalido.');
    }
  }, () => {}).catch(() => alertErr('No se pudo iniciar la camara.'));
}

async function init() {
  const s = await api('api/session.php');
  if (!s.ok || !s.data) return location.href = 'index.html';
  userInfo.textContent = `${s.data.nombre} (${s.data.rol}) - ${s.data.email}`;

  await loadClasses();

  if (s.data.rol === 'admin') {
    adminModule.classList.remove('hidden');
    switchAdminView('users');
    await loadUsers();
    toggleRoleFields();
  }

  if (s.data.rol === 'docente') {
    teacherModule.classList.remove('hidden');
    await loadMyStudents();
  }

  if (s.data.rol === 'alumno' || s.data.rol === 'estudiante') {
    studentModule.classList.remove('hidden');
    initScanner();
  }
}

init();
