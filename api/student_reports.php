<?php
require_once __DIR__ . '/bootstrap.php';

function ensure_reportes_origen_column($conn) {
    $conn->query("ALTER TABLE reportes_alumno ADD COLUMN IF NOT EXISTS origen ENUM('manual','automatico') NOT NULL DEFAULT 'manual'");
}

ensure_reportes_origen_column($conn);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $user = $_SESSION['user'];
    $alumnoId = (int)($_GET['alumno_id'] ?? 0);
    $todayOnly = (int)($_GET['today'] ?? 0);
    $fecha = trim($_GET['fecha'] ?? '');

    $sql = "SELECT r.id, r.fecha, r.reporte, r.comentario, r.origen, r.alumno_id, r.docente_id, u.nombre AS alumno, c.nombre AS clase, c.codigo, d.nombre AS docente
            FROM reportes_alumno r
            INNER JOIN usuarios u ON u.id = r.alumno_id
            INNER JOIN clases c ON c.id = r.clase_id
            INNER JOIN usuarios d ON d.id = r.docente_id
            WHERE 1=1";
    $types = '';
    $params = [];

    if ($user['rol'] === 'docente') {
        // El docente ve reportes de sus alumnos (incluye manuales y automaticos)
        $sql .= " AND EXISTS (
            SELECT 1
            FROM inscripciones i
            INNER JOIN clases tc ON tc.id = i.clase_id
            WHERE i.estudiante_id = r.alumno_id
              AND tc.docente_id = ?
        )";
        $types .= 'i';
        $params[] = $user['id'];
    }
    if ($todayOnly === 1) {
        $sql .= ' AND r.fecha = ?';
        $types .= 's';
        $params[] = date('Y-m-d');
    } elseif ($fecha !== '') {
        $sql .= ' AND r.fecha = ?';
        $types .= 's';
        $params[] = $fecha;
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

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    require_role(['docente']);
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) json_response(false, 'ID invalido', null, 422);

    $q = $conn->prepare('SELECT id, docente_id, origen FROM reportes_alumno WHERE id = ? LIMIT 1');
    $q->bind_param('i', $id);
    $q->execute();
    $rep = $q->get_result()->fetch_assoc();
    if (!$rep) json_response(false, 'Reporte no encontrado', null, 404);
    if ($rep['origen'] !== 'manual') json_response(false, 'Los reportes automaticos no se pueden eliminar', null, 403);
    if ((int)$rep['docente_id'] !== (int)$_SESSION['user']['id']) json_response(false, 'No puedes eliminar este reporte', null, 403);

    $d = $conn->prepare('DELETE FROM reportes_alumno WHERE id = ?');
    $d->bind_param('i', $id);
    if (!$d->execute()) json_response(false, 'No se pudo eliminar el reporte', null, 500);
    json_response(true, 'Reporte eliminado');
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

    // Validar pertenencia por grado/nivel/seccion (no por clase exacta)
    $classInfo = $conn->prepare('SELECT nivel, grado, seccion FROM clases WHERE id = ? LIMIT 1');
    $classInfo->bind_param('i', $claseId);
    $classInfo->execute();
    $targetClass = $classInfo->get_result()->fetch_assoc();
    if (!$targetClass) {
        json_response(false, 'Clase no encontrada', null, 404);
    }

    $belongsByGroup = $conn->prepare("
        SELECT i.id
        FROM inscripciones i
        INNER JOIN clases c ON c.id = i.clase_id
        WHERE i.estudiante_id = ?
          AND c.nivel = ?
          AND c.grado = ?
          AND c.seccion = ?
        LIMIT 1
    ");
    $belongsByGroup->bind_param('isss', $alumnoId, $targetClass['nivel'], $targetClass['grado'], $targetClass['seccion']);
    $belongsByGroup->execute();
    if ($belongsByGroup->get_result()->num_rows === 0) {
        json_response(false, 'El alumno no pertenece al grado/seccion de este curso', null, 403);
    }

    $origen = 'manual';
    $stmt = $conn->prepare('INSERT INTO reportes_alumno(clase_id, alumno_id, docente_id, fecha, reporte, comentario, origen) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('iiissss', $claseId, $alumnoId, $docenteId, $fecha, $reporte, $comentario, $origen);
    if (!$stmt->execute()) {
        json_response(false, 'No se pudo guardar el reporte', null, 500);
    }

    json_response(true, 'Reporte/comentario guardado');
}

json_response(false, 'Metodo no permitido', null, 405);
