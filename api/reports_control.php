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
    $parts = explode(':', $hhmmss);
    if (count($parts) < 2) return -1;
    $h = (int)$parts[0];
    $m = (int)$parts[1];
    return ($h * 60) + $m;
}

ensure_reports_control_table($conn);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $q = $conn->query('SELECT id, start1, end1, end2, end3, end4 FROM control_reportes_config WHERE id = 1 LIMIT 1');
    $row = $q ? $q->fetch_assoc() : null;
    json_response(true, 'OK', $row ?: null);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_role(['admin']);
    $data = input_json();
    $start1 = trim($data['start1'] ?? '');
    $end1 = trim($data['end1'] ?? '');
    $end2 = trim($data['end2'] ?? '');
    $end3 = trim($data['end3'] ?? '');
    $end4 = trim($data['end4'] ?? '');
    if (!$start1 || !$end1 || !$end2 || !$end3 || !$end4) {
        json_response(false, 'Completa todas las horas del control de reportes', null, 422);
    }

    $m1 = to_minutes($start1);
    $m2 = to_minutes($end1);
    $m3 = to_minutes($end2);
    $m4 = to_minutes($end3);
    $m5 = to_minutes($end4);
    if ($m1 < 0 || $m2 < 0 || $m3 < 0 || $m4 < 0 || $m5 < 0) json_response(false, 'Formato de hora invalido', null, 422);
    if (!($m1 < $m2 && $m2 < $m3 && $m3 < $m4 && $m4 < $m5)) json_response(false, 'La secuencia de horas no es valida', null, 422);

    $actor = (int)$_SESSION['user']['id'];
    $stmt = $conn->prepare("
        INSERT INTO control_reportes_config(id, start1, end1, end2, end3, end4, actualizado_por)
        VALUES (1, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          start1 = VALUES(start1),
          end1 = VALUES(end1),
          end2 = VALUES(end2),
          end3 = VALUES(end3),
          end4 = VALUES(end4),
          actualizado_por = VALUES(actualizado_por)
    ");
    $stmt->bind_param('sssssi', $start1, $end1, $end2, $end3, $end4, $actor);
    if (!$stmt->execute()) json_response(false, 'No se pudo guardar configuracion', null, 500);

    json_response(true, 'Configuracion de control de reportes guardada');
}

json_response(false, 'Metodo no permitido', null, 405);

