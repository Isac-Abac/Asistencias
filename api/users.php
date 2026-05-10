<?php
require_once __DIR__ . '/bootstrap.php';

function only_letters_spaces($text) {
    return preg_match('/^[\p{L}\s]+$/u', $text) === 1;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_role(['admin']);
    $rows = $conn->query('SELECT id, nombre, username, email, rol, creado_en FROM usuarios ORDER BY id DESC')->fetch_all(MYSQLI_ASSOC);

    foreach ($rows as &$r) {
        $r['qr_payload'] = json_encode([
            'id' => (int)$r['id'],
            'nombre' => $r['nombre'],
            'username' => $r['username'],
            'email' => $r['email'],
            'rol' => $r['rol']
        ], JSON_UNESCAPED_UNICODE);
    }

    json_response(true, 'OK', $rows);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    require_role(['admin']);
    $data = input_json();
    $id = (int)($data['id'] ?? 0);
    $nombres = trim($data['nombres'] ?? '');
    $apellidos = trim($data['apellidos'] ?? '');
    $email = trim($data['email'] ?? '');
    $rol = $data['rol'] ?? '';
    $password = $data['password'] ?? '';

    if ($id <= 0 || !$nombres || !$apellidos || !$email || !in_array($rol, ['docente', 'alumno', 'admin'], true)) {
        json_response(false, 'Datos invalidos', null, 422);
    }

    if (!only_letters_spaces($nombres) || !only_letters_spaces($apellidos)) {
        json_response(false, 'Nombres y apellidos solo aceptan letras y espacios', null, 422);
    }

    $nombre = $nombres . ' ' . $apellidos;

    if ($password !== '') {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $conn->prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ?, password_hash = ? WHERE id = ?');
        $stmt->bind_param('ssssi', $nombre, $email, $rol, $hash, $id);
    } else {
        $stmt = $conn->prepare('UPDATE usuarios SET nombre = ?, email = ?, rol = ? WHERE id = ?');
        $stmt->bind_param('sssi', $nombre, $email, $rol, $id);
    }

    if (!$stmt->execute()) {
        json_response(false, 'No se pudo actualizar', null, 500);
    }

    json_response(true, 'Usuario actualizado');
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    require_role(['admin']);
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) json_response(false, 'ID invalido', null, 422);
    if ($id === (int)$_SESSION['user']['id']) json_response(false, 'No puedes eliminar tu propio usuario', null, 422);

    $stmt = $conn->prepare('DELETE FROM usuarios WHERE id = ?');
    $stmt->bind_param('i', $id);
    if (!$stmt->execute()) json_response(false, 'No se pudo eliminar (puede tener relaciones activas)', null, 500);

    json_response(true, 'Usuario eliminado');
}

json_response(false, 'Metodo no permitido', null, 405);
