<?php
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $user = $_SESSION['user'];
    $alumnoId = (int)($_GET['alumno_id'] ?? 0);

    $sql = "SELECT r.id, r.fecha, r.reporte, r.comentario, r.alumno_id, u.nombre AS alumno, c.nombre AS clase, c.codigo, d.nombre AS docente
            FROM reportes_alumno r
            INNER JOIN usuarios u ON u.id = r.alumno_id
            INNER JOIN clases c ON c.id = r.clase_id
            INNER JOIN usuarios d ON d.id = r.docente_id
            WHERE 1=1";
    $types = '';
    $params = [];

    if ($user['rol'] === 'docente') {
        $sql .= ' AND r.docente_id = ?';
        $types .= 'i';
        $params[] = $user['id'];
    }
    if ($user['rol'] === 'alumno' || $user['rol'] === 'estudiante') {
        $sql .= ' AND r.alumno_id = ?';
        $types .= 'i';
        $params[] = $user['id'];
    } elseif ($alumnoId > 0) {
        $sql .= ' AND r.alumno_id = ?';
        $types .= 'i';
        $params[] = $alumnoId;
    }

    $sql .= ' ORDER BY r.fecha DESC, r.id DESC';
    $stmt = $conn->prepare($sql);
    if ($types !== '') $stmt->bind_param($types, ...$params);
    $stmt->execute();
    json_response(true, 'OK', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_role(['docente']);
    $data = input_json();

    $claseId = (int)($data['clase_id'] ?? 0);
    $alumnoId = (int)($data['alumno_id'] ?? 0);
    $fecha = trim($data['fecha'] ?? date('Y-m-d'));
    $reporte = trim($data['reporte'] ?? '');
    $comentario = trim($data['comentario'] ?? '');

    if ($claseId <= 0 || $alumnoId <= 0 || !$reporte) {
        json_response(false, 'Clase, alumno y reporte son obligatorios', null, 422);
    }

    $docenteId = $_SESSION['user']['id'];
    $ownClass = $conn->prepare('SELECT id FROM clases WHERE id = ? AND docente_id = ?');
    $ownClass->bind_param('ii', $claseId, $docenteId);
    $ownClass->execute();
    if ($ownClass->get_result()->num_rows === 0) {
        json_response(false, 'No puedes reportar en esta clase', null, 403);
    }

    $ins = $conn->prepare('SELECT id FROM inscripciones WHERE clase_id = ? AND estudiante_id = ?');
    $ins->bind_param('ii', $claseId, $alumnoId);
    $ins->execute();
    if ($ins->get_result()->num_rows === 0) {
        json_response(false, 'El alumno no pertenece a esta clase', null, 403);
    }

    $stmt = $conn->prepare('INSERT INTO reportes_alumno(clase_id, alumno_id, docente_id, fecha, reporte, comentario) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('iiisss', $claseId, $alumnoId, $docenteId, $fecha, $reporte, $comentario);
    if (!$stmt->execute()) {
        json_response(false, 'No se pudo guardar el reporte', null, 500);
    }

    json_response(true, 'Reporte/comentario guardado');
}

json_response(false, 'Metodo no permitido', null, 405);
