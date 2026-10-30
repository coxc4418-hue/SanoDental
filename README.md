<div align="center">

<img src="LOGO_SANO_DENTAL.png" alt="Sano Dental" width="140">

# Sano Dental
**Gestión odontológica para tu consultorio** · https://sano-dental.web.app

</div>

PWA multisede (20 sedes + administrador) hecha con JavaScript puro (sin compilación) y Firebase (Auth, Firestore, Hosting). Funciona en toda Latinoamérica: la primera vez que se entra se elige el **país**, y con él la moneda, las formas de pago, el prefijo de WhatsApp y los nombres de los documentos (C.C., DNI, CURP, RUT…).

## Funciones
- **Odontograma FDI** (permanente, temporal y mixto) por superficies: caries, restauraciones, endodoncias, coronas, implantes, ausentes, prótesis, ortodoncia… con índices **CPO-D / ceo-d** e historial.
- **Presupuestos por fases** creados desde los hallazgos del odontograma: descuentos, aceptación, abonos, financiamiento, avance por tratamiento e impresión con QR.
- **Atención en el sillón**: motivo, alertas médicas (anticoagulantes, diabetes, hipertensión, alergias), anestesia con dosis máxima por peso, procedimientos que actualizan el odontograma, récipe, consentimientos, indicaciones y cobro.
- **Periodontograma** (sondaje, recesión, sangrado, placa, movilidad, furca) con estadísticas.
- **Laboratorio dental**: órdenes, color, fechas de entrega y estado.
- **Agenda** por odontólogo: sala de espera, confirmaciones, recordatorios por WhatsApp, reprogramación y controles periódicos.
- **Pacientes**: historia clínica (HC-0001), historia odontológica, antecedentes, archivos y radiografías, pagos, importar/exportar CSV.
- **Documentos con QR verificable** (`/verificar/CÓDIGO`).
- **Cobrar**, **Facturación**, **Caja** por turnos, **Insumos y materiales** (lotes y vencimientos), **Reportes** (tratamientos, producción por odontólogo, presupuestos, inasistencias), **Configuración** (odontólogos, aranceles, horario, PIN, respaldo).
- **Demo de 30 minutos** (PIN 1234) con recorrido guiado; se borra sola al terminar.
- **Panel de administrador**: crear, congelar y entrar a sedes, anuncios.

## Pruebas (emuladores)
```
firebase emulators:start --only auth,firestore,hosting   # 9399 / 8380 / 5088 (lanzar desde PowerShell)
cd scripts && npm install
sh test-emu.sh ../.tmp/shots                 # reinicia, aprovisiona y corre el e2e (95 comprobaciones)
node mobile-check.mjs "http://127.0.0.1:5088/?emu=1"
node print-check.mjs http://127.0.0.1:5088
```

## Producción
```
firebase deploy --only auth,firestore,hosting --project sano-dental
cd scripts && node provision.mjs 20      # crea admin + sede01..sede20 → CREDENCIALES_SANO_DENTAL.txt
node prod-smoke.mjs <carpeta>  ·  node pwa-check.mjs
```

## Importar la base de datos de un consultorio
El Excel (hojas Pacientes, Citas, Tratamientos, Pagos_Abonos) se convierte a JSON y se carga en una sede:
```
node import-clinica.mjs datos.json sede01 [--dry] [--emu]   # pacientes, citas, pagos y aranceles
node import-historial.mjs sede01 [--dry] [--emu]             # atenciones (citas atendidas) y presupuestos (abonos)
```
No duplica: si la sede ya tiene pacientes importados, se cancela.
