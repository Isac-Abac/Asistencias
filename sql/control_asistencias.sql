-- Archivo: sql/control_asistencias.sql
-- Descripcion: Script SQL de estructura y datos base del sistema.
CREATE DATABASE IF NOT EXISTS Control CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE Control;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  username VARCHAR(80) NULL UNIQUE,
  email VARCHAR(120) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin','docente','alumno','estudiante','control') NOT NULL DEFAULT 'alumno',
  fecha_nacimiento DATE NULL,
  edad INT NULL,
  nivel VARCHAR(50) NULL,
  seccion VARCHAR(50) NULL,
  ciclo_escolar VARCHAR(30) NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  codigo VARCHAR(40) NOT NULL UNIQUE,
  horario VARCHAR(120) NULL,
  grado VARCHAR(50) NULL,
  nivel VARCHAR(50) NULL,
  seccion VARCHAR(50) NULL,
  ciclo_escolar VARCHAR(30) NULL,
  cupos INT NOT NULL DEFAULT 0,
  docente_id INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_clase_docente FOREIGN KEY (docente_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS grados (
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
  UNIQUE KEY uk_grado_nivel_seccion (nombre, nivel, seccion),
  CONSTRAINT fk_grado_docente_guia FOREIGN KEY (docente_guia_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS inscripciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clase_id INT NOT NULL,
  estudiante_id INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_clase_estudiante (clase_id, estudiante_id),
  CONSTRAINT fk_ins_clase FOREIGN KEY (clase_id) REFERENCES clases(id),
  CONSTRAINT fk_ins_estudiante FOREIGN KEY (estudiante_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS sesiones_qr (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clase_id INT NOT NULL,
  fecha DATE NOT NULL,
  token VARCHAR(80) NOT NULL UNIQUE,
  expira_en DATETIME NOT NULL,
  creado_por INT NOT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sesion_clase FOREIGN KEY (clase_id) REFERENCES clases(id),
  CONSTRAINT fk_sesion_docente FOREIGN KEY (creado_por) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS asistencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sesion_qr_id INT NOT NULL,
  clase_id INT NOT NULL,
  estudiante_id INT NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('presente','tarde','ausente') NOT NULL DEFAULT 'presente',
  registrado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_asistencia_unica (sesion_qr_id, estudiante_id),
  CONSTRAINT fk_asis_sesion FOREIGN KEY (sesion_qr_id) REFERENCES sesiones_qr(id),
  CONSTRAINT fk_asis_clase FOREIGN KEY (clase_id) REFERENCES clases(id),
  CONSTRAINT fk_asis_estudiante FOREIGN KEY (estudiante_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS reportes_alumno (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clase_id INT NOT NULL,
  alumno_id INT NOT NULL,
  docente_id INT NOT NULL,
  fecha DATE NOT NULL,
  reporte TEXT NOT NULL,
  comentario TEXT NULL,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ra_clase FOREIGN KEY (clase_id) REFERENCES clases(id),
  CONSTRAINT fk_ra_alumno FOREIGN KEY (alumno_id) REFERENCES usuarios(id),
  CONSTRAINT fk_ra_docente FOREIGN KEY (docente_id) REFERENCES usuarios(id)
);

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
);

INSERT INTO usuarios (nombre, username, email, password_hash, rol)
SELECT 'Isac', 'iisac00001', 'isac@admin.local', '$2y$10$A9IydirDrqXMd4SQg/GaO.VP2eaN0KuaBQSVxwpOpyysixbS.E28W', 'admin'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'isac@admin.local');

INSERT INTO usuarios (nombre, username, email, password_hash, rol)
SELECT 'Control', 'ccontrol00001', 'control@local', '$2y$10$hPM70QNLePdJsHRn/UAhg.uSejcgjjIm8Pe1zkdKVeKrYU0NjEh3S', 'control'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'control@local');
