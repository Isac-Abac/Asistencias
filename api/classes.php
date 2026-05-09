<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $user = $_SESSION['user'];

    $base = "SELECT c.id, c.nombre, c.codigo, c.horario, c.grado, c.nivel, c.seccion, c.ciclo_escolar, c.cupos,
                (c.cupos - COUNT(i.id)) AS cupos_disponibles
             FROM clases c
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
    $codigo = trim($data['codigo'] ?? '');
    $horario = trim($data['horario'] ?? '');
    $grado = trim($data['grado'] ?? '');
    $nivel = trim($data['nivel'] ?? '');
    $seccion = trim($data['seccion'] ?? '');
    $ciclo = trim($data['ciclo_escolar'] ?? '');
    $cupos = (int)($data['cupos'] ?? 0);
    $docenteId = (int)($data['docente_id'] ?? 0);

    if (!$nombre || !$codigo || $docenteId <= 0 || $cupos <= 0) {
        json_response(false, 'Nombre, codigo, docente y cupos son obligatorios', null, 422);
    }

    $checkDoc = $conn->prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'docente'");
    $checkDoc->bind_param('i', $docenteId);
    $checkDoc->execute();
    if ($checkDoc->get_result()->num_rows === 0) {
        json_response(false, 'Docente invalido', null, 422);
    }

    $stmt = $conn->prepare('INSERT INTO clases(nombre, codigo, horario, grado, nivel, seccion, ciclo_escolar, cupos, docente_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('sssssssii', $nombre, $codigo, $horario, $grado, $nivel, $seccion, $ciclo, $cupos, $docenteId);

    if (!$stmt->execute()) {
        json_response(false, 'No se pudo crear la clase', null, 500);
    }

    json_response(true, 'Clase creada');
}

json_response(false, 'Metodo no permitido', null, 405);
