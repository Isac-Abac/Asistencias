<?php
require_once __DIR__ . '/bootstrap.php';

function ensure_classes_table($conn) {
    $conn->query("ALTER TABLE clases ADD COLUMN IF NOT EXISTS dia VARCHAR(15) NULL");
}

ensure_classes_table($conn);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $user = $_SESSION['user'];

    $base = "SELECT c.id, c.nombre, c.codigo, c.horario, c.dia, c.grado, c.nivel, c.seccion, c.ciclo_escolar, c.cupos, d.nombre AS docente,
                (c.cupos - COUNT(i.id)) AS cupos_disponibles
             FROM clases c
             LEFT JOIN usuarios d ON d.id = c.docente_id
             LEFT JOIN inscripciones i ON i.clase_id = c.id";

    if ($user['rol'] === 'docente') {
        $stmt = $conn->prepare($base . ' WHERE c.docente_id = ? GROUP BY c.id ORDER BY c.id DESC');
        $stmt->bind_param('i', $user['id']);
    } elseif ($user['rol'] === 'alumno' || $user['rol'] === 'estudiante') {
        $stmt = $conn->prepare($base . ' INNER JOIN inscripciones ix ON ix.clase_id = c.id WHERE ix.estudiante_id = ? GROUP BY c.id ORDER BY c.id DESC');
        $stmt->bind_param('i', $user['id']);
    } else {
        $stmt = $conn->prepare($base . ' GROUP BY c.id ORDER BY c.id DESC');
    }

    $stmt->execute();
    json_response(true, 'OK', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_role(['admin']);
    $data = input_json();

    $nombre = trim($data['nombre'] ?? '');
    $horario = trim($data['horario'] ?? '');
    $dia = trim($data['dia'] ?? '');
    $grado = trim($data['grado'] ?? '');
    $nivel = trim($data['nivel'] ?? '');
    $seccion = strtoupper(trim($data['seccion'] ?? ''));

    if (!$nombre || !$dia || !$horario || !$grado || !$nivel || !$seccion) {
        json_response(false, 'Nivel, grado, seccion, nombre de curso, dia y horario son obligatorios', null, 422);
    }

    if (!preg_match('/^[A-Z]$/', $seccion)) {
        json_response(false, 'La seccion debe ser una letra (A-Z)', null, 422);
    }

    $diasValidos = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes'];
    if (!in_array($dia, $diasValidos, true)) {
        json_response(false, 'Dia invalido', null, 422);
    }

    $horaValidas = ['07:30-08:10','08:10-08:50','08:50-09:30','09:30-10:05','10:45-11:20','11:20-11:55','11:55-12:30'];
    if (!in_array($horario, $horaValidas, true)) {
        json_response(false, 'Horario invalido', null, 422);
    }

    $gradeQ = $conn->prepare('SELECT docente_guia_id, cupos FROM grados WHERE nombre = ? AND nivel = ? AND seccion = ? LIMIT 1');
    $gradeQ->bind_param('sss', $grado, $nivel, $seccion);
    $gradeQ->execute();
    $grade = $gradeQ->get_result()->fetch_assoc();
    if (!$grade) {
        json_response(false, 'Primero debes crear el grado con ese nivel y seccion', null, 422);
    }

    $docenteId = (int)$grade['docente_guia_id'];
    $cupos = (int)$grade['cupos'];

    $slotQ = $conn->prepare('SELECT id FROM clases WHERE nivel = ? AND grado = ? AND seccion = ? AND dia = ? AND horario = ? LIMIT 1');
    $slotQ->bind_param('sssss', $nivel, $grado, $seccion, $dia, $horario);
    $slotQ->execute();
    if ($slotQ->get_result()->num_rows > 0) {
        json_response(false, 'Esa hora ya esta asignada para ese grado/seccion en ese dia', null, 409);
    }

    $ciclo = '';
    $codigo = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $nombre), 0, 4))
        . '-' . strtoupper(substr($dia, 0, 2))
        . '-' . str_replace(':', '', substr($horario, 0, 5))
        . '-' . strtoupper($seccion);

    $stmt = $conn->prepare('INSERT INTO clases(nombre, codigo, horario, dia, grado, nivel, seccion, ciclo_escolar, cupos, docente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('ssssssssii', $nombre, $codigo, $horario, $dia, $grado, $nivel, $seccion, $ciclo, $cupos, $docenteId);

    if (!$stmt->execute()) {
        if ($conn->errno === 1062) {
            json_response(false, 'Ya existe un curso con ese codigo/dia/horario/seccion', null, 409);
        }
        json_response(false, 'No se pudo crear la clase', null, 500);
    }

    json_response(true, 'Curso asignado');
}

json_response(false, 'Metodo no permitido', null, 405);
