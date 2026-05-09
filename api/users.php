<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_role(['admin']);
    $rows = $conn->query('SELECT id, nombre, username, email, rol, creado_en FROM usuarios ORDER BY id DESC')->fetch_all(MYSQLI_ASSOC);
    json_response(true, 'OK', $rows);
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    require_role(['admin']);
    $data = input_json();
    $id = (int)($data['id'] ?? 0);
    $nombre = trim($data['nombre'] ?? '');
    $email = trim($data['email'] ?? '');
    $rol = $data['rol'] ?? '';
    $password = $data['password'] ?? '';

    if ($id <= 0 || !$nombre || !$email || !in_array($rol, ['docente', 'alumno', 'admin'], true)) {
        json_response(false, 'Datos invalidos', null, 422);
    }

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
    if ($id <= 0) {
        json_response(false, 'ID invalido', null, 422);
    }
    if ($id === (int)$_SESSION['user']['id']) {
        json_response(false, 'No puedes eliminar tu propio usuario', null, 422);
    }

    $stmt = $conn->prepare('DELETE FROM usuarios WHERE id = ?');
    $stmt->bind_param('i', $id);
    if (!$stmt->execute()) {
        json_response(false, 'No se pudo eliminar (puede tener relaciones activas)', null, 500);
    }

    json_response(true, 'Usuario eliminado');
}

json_response(false, 'Metodo no permitido', null, 405);

