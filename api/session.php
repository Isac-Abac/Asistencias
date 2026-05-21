<?php
// Archivo: api/session.php
// Descripcion: Archivo backend del sistema de control de asistencias.

require_once __DIR__ . '/bootstrap.php';

if (!isset($_SESSION['user'])) {
    json_response(true, 'Sin sesion', null);
}

json_response(true, 'Sesion activa', $_SESSION['user']);

