<?php
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

function require_previous_grade($conn, $nivel, $gradoActual, $gradoPrevio, $seccion, $carrera = null) {
    if ($gradoActual === $gradoPrevio || $gradoPrevio === null) {
        return;
    }

    if ($nivel === 'Diversificado') {
        $stmt = $conn->prepare('SELECT id FROM grados WHERE nivel = ? AND grado_diversificado = ? AND carrera = ? LIMIT 1');
        $stmt->bind_param('sss', $nivel, $gradoPrevio, $carrera);
    } else {
        $stmt = $conn->prepare('SELECT id FROM grados WHERE nivel = ? AND nombre = ? AND seccion = ? LIMIT 1');
        $stmt->bind_param('sss', $nivel, $gradoPrevio, $seccion);
    }
    $stmt->execute();
    if ($stmt->get_result()->num_rows === 0) {
        if ($nivel === 'Diversificado') {
            json_response(false, "No se puede crear {$gradoActual} para la carrera {$carrera} sin existir antes {$gradoPrevio}", null, 422);
        }
        json_response(false, "No se puede crear {$gradoActual} sin existir antes {$gradoPrevio} en la seccion {$seccion}", null, 422);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_login();
    $stmt = $conn->prepare("SELECT g.id, g.nombre, g.nivel, g.grado_primaria, g.grado_basico, g.grado_diversificado, g.carrera, g.seccion, g.cupos, g.docente_guia_id,
                                   u.nombre AS docente_guia,
                                   CASE
                                       WHEN g.nivel='Primaria' THEN g.grado_primaria
                                       WHEN g.nivel='Basico' THEN g.grado_basico
                                       WHEN g.nivel='Diversificado' THEN CONCAT(g.grado_diversificado, ' - ', g.carrera)
                                       ELSE g.nombre
                                   END AS grado_mostrar
                            FROM grados g
                            LEFT JOIN usuarios u ON u.id = g.docente_guia_id
                            ORDER BY g.nivel, g.id DESC");
    $stmt->execute();
    json_response(true, 'OK', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
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

    if ($seccion !== 'A') {
        $prev = chr(ord($seccion) - 1);
        $checkPrev = $conn->prepare('SELECT id FROM grados WHERE nombre = ? AND nivel = ? AND seccion = ? LIMIT 1');
        $checkPrev->bind_param('sss', $nombre, $nivel, $prev);
        $checkPrev->execute();
        if ($checkPrev->get_result()->num_rows === 0) {
            json_response(false, "No se puede crear seccion {$seccion} sin existir antes la seccion {$prev}", null, 422);
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
