<?php
require_once __DIR__ . '/bootstrap.php';
session_destroy();
json_response(true, 'Sesion cerrada');

