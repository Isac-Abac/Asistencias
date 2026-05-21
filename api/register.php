<?php
require_once __DIR__ . '/bootstrap.php';

function ensure_register_schema($conn) {
    $conn->query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS grado VARCHAR(120) NULL");
}

ensure_register_schema($conn);

function calc_age($birthDate) {
    $birth = new DateTime($birthDate);
    $today = new DateTime('today');
    return $birth->diff($today)->y;
}

function valid_birthdate_with_min_age($birthDate, $minAge) {
    $birth = DateTime::createFromFormat('Y-m-d', $birthDate);
    if (!$birth || $birth->format('Y-m-d') !== $birthDate) return false;
    $today = new DateTime('today');
    if ($birth > $today) return false;
    $maxAllowed = (clone $today)->modify("-{$minAge} years");
    return $birth <= $maxAllowed;
}

function only_letters_spaces($text) {
    return preg_match('/^[\p{L}\s]+$/u', $text) === 1;
}

function build_username($nombres, $apellidos, $conn) {
    $partsName = preg_split('/\s+/', trim($nombres));
    $partsLast = preg_split('/\s+/', trim($apellidos));
    $firstInitial = strtolower(substr($partsName[0] ?? 'u', 0, 1));
    $firstLast = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $partsLast[0] ?? 'user'));
    $base = $firstInitial . $firstLast . '-';

    for ($i = 0; $i < 30; $i++) {
        $candidate = $base . str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
        $q = $conn->prepare('SELECT id FROM usuarios WHERE username = ? LIMIT 1');
        $q->bind_param('s', $candidate);
        $q->execute();
        if ($q->get_result()->num_rows === 0) return $candidate;
    }
    return $base . str_pad((string)random_int(0, 99999), 5, '0', STR_PAD_LEFT);
}

