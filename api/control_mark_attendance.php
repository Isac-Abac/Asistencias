<?php
require_once __DIR__ . '/bootstrap.php';

function ensure_reports_control_table($conn) {
    $conn->query("
        CREATE TABLE IF NOT EXISTS control_reportes_config (
          id INT PRIMARY KEY,
          start1 TIME NOT NULL,
          end1 TIME NOT NULL,
          end2 TIME NOT NULL,
          end3 TIME NOT NULL,
          end4 TIME NOT NULL,
          actualizado_por INT NOT NULL,
          actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_crc_admin FOREIGN KEY (actualizado_por) REFERENCES usuarios(id)
        )
    ");
}

function to_minutes($hhmmss) {
    $parts = explode(':', (string)$hhmmss);
    if (count($parts) < 2) return -1;
    return ((int)$parts[0] * 60) + (int)$parts[1];
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_role(['control']);
ensure_reports_control_table($conn);

$cfgQ = $conn->query('SELECT start1, end1, end2, end3, end4 FROM control_reportes_config WHERE id = 1 LIMIT 1');
$cfg = $cfgQ ? $cfgQ->fetch_assoc() : null;
if ($cfg) {
    $now = to_minutes(date('H:i:s'));
    $start1 = to_minutes($cfg['start1']);
    $end2 = to_minutes($cfg['end2']);
    $start4 = to_minutes($cfg['end3']); // inicio de opcion 4
    $end4 = to_minutes($cfg['end4']);
    $allowMorning = ($now >= $start1 && $now <= $end2);
    $allowExit = ($now >= $start4 && $now <= $end4);
    if (!$allowMorning && !$allowExit) {
        json_response(false, 'Escaner QR bloqueado por horario configurado', null, 403);
    }
}

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
