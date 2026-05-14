<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_role(['control']);
$data = input_json();
$claseId = (int)($data['clase_id'] ?? 0);
$qrRaw = trim($data['qr_data'] ?? '');

if ($claseId <= 0 || !$qrRaw) {
    json_response(false, 'Clase y QR son obligatorios', null, 422);
}

$clase = $conn->prepare('SELECT id FROM clases WHERE id = ?');
$clase->bind_param('i', $claseId);
$clase->execute();
if ($clase->get_result()->num_rows === 0) {
    json_response(false, 'Clase no encontrada', null, 404);
}

$payload = json_decode($qrRaw, true);
if (!is_array($payload) || !isset($payload['id'])) {
    json_response(false, 'QR invalido para alumno', null, 422);
}

$studentId = (int)$payload['id'];
$u = $conn->prepare("SELECT id, rol, nombre FROM usuarios WHERE id = ? AND rol IN ('alumno','estudiante')");
$u->bind_param('i', $studentId);
$u->execute();
$student = $u->get_result()->fetch_assoc();
if (!$student) {
    json_response(false, 'Alumno no valido en QR', null, 404);
}

$ins = $conn->prepare('SELECT id FROM inscripciones WHERE clase_id = ? AND estudiante_id = ?');
$ins->bind_param('ii', $claseId, $studentId);
$ins->execute();
if ($ins->get_result()->num_rows === 0) {
    json_response(false, 'Alumno no inscrito en la clase', null, 403);
}

$fecha = date('Y-m-d');
$token = 'control-' . $claseId . '-' . $fecha;
$expira = date('Y-m-d H:i:s', strtotime('+1 day'));

$ses = $conn->prepare('SELECT id FROM sesiones_qr WHERE token = ? LIMIT 1');
$ses->bind_param('s', $token);
$ses->execute();
$sesRow = $ses->get_result()->fetch_assoc();

if ($sesRow) {
    $sesionId = (int)$sesRow['id'];
} else {
    $actorId = (int)$_SESSION['user']['id'];
    $create = $conn->prepare('INSERT INTO sesiones_qr(clase_id, fecha, token, expira_en, creado_por) VALUES (?, ?, ?, ?, ?)');
    $create->bind_param('isssi', $claseId, $fecha, $token, $expira, $actorId);
    if (!$create->execute()) {
        json_response(false, 'No se pudo crear sesion de control', null, 500);
    }
    $sesionId = $create->insert_id;
}

$dup = $conn->prepare('SELECT id FROM asistencias WHERE sesion_qr_id = ? AND estudiante_id = ?');
$dup->bind_param('ii', $sesionId, $studentId);
$dup->execute();
if ($dup->get_result()->num_rows > 0) {
    json_response(false, 'Asistencia ya registrada hoy para este alumno', null, 409);
}

$estado = 'presente';
$reg = $conn->prepare('INSERT INTO asistencias(sesion_qr_id, clase_id, estudiante_id, fecha, estado) VALUES (?, ?, ?, ?, ?)');
$reg->bind_param('iiiss', $sesionId, $claseId, $studentId, $fecha, $estado);
if (!$reg->execute()) {
    json_response(false, 'No se pudo registrar asistencia', null, 500);
}

json_response(true, 'Asistencia registrada', [
    'alumno' => $student['nombre'],
    'fecha' => $fecha
]);
