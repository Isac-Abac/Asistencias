<?php
require_once __DIR__ . '/bootstrap.php';

if (!isset($_SESSION['user'])) {
    json_response(true, 'Sin sesion', null);
}

json_response(true, 'Sesion activa', $_SESSION['user']);

