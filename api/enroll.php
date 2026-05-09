<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    json_response(false, 'Metodo no permitido', null, 405);
}

require_role(['admin']);
$data = input_json();
$claseId = (int)($data['clase_id'] ?? 0);
$email = trim($data['email_alumno'] ?? ($data['email_estudiante'] ?? ''));

if ($claseId <= 0 || !$email) {
    json_response(false, 'Clase y email son obligatorios', null, 422);
}

$c = $conn->prepare('SELECT id FROM clases WHERE id = ?');
$c->bind_param('i', $claseId);
$c->execute();
if ($c->get_result()->num_rows === 0) {
    json_response(false, 'Clase no encontrada', null, 404);
}

$u = $conn->prepare("SELECT id FROM usuarios WHERE email = ? AND rol IN ('alumno','estudiante')");
$u->bind_param('s', $email);
$u->execute();
$student = $u->get_result()->fetch_assoc();
if (!$student) {
    json_response(false, 'No existe alumno con ese correo', null, 404);
}

$studentId = (int)$student['id'];
$dup = $conn->prepare('SELECT id FROM inscripciones WHERE clase_id = ? AND estudiante_id = ?');
$dup->bind_param('ii', $claseId, $studentId);
$dup->execute();
if ($dup->get_result()->num_rows > 0) {
    json_response(false, 'El alumno ya esta inscrito', null, 409);
}

$i = $conn->prepare('INSERT INTO inscripciones(clase_id, estudiante_id) VALUES (?, ?)');
$i->bind_param('ii', $claseId, $studentId);

if (!$i->execute()) {
    json_response(false, 'No se pudo inscribir', null, 500);
}

json_response(true, 'Alumno inscrito');
