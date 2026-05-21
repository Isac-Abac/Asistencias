<?php
// Archivo: api/bootstrap.php
// Descripcion: Archivo backend del sistema de control de asistencias.

session_start();
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/../config/conexion.php';

function json_response($ok, $message, $data = null, $code = 200) {
    http_response_code($code);
    echo json_encode([
        'ok' => $ok,
        'message' => $message,
        'data' => $data
    ]);
    exit;
}

if (!isset($conn) || $conn->connect_error) {
    json_response(false, 'Error de conexion a base de datos', null, 500);
}

function require_login() {
    if (!isset($_SESSION['user'])) {
        json_response(false, 'No autenticado', null, 401);
    }
}

function require_role($roles) {
    require_login();
    $roles = (array)$roles;
    if (!in_array($_SESSION['user']['rol'], $roles, true)) {
        json_response(false, 'Sin permisos', null, 403);
    }
}

function input_json() {
    $raw = file_get_contents('php://input');
    if (!$raw) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

