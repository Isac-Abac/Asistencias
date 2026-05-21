<?php
// Archivo: api/my_students.php
// Descripcion: Archivo backend del sistema de control de asistencias.

require_once __DIR__ . '/bootstrap.php';
require_role(['docente']);

$sql = "SELECT DISTINCT u.id, u.nombre, u.email
        FROM usuarios u
        INNER JOIN inscripciones i ON i.estudiante_id = u.id
        INNER JOIN clases c ON c.id = i.clase_id
        WHERE c.docente_id = ? AND u.rol IN ('alumno','estudiante')
        ORDER BY u.nombre";
$stmt = $conn->prepare($sql);
$stmt->bind_param('i', $_SESSION['user']['id']);
$stmt->execute();
json_response(true, 'OK', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
