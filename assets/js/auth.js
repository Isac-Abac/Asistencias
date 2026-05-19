const form = document.getElementById('loginForm');
const togglePasswordBtn = document.getElementById('togglePasswordBtn');
const eyeOpenIcon = document.getElementById('eyeOpenIcon');
const eyeClosedIcon = document.getElementById('eyeClosedIcon');
const themeToggleBtn = document.getElementById('themeToggleBtn');

function showError(text) {
  if (window.Swal) {
    Swal.fire({ icon: 'error', title: 'Error', text });
  } else {
    alert(text);
  }
}

function showSuccess(text, cb) {
  if (window.Swal) {
    Swal.fire({ icon: 'success', title: 'Bienvenido', text, timer: 900, showConfirmButton: false }).then(cb);
  } else {
    alert(text);
    cb();
  }
}

function safeParseJson(raw) {
  const cleaned = String(raw || '')
    .replace(/^\uFEFF/, '')
    .trim();
  return JSON.parse(cleaned);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? '\u263C Modo claro' : '\u263E Modo oscuro';
    themeToggleBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}

function initGsapAuth() {
  if (!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  gsap.from('.auth-container h1', { y: -28, opacity: 0, duration: 0.55, ease: 'power2.out' });
  gsap.from('.auth-container p', { y: -16, opacity: 0, duration: 0.5, delay: 0.1, ease: 'power2.out' });
  gsap.from('#loginForm', { y: 26, opacity: 0, duration: 0.6, delay: 0.15, ease: 'power3.out' });

  const card = document.querySelector('#loginForm');
  document.addEventListener('mousemove', (e) => {
    if (!card) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 8;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    gsap.to(card, { x, y, duration: 0.4, overwrite: 'auto', ease: 'power1.out' });
  });
}

const savedTheme = localStorage.getItem('theme') || 'light';
applyTheme(savedTheme);
initGsapAuth();

themeToggleBtn?.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

togglePasswordBtn?.addEventListener('click', () => {
  const pass = document.getElementById('password');
  if (!pass) return;
  const show = pass.type === 'password';
  pass.type = show ? 'text' : 'password';
  eyeOpenIcon?.classList.toggle('hidden', show);
  eyeClosedIcon?.classList.toggle('hidden', !show);
  togglePasswordBtn.setAttribute('aria-label', show ? 'Ocultar contrasena' : 'Mostrar contrasena');
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    identifier: document.getElementById('identifier').value.trim(),
    password: document.getElementById('password').value
  };

  try {
    const res = await fetch('api/login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const raw = await res.text();
    let data;

    try {
      data = safeParseJson(raw);
    } catch {
      console.error('Respuesta cruda login.php:', raw);
      showError('Respuesta invalida del servidor. Revisa consola (F12) para ver detalle.');
      return;
    }

    if (!data.ok) {
      showError(data.message || 'No fue posible iniciar sesion.');
      return;
    }

    showSuccess(data.message || 'Sesion iniciada', () => {
      location.href = 'dashboard.html';
    });
  } catch {
    showError('No se pudo conectar con el servidor.');
  }
});



