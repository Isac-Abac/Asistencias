<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_role(['alumno', 'estudiante']);
$data = input_json();
$token = trim($data['token'] ?? '');

if (!$token) {
    json_response(false, 'Token QR requerido', null, 422);
}

$stmt = $conn->prepare('SELECT sq.id, sq.clase_id, sq.fecha, sq.expira_en FROM sesiones_qr sq WHERE sq.token = ? LIMIT 1');
$stmt->bind_param('s', $token);
$stmt->execute();
$sessionQr = $stmt->get_result()->fetch_assoc();

if (!$sessionQr) {
    json_response(false, 'QR invalido', null, 404);
}

if (strtotime($sessionQr['expira_en']) < time()) {
    json_response(false, 'El QR expiro', null, 410);
}

$studentId = $_SESSION['user']['id'];
$claseId = (int)$sessionQr['clase_id'];

$ins = $conn->prepare('SELECT id FROM inscripciones WHERE clase_id = ? AND estudiante_id = ?');
$ins->bind_param('ii', $claseId, $studentId);
$ins->execute();
if ($ins->get_result()->num_rows === 0) {
    json_response(false, 'No estas inscrito en esta clase', null, 403);
}

$dup = $conn->prepare('SELECT id FROM asistencias WHERE sesion_qr_id = ? AND estudiante_id = ?');
$dup->bind_param('ii', $sessionQr['id'], $studentId);
$dup->execute();
if ($dup->get_result()->num_rows > 0) {
    json_response(false, 'Tu asistencia ya fue registrada', null, 409);
}

$status = 'presente';
$reg = $conn->prepare('INSERT INTO asistencias(sesion_qr_id, clase_id, estudiante_id, fecha, estado) VALUES (?, ?, ?, ?, ?)');
$reg->bind_param('iiiss', $sessionQr['id'], $claseId, $studentId, $sessionQr['fecha'], $status);

if (!$reg->execute()) {
    json_response(false, 'No se pudo registrar asistencia', null, 500);
}

json_response(true, 'Asistencia registrada correctamente');
