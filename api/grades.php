<?php
// Archivo: api/grades.php
// Descripcion: Archivo backend del sistema de control de asistencias.

require_once __DIR__ . '/bootstrap.php';

function ensure_grados_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS grados (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        nivel ENUM('Primaria','Basico','Diversificado') NOT NULL,
        grado_primaria VARCHAR(40) NULL,
        grado_basico VARCHAR(40) NULL,
        grado_diversificado VARCHAR(40) NULL,
        carrera VARCHAR(120) NULL,
        seccion VARCHAR(20) NOT NULL,
        cupos INT NOT NULL DEFAULT 0,
        docente_guia_id INT NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_grado_nivel_seccion (nombre, nivel, seccion)
    )";
    $conn->query($sql);

    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS grado_primaria VARCHAR(40) NULL");
    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS grado_basico VARCHAR(40) NULL");
    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS grado_diversificado VARCHAR(40) NULL");
    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS carrera VARCHAR(120) NULL");
    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS seccion VARCHAR(20) NOT NULL DEFAULT ''");
    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS cupos INT NOT NULL DEFAULT 0");
    $conn->query("ALTER TABLE grados ADD COLUMN IF NOT EXISTS docente_guia_id INT NOT NULL DEFAULT 0");
}

ensure_grados_table($conn);

function normalize_grade_name($nivel, $input) {
    $s = trim(mb_strtolower($input));
    if ($s === '') return '';

    $mapPrimaria = [
        'primero' => '1ro', '1ro' => '1ro', '1º' => '1ro', '1' => '1ro',
        'segundo' => '2do', '2do' => '2do', '2º' => '2do', '2' => '2do',
        'tercero' => '3ro', '3ro' => '3ro', '3º' => '3ro', '3' => '3ro',
        'cuarto' => '4to', '4to' => '4to', '4º' => '4to', '4' => '4to',
        'quinto' => '5to', '5to' => '5to', '5º' => '5to', '5' => '5to',
        'sexto' => '6to', '6to' => '6to', '6º' => '6to', '6' => '6to',
    ];

    $mapBasico = [
        'primero' => '1ro', '1ro' => '1ro', '1' => '1ro',
        'segundo' => '2do', '2do' => '2do', '2' => '2do',
        'tercero' => '3ro', '3ro' => '3ro', '3' => '3ro',
    ];

    $mapDivers = [
        'cuarto' => '4to', '4to' => '4to', '4' => '4to',
        'quinto' => '5to', '5to' => '5to', '5' => '5to',
        'sexto' => '6to', '6to' => '6to', '6' => '6to',
    ];

    if ($nivel === 'Primaria') {
        foreach ($mapPrimaria as $k => $v) {
            if (mb_strpos($s, $k) !== false) {
                return $v . ' primaria';
            }
        }
    }
    if ($nivel === 'Basico') {
        foreach ($mapBasico as $k => $v) {
            if (mb_strpos($s, $k) !== false) {
                return $v . ' basico';
            }
        }
    }
    if ($nivel === 'Diversificado') {
        foreach ($mapDivers as $k => $v) {
            if (mb_strpos($s, $k) !== false) {
                return $v . ' diversificado';
            }
        }
    }

    // If nothing matched, return original trimmed input
    return $input;
}

