<?php
// Archivo: api/attendance_qr.php
// Descripcion: Archivo backend del sistema de control de asistencias.

require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_role(['admin']);
$data = input_json();
$claseId = (int)($data['clase_id'] ?? 0);
$fecha = trim($data['fecha'] ?? date('Y-m-d'));

if ($claseId <= 0) {
    json_response(false, 'Clase invalida', null, 422);
}

$check = $conn->prepare('SELECT id FROM clases WHERE id = ?');
$check->bind_param('i', $claseId);
$check->execute();
if ($check->get_result()->num_rows === 0) {
    json_response(false, 'Clase no encontrada', null, 404);
}

$actorId = $_SESSION['user']['id'];
$token = bin2hex(random_bytes(24));
$expira = date('Y-m-d H:i:s', strtotime('+15 minutes'));

$stmt = $conn->prepare('INSERT INTO sesiones_qr(clase_id, fecha, token, expira_en, creado_por) VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('isssi', $claseId, $fecha, $token, $expira, $actorId);

if (!$stmt->execute()) {
    json_response(false, 'No se pudo generar QR', null, 500);
}

json_response(true, 'QR generado', [
    'token' => $token,
    'payload' => json_encode(['token' => $token]),
    'expira_en' => $expira
]);
