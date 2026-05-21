<?php
// Archivo: api/logout.php
// Descripcion: Archivo backend del sistema de control de asistencias.

require_once __DIR__ . '/bootstrap.php';
session_destroy();
json_response(true, 'Sesion cerrada');

