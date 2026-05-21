<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_login();
$user = $_SESSION['user'];
$fecha = $_GET['fecha'] ?? '';
$email = $_GET['email'] ?? '';
$alumnoId = (int)($_GET['alumno_id'] ?? 0);
$claseId = (int)($_GET['clase_id'] ?? 0);
$grado = $_GET['grado'] ?? '';
$nivel = $_GET['nivel'] ?? '';
$seccion = $_GET['seccion'] ?? '';
$ciclo = $_GET['ciclo_escolar'] ?? '';

$sql = "SELECT a.id, a.fecha, a.estado, a.registrado_en, sq.token AS sesion_token, u.id AS alumno_id, u.nombre AS alumno, u.email, c.nombre AS clase, c.codigo, c.grado, c.nivel, c.seccion, c.ciclo_escolar
        FROM asistencias a
        INNER JOIN sesiones_qr sq ON sq.id = a.sesion_qr_id
        INNER JOIN usuarios u ON u.id = a.estudiante_id
        INNER JOIN clases c ON c.id = a.clase_id
        WHERE 1=1";
$params = [];
$types = '';

if ($user['rol'] === 'docente') {
    $sql .= ' AND c.docente_id = ?';
    $types .= 'i';
    $params[] = $user['id'];
}
if ($user['rol'] === 'alumno' || $user['rol'] === 'estudiante') {
    $sql .= ' AND a.estudiante_id = ?';
    $types .= 'i';
    $params[] = $user['id'];
}
if ($fecha) { $sql .= ' AND a.fecha = ?'; $types .= 's'; $params[] = $fecha; }
if ($alumnoId > 0 && $user['rol'] !== 'alumno' && $user['rol'] !== 'estudiante') { $sql .= ' AND a.estudiante_id = ?'; $types .= 'i'; $params[] = $alumnoId; }
if ($email && $user['rol'] !== 'alumno' && $user['rol'] !== 'estudiante') { $sql .= ' AND u.email = ?'; $types .= 's'; $params[] = $email; }
if ($claseId > 0) { $sql .= ' AND c.id = ?'; $types .= 'i'; $params[] = $claseId; }
if ($grado) { $sql .= ' AND c.grado = ?'; $types .= 's'; $params[] = $grado; }
if ($nivel) { $sql .= ' AND c.nivel = ?'; $types .= 's'; $params[] = $nivel; }
if ($seccion) { $sql .= ' AND c.seccion = ?'; $types .= 's'; $params[] = $seccion; }
if ($ciclo) { $sql .= ' AND c.ciclo_escolar = ?'; $types .= 's'; $params[] = $ciclo; }

$sql .= ' ORDER BY a.fecha DESC, a.registrado_en DESC';
$stmt = $conn->prepare($sql);
if ($types !== '') $stmt->bind_param($types, ...$params);
$stmt->execute();
json_response(true, 'OK', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
