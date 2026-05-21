<?php
// Archivo: config/conexion.php
// Descripcion: Archivo backend del sistema de control de asistencias.


$Servidor = "localhost";
$Usuario = "root";
$password = "";
$BaseDeDatos = "Control";

$conn = new mysqli($Servidor, $Usuario, $password, $BaseDeDatos);
$conn->set_charset('utf8mb4');

