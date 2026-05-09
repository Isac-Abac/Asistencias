const form = document.getElementById('loginForm');

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

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    email: document.getElementById('email').value,
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
