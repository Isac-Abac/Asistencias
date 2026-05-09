<?php

$Servidor = "localhost";
$Usuario = "root";
$password = "";
$BaseDeDatos = "Control";

$conn = new mysqli($Servidor, $Usuario, $password, $BaseDeDatos);
$conn->set_charset('utf8mb4');

