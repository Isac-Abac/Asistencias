<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

$data = input_json();
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';

$stmt = $conn->prepare('SELECT id, nombre, email, password_hash, rol FROM usuarios WHERE email = ?');
$stmt->bind_param('s', $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();

if (!$user || !password_verify($password, $user['password_hash'])) {
    json_response(false, 'Credenciales incorrectas', null, 401);
}

$_SESSION['user'] = [
    'id' => (int)$user['id'],
    'nombre' => $user['nombre'],
    'email' => $user['email'],
    'rol' => $user['rol']
];

json_response(true, 'Sesion iniciada', $_SESSION['user']);