function qr_payload($id, $nombre, $username, $email, $rol) {
    return json_encode([
        'id' => (int)$id,
        'nombre' => $nombre,
        'username' => $username,
        'email' => $email,
        'rol' => $rol
    ], JSON_UNESCAPED_UNICODE);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_response(false, 'Metodo no permitido', null, 405);
require_role(['admin']);

$data = input_json();
$nombres = trim($data['nombres'] ?? '');
$apellidos = trim($data['apellidos'] ?? '');
$email = trim($data['email'] ?? '');
$password = $data['password'] ?? '';
$rol = $data['rol'] ?? 'alumno';

if (!$nombres || !$apellidos || !$email || !$password) json_response(false, 'Completa todos los campos obligatorios', null, 422);
if (!only_letters_spaces($nombres) || !only_letters_spaces($apellidos)) json_response(false, 'Nombres y apellidos solo aceptan letras y espacios', null, 422);
if (!in_array($rol, ['docente', 'alumno'], true)) json_response(false, 'Rol invalido. Solo docente o alumno', null, 422);

$check = $conn->prepare('SELECT id FROM usuarios WHERE email = ?');
$check->bind_param('s', $email);
$check->execute();
if ($check->get_result()->num_rows > 0) json_response(false, 'El correo ya existe', null, 409);

$nombreCompleto = $nombres . ' ' . $apellidos;
$username = build_username($nombres, $apellidos, $conn);
$hash = password_hash($password, PASSWORD_BCRYPT);

if ($rol === 'alumno') {
    $fechaNac = trim($data['fecha_nacimiento'] ?? '');
    $nivel = trim($data['nivel'] ?? '');
    $grado = trim($data['grado'] ?? '');
    $seccion = trim($data['seccion'] ?? '');
    $ciclo = trim($data['ciclo_escolar'] ?? '');
    if (!$fechaNac || !$nivel || !$grado || !$seccion || !$ciclo) json_response(false, 'Para alumno: fecha, nivel, nombre de grado, seccion y ciclo son obligatorios', null, 422);
    if (!valid_birthdate_with_min_age($fechaNac, 7)) json_response(false, 'Fecha de nacimiento invalida para alumno (minimo 7 anos y no futura)', null, 422);
    $edad = calc_age($fechaNac);
    if ($edad < 7 || $edad > 100) json_response(false, 'Edad invalida para registro', null, 422);

    $gradeQ = $conn->prepare('SELECT id, cupos FROM grados WHERE nivel = ? AND nombre = ? AND seccion = ? LIMIT 1');
    if (!$gradeQ) json_response(false, 'Error al consultar grados', null, 500);
    $gradeQ->bind_param('sss', $nivel, $grado, $seccion);
    $gradeQ->execute();
    $gradeRow = $gradeQ->get_result()->fetch_assoc();
    if (!$gradeRow) json_response(false, 'No existe grado para ese nivel, nombre de grado y seccion', null, 422);

    $usedQ = $conn->prepare("SELECT COUNT(*) AS inscritos FROM usuarios WHERE rol IN ('alumno','estudiante') AND nivel = ? AND grado = ? AND seccion = ?");
    if (!$usedQ) json_response(false, 'Error al validar cupos del grado', null, 500);
    $usedQ->bind_param('sss', $nivel, $grado, $seccion);
    $usedQ->execute();
    $inscritos = (int)($usedQ->get_result()->fetch_assoc()['inscritos'] ?? 0);
    $cuposGrado = (int)$gradeRow['cupos'];
    if ($inscritos >= $cuposGrado) json_response(false, 'No hay cupos disponibles en el grado/seccion', null, 409);

    $stmt = $conn->prepare('INSERT INTO usuarios(nombre, username, email, password_hash, rol, fecha_nacimiento, edad, nivel, grado, seccion, ciclo_escolar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    if (!$stmt) json_response(false, 'Error al crear usuario alumno', null, 500);
    $stmt->bind_param('ssssssissss', $nombreCompleto, $username, $email, $hash, $rol, $fechaNac, $edad, $nivel, $grado, $seccion, $ciclo);
    if (!$stmt->execute()) json_response(false, 'No se pudo registrar', null, 500);

    $newId = $stmt->insert_id;

    // Si ya hay cursos creados para ese grado/seccion, inscribir al alumno en todos.
    $classIds = [];
    $findClasses = $conn->prepare('SELECT id FROM clases WHERE nivel = ? AND grado = ? AND seccion = ?');
    if (!$findClasses) json_response(false, 'Error al consultar cursos del grado', null, 500);
    $findClasses->bind_param('sss', $nivel, $grado, $seccion);
    $findClasses->execute();
    $resClasses = $findClasses->get_result();
    while ($row = $resClasses->fetch_assoc()) {
        $classIds[] = (int)$row['id'];
    }
    if (!empty($classIds)) {
        $ins = $conn->prepare('INSERT IGNORE INTO inscripciones(clase_id, estudiante_id) VALUES (?, ?)');
        if (!$ins) json_response(false, 'Error al preparar inscripcion en cursos', null, 500);
        foreach ($classIds as $classId) {
            $ins->bind_param('ii', $classId, $newId);
            if (!$ins->execute()) json_response(false, 'Usuario creado, pero no se pudo inscribir en cursos existentes', null, 500);
        }
    }

    json_response(true, 'Alumno creado correctamente', [
      'username' => $username,
      'edad' => $edad,
      'qr_payload' => qr_payload($newId, $nombreCompleto, $username, $email, $rol)
    ]);
}

$fechaNacDoc = trim($data['fecha_nacimiento'] ?? '');
if (!$fechaNacDoc) json_response(false, 'Fecha de nacimiento requerida para docente', null, 422);
if (!valid_birthdate_with_min_age($fechaNacDoc, 18)) json_response(false, 'Fecha de nacimiento invalida para docente (minimo 18 anos y no futura)', null, 422);
$edadDoc = calc_age($fechaNacDoc);
if ($edadDoc < 18 || $edadDoc > 100) json_response(false, 'Edad invalida para docente', null, 422);

$stmt = $conn->prepare('INSERT INTO usuarios(nombre, username, email, password_hash, rol, fecha_nacimiento, edad) VALUES (?, ?, ?, ?, ?, ?, ?)');
$stmt->bind_param('ssssssi', $nombreCompleto, $username, $email, $hash, $rol, $fechaNacDoc, $edadDoc);
if (!$stmt->execute()) json_response(false, 'No se pudo registrar', null, 500);
$newId = $stmt->insert_id;

json_response(true, 'Docente creado correctamente', [
  'username' => $username,
  'edad' => $edadDoc,
  'qr_payload' => qr_payload($newId, $nombreCompleto, $username, $email, $rol)
]);
