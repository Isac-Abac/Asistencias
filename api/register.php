<?php
require_once __DIR__ . '/bootstrap.php';

function calc_age($birthDate) {
    $birth = new DateTime($birthDate);
    $today = new DateTime('today');
    return $birth->diff($today)->y;
}

function build_username($nombre, $conn) {
    $parts = preg_split('/\s+/', trim($nombre));
    $first = strtolower(substr($parts[0] ?? 'u', 0, 1));
    $last = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $parts[1] ?? $parts[0] ?? 'user'));
    $base = $first . $last;

    for ($i = 0; $i < 20; $i++) {
        $candidate = $base . str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
        $q = $conn->prepare('SELECT id FROM usuarios WHERE username = ? LIMIT 1');
        $q->bind_param('s', $candidate);
        $q->execute();
        if ($q->get_result()->num_rows === 0) return $candidate;
    }
    return $base . time();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_role(['admin']);

$data = input_json();
$nombre = trim($data['nombre'] ?? '');
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$rol = $data['rol'] ?? 'alumno';

if (!$nombre || !$email || !$password) {
    json_response(false, 'Completa todos los campos', null, 422);
}

if (!in_array($rol, ['docente', 'alumno'], true)) {
    json_response(false, 'Rol invalido. Solo docente o alumno', null, 422);
}

$check = $conn->prepare('SELECT id FROM usuarios WHERE email = ?');
$check->bind_param('s', $email);
$check->execute();
if ($check->get_result()->num_rows > 0) {
    json_response(false, 'El correo ya existe', null, 409);
}

$username = build_username($nombre, $conn);
$hash = password_hash($password, PASSWORD_BCRYPT);

if ($rol === 'alumno') {
    $fechaNac = trim($data['fecha_nacimiento'] ?? '');
    $nivel = trim($data['nivel'] ?? '');
    $seccion = trim($data['seccion'] ?? '');
    $ciclo = trim($data['ciclo_escolar'] ?? '');
    $claseId = (int)($data['clase_id'] ?? 0);

    if (!$fechaNac || !$nivel || !$seccion || !$ciclo || $claseId <= 0) {
        json_response(false, 'Para alumno: fecha, nivel, seccion, ciclo y clase son obligatorios', null, 422);
    }

    $edad = calc_age($fechaNac);
    if ($edad < 3 || $edad > 100) {
        json_response(false, 'Edad invalida para registro', null, 422);
    }

    $cup = $conn->prepare('SELECT c.id, c.cupos, COUNT(i.id) AS inscritos FROM clases c LEFT JOIN inscripciones i ON i.clase_id = c.id WHERE c.id = ? GROUP BY c.id, c.cupos');
    $cup->bind_param('i', $claseId);
    $cup->execute();
    $cupInfo = $cup->get_result()->fetch_assoc();
    if (!$cupInfo) {
        json_response(false, 'Clase no encontrada', null, 404);
    }
    if ((int)$cupInfo['inscritos'] >= (int)$cupInfo['cupos']) {
        json_response(false, 'No hay cupos disponibles en la clase', null, 409);
    }

    $stmt = $conn->prepare('INSERT INTO usuarios(nombre, username, email, password_hash, rol, fecha_nacimiento, edad, nivel, seccion, ciclo_escolar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('ssssssisss', $nombre, $username, $email, $hash, $rol, $fechaNac, $edad, $nivel, $seccion, $ciclo);

    if (!$stmt->execute()) json_response(false, 'No se pudo registrar', null, 500);

    $newId = $stmt->insert_id;
    $ins = $conn->prepare('INSERT INTO inscripciones(clase_id, estudiante_id) VALUES (?, ?)');
    $ins->bind_param('ii', $claseId, $newId);
    if (!$ins->execute()) json_response(false, 'Usuario creado, pero no se pudo inscribir', null, 500);

    json_response(true, 'Alumno creado correctamente', ['username' => $username, 'edad' => $edad]);
}

$stmt = $conn->prepare('INSERT INTO usuarios(nombre, username, email, password_hash, rol) VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $nombre, $username, $email, $hash, $rol);

if (!$stmt->execute()) {
    json_response(false, 'No se pudo registrar', null, 500);
}

json_response(true, 'Usuario creado correctamente', ['username' => $username]);
