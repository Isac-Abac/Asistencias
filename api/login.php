<?php
// Archivo: api/login.php
// Descripcion: Archivo backend del sistema de control de asistencias.

require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

$data = input_json();
$identifier = trim($data['identifier'] ?? '');
$password = $data['password'] ?? '';

if ($identifier === '' || $password === '') {
    json_response(false, 'Completa usuario/correo y contrasena', null, 400);
}

$stmt = $conn->prepare('SELECT id, nombre, username, email, password_hash, rol FROM usuarios WHERE email = ? OR username = ? LIMIT 1');
$stmt->bind_param('ss', $identifier, $identifier);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_response(false, 'Credenciales incorrectas', null, 401);
}

$_SESSION['user'] = [
    'id' => (int)$user['id'],
    'nombre' => $user['nombre'],
    'username' => $user['username'],
    'email' => $user['email'],
    'rol' => $user['rol']
];

json_response(true, 'Sesion iniciada', $_SESSION['user']);