function require_previous_grade($conn, $nivel, $gradoActual, $gradoPrevio, $seccion, $carrera = null) {
    if ($gradoActual === $gradoPrevio || $gradoPrevio === null) {
        return;
    }

    if ($nivel === 'Diversificado') {
        $stmt = $conn->prepare('SELECT id FROM grados WHERE nivel = ? AND grado_diversificado = ? AND carrera = ? LIMIT 1');
        $stmt->bind_param('sss', $nivel, $gradoPrevio, $carrera);
    } else {
        // Buscar por el nombre original o por una forma parcial (p.ej. '1ro')
        $prevNorm = normalize_grade_name($nivel, $gradoPrevio);

        // Extraer el identificador corto del grado (1ro, 2do, 3ro, 4to...)
        $short = null;
        if (preg_match('/(1ro|2do|3ro|4to|5to|6to)/i', $prevNorm, $m)) {
            $short = $m[1];
        }

        if ($short) {
            $like = "%" . $short . "%";
            $stmt = $conn->prepare(
                'SELECT id FROM grados WHERE nivel = ? AND (
                     nombre LIKE ? OR nombre = ? OR
                     grado_primaria LIKE ? OR grado_primaria = ? OR
                     grado_basico LIKE ? OR grado_basico = ?
                 ) LIMIT 1'
            );
            $stmt->bind_param('sssssss', $nivel, $like, $prevNorm, $like, $prevNorm, $like, $prevNorm);
        } else {
            $stmt = $conn->prepare(
                'SELECT id FROM grados WHERE nivel = ? AND (
                     nombre = ? OR nombre = ? OR
                     grado_primaria = ? OR grado_primaria = ? OR
                     grado_basico = ? OR grado_basico = ?
                 ) LIMIT 1'
            );
            $stmt->bind_param('sssssss', $nivel, $gradoPrevio, $prevNorm, $gradoPrevio, $prevNorm, $gradoPrevio, $prevNorm);
        }
    }
    $stmt->execute();
    if ($stmt->get_result()->num_rows === 0) {
        // Log para depuración: qué se intentó buscar y no se encontró
        error_log("[grades] require_previous_grade failed: nivel={$nivel}, gradoActual={$gradoActual}, gradoPrevio={$gradoPrevio}, prevNorm={$prevNorm}, seccion={$seccion}");
        if ($nivel === 'Diversificado') {
            json_response(false, "No se puede crear {$gradoActual} para la carrera {$carrera} sin existir antes {$gradoPrevio}", null, 422);
        }
        json_response(false, "No se puede crear {$gradoActual} sin existir antes {$gradoPrevio}", null, 422);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $stmt = $conn->prepare("SELECT g.id, g.nombre, g.nivel, g.grado_primaria, g.grado_basico, g.grado_diversificado, g.carrera, g.seccion, g.cupos, g.docente_guia_id,
                                   u.nombre AS docente_guia
                            FROM grados g
                            LEFT JOIN usuarios u ON u.id = g.docente_guia_id
                            ORDER BY g.nivel, g.id DESC");
    if (!$stmt) json_response(false, 'Error al consultar grados', null, 500);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);

    $countStmt = $conn->prepare("SELECT COUNT(DISTINCT ux.id) AS inscritos
                                 FROM usuarios ux
                                 LEFT JOIN inscripciones i ON i.estudiante_id = ux.id
                                 LEFT JOIN clases c ON c.id = i.clase_id
                                 WHERE ux.rol IN ('alumno','estudiante')
                                   AND (
                                     (ux.nivel = ? AND ux.grado = ? AND ux.seccion = ?)
                                     OR
                                     (c.nivel = ? AND c.grado = ? AND c.seccion = ?)
                                   )");
    if (!$countStmt) json_response(false, 'Error al calcular cupos', null, 500);

    foreach ($rows as &$r) {
        $nivel = (string)$r['nivel'];
        $nombre = (string)$r['nombre'];
        $seccion = (string)$r['seccion'];
        $countStmt->bind_param('ssssss', $nivel, $nombre, $seccion, $nivel, $nombre, $seccion);
        $countStmt->execute();
        $ins = (int)($countStmt->get_result()->fetch_assoc()['inscritos'] ?? 0);
        $cupos = (int)($r['cupos'] ?? 0);
        $r['inscritos'] = $ins;
        $r['cupos_disponibles'] = max($cupos - $ins, 0);
        if ($r['nivel'] === 'Primaria') $r['grado_mostrar'] = $r['grado_primaria'];
        elseif ($r['nivel'] === 'Basico') $r['grado_mostrar'] = $r['grado_basico'];
        elseif ($r['nivel'] === 'Diversificado') $r['grado_mostrar'] = trim(($r['grado_diversificado'] ?? '') . ' - ' . ($r['carrera'] ?? ''), ' -');
        else $r['grado_mostrar'] = $r['nombre'];
    }
    unset($r);

    json_response(true, 'OK', $rows);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_role(['admin']);
    $data = input_json();

    $nivel = trim($data['nivel'] ?? '');
    $gradoPrimaria = trim($data['grado_primaria'] ?? '');
    $gradoBasico = trim($data['grado_basico'] ?? '');
    $gradoDiversificado = trim($data['grado_diversificado'] ?? '');
    $carrera = trim($data['carrera'] ?? '');
    $seccion = trim($data['seccion'] ?? '');
    $cupos = (int)($data['cupos'] ?? 0);
    $docenteGuiaId = (int)($data['docente_guia_id'] ?? 0);

    // Normalizar entradas comunes (acepta variantes como "primero primaria")
    $gradoPrimaria = normalize_grade_name($nivel, $gradoPrimaria);
    $gradoBasico = normalize_grade_name($nivel, $gradoBasico);
    $gradoDiversificado = normalize_grade_name($nivel, $gradoDiversificado);

    if ($nivel === '' || $seccion === '' || $cupos <= 0 || $docenteGuiaId <= 0) {
        json_response(false, 'Nivel, seccion, cupos y docente guia son obligatorios', null, 422);
    }
    if ($cupos > 30) {
        json_response(false, 'El maximo de cupos por clase es 30', null, 422);
    }

    $nivelesValidos = ['Primaria', 'Basico', 'Diversificado'];
    if (!in_array($nivel, $nivelesValidos, true)) {
        json_response(false, 'Nivel no valido', null, 422);
    }
    $seccion = strtoupper($seccion);
    if (!preg_match('/^[A-Z]$/', $seccion)) {
        json_response(false, 'La seccion debe ser una letra (A-Z)', null, 422);
    }

    $nombre = $nivel;
    if ($nivel === 'Primaria') {
        $gradosPrimariaValidos = ['1ro primaria', '2do primaria', '3ro primaria', '4to primaria', '5to primaria', '6to primaria'];
        if (!in_array($gradoPrimaria, $gradosPrimariaValidos, true)) {
            json_response(false, 'Selecciona un grado de primaria valido', null, 422);
        }
        $idx = array_search($gradoPrimaria, $gradosPrimariaValidos, true);
        if ($idx > 0) {
            $prev = $gradosPrimariaValidos[$idx - 1];
            require_previous_grade($conn, $nivel, $gradoPrimaria, $prev, $seccion);
        }
        $nombre = $gradoPrimaria;
        $gradoBasico = null;
        $gradoDiversificado = null;
        $carrera = null;
    } elseif ($nivel === 'Basico') {
        $gradosBasicoValidos = ['1ro basico', '2do basico', '3ro basico'];
        if (!in_array($gradoBasico, $gradosBasicoValidos, true)) {
            json_response(false, 'Selecciona un grado de basico valido', null, 422);
        }
        $idx = array_search($gradoBasico, $gradosBasicoValidos, true);
        if ($idx > 0) {
            $prev = $gradosBasicoValidos[$idx - 1];
            require_previous_grade($conn, $nivel, $gradoBasico, $prev, $seccion);
        }
        $nombre = $gradoBasico;
        $gradoPrimaria = null;
        $gradoDiversificado = null;
        $carrera = null;
    } elseif ($nivel === 'Diversificado') {
        $gradosDiversificadoValidos = ['4to diversificado', '5to diversificado', '6to diversificado'];
        if (!in_array($gradoDiversificado, $gradosDiversificadoValidos, true)) {
            json_response(false, 'Selecciona un grado de diversificado valido', null, 422);
        }
        if ($carrera === '') {
            json_response(false, 'Nombre de carrera es obligatorio para diversificado', null, 422);
        }
        $idx = array_search($gradoDiversificado, $gradosDiversificadoValidos, true);
        if ($idx > 0) {
            $prev = $gradosDiversificadoValidos[$idx - 1];
            require_previous_grade($conn, $nivel, $gradoDiversificado, $prev, $seccion, $carrera);
        }
        $nombre = $gradoDiversificado . ' - ' . $carrera;
        $gradoPrimaria = null;
        $gradoBasico = null;
    } else {
        $gradoPrimaria = null;
        $gradoBasico = null;
        $gradoDiversificado = null;
        $carrera = null;
    }

    $checkDoc = $conn->prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'docente'");
    $checkDoc->bind_param('i', $docenteGuiaId);
    $checkDoc->execute();
    if ($checkDoc->get_result()->num_rows === 0) {
        json_response(false, 'Docente guia invalido', null, 422);
    }

    $docInUse = $conn->prepare('SELECT id FROM grados WHERE docente_guia_id = ? LIMIT 1');
    $docInUse->bind_param('i', $docenteGuiaId);
    $docInUse->execute();
    if ($docInUse->get_result()->num_rows > 0) {
        json_response(false, 'Ese docente ya esta asignado a un grado', null, 422);
    }

    if ($seccion !== 'A') {
        $prev = chr(ord($seccion) - 1);
        $checkPrev = $conn->prepare('SELECT id, cupos FROM grados WHERE nombre = ? AND nivel = ? AND seccion = ? LIMIT 1');
        $checkPrev->bind_param('sss', $nombre, $nivel, $prev);
        $checkPrev->execute();
        $prevRow = $checkPrev->get_result()->fetch_assoc();
        if (!$prevRow) {
            json_response(false, "No se puede crear seccion {$seccion} sin existir antes la seccion {$prev}", null, 422);
        }

        // No abrir nueva seccion mientras la anterior tenga cupos disponibles.
        $usedQ = $conn->prepare('SELECT COUNT(DISTINCT i.estudiante_id) AS usados
                                 FROM inscripciones i
                                 INNER JOIN clases c ON c.id = i.clase_id
                                 WHERE c.nivel = ? AND c.grado = ? AND c.seccion = ?');
        $usedQ->bind_param('sss', $nivel, $nombre, $prev);
        $usedQ->execute();
        $used = (int)($usedQ->get_result()->fetch_assoc()['usados'] ?? 0);
        $cuposPrev = (int)$prevRow['cupos'];
        if ($used < $cuposPrev) {
            $disp = $cuposPrev - $used;
            json_response(false, "No se puede crear seccion {$seccion}: la seccion {$prev} aun tiene {$disp} cupos disponibles", null, 422);
        }
    }

    $stmt = $conn->prepare('INSERT INTO grados (nombre, nivel, grado_primaria, grado_basico, grado_diversificado, carrera, seccion, cupos, docente_guia_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('sssssssii', $nombre, $nivel, $gradoPrimaria, $gradoBasico, $gradoDiversificado, $carrera, $seccion, $cupos, $docenteGuiaId);
    if (!$stmt->execute()) {
        if ($conn->errno === 1062) {
            json_response(false, 'Ese grado ya existe en ese nivel', null, 409);
        }
        json_response(false, 'No se pudo crear el grado', null, 500);
    }

    json_response(true, 'Grado creado');
}

json_response(false, 'Metodo no permitido', null, 405);
