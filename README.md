# Planner · cronogramas y diagramas de Gantt

Aplicación web ligera, sin instalación ni servidor, para crear y gestionar cronogramas al estilo de Microsoft Project. Todo se ejecuta en el navegador y se guarda automáticamente en él.

## Cómo usarla

1. Abre `index.html` en el navegador (doble clic sobre el archivo) **o** publica el repositorio con GitHub Pages.
2. La primera vez carga un proyecto de ejemplo para que veas todas las funciones. Desde «⚙ Proyecto → Nuevo proyecto en blanco» puedes empezar de cero.
3. Exporta regularmente a JSON si quieres una copia fuera del navegador (el guardado automático usa `localStorage` y es local a ese navegador y equipo).

## Funciones

| Área | Qué incluye |
|---|---|
| Interfaz | Cinta de opciones con pestañas **Archivo, Tarea, Vista y Proyecto** al estilo Project; barra de título con el proyecto; escala de tiempo (fases e hitos) sobre el Gantt; barra de estado con zoom deslizante; menú contextual con el botón derecho; diálogos con pestañas. |
| Hoja de tareas | Celda activa con navegación por teclado y edición al escribir (como Excel/Project), columna de indicadores (notas, restricciones, fecha límite, calendario personal, completada, error), columnas configurables y redimensionables (EDT, sucesoras, holgura total y libre, fechas límite, restricción, línea base, variación, prioridad, notas…), numeración EDT, nivel de esquema. |
| Tareas | Crear tareas, hitos y **resúmenes sobre la selección**, eliminar, mover, sangría, contraer/expandir, botones rápidos de % completado, fechas límite, prioridad, notas. |
| Programación | Motor de ruta crítica (CPM): fechas tempranas y límite, holgura total y **libre**, tareas críticas; las fechas límite acotan el fin límite como en Project. Duraciones en días laborables. |
| Calendarios | Calendario del proyecto con excepciones por rango y descripción (festivos, cierres, días extra) y preajuste de festivos nacionales de España. **Calendarios personales** por responsable que heredan del proyecto; cada tarea se programa en la intersección de los calendarios de sus responsables y los días no laborables se sombrean en el Gantt. |
| Dependencias | FC, CC, FF y CF con posposición. Desde el diálogo, escribiendo en la columna (`3; 5CC+2d`), con «Vincular» o arrastrando entre barras: cada barra tiene un círculo en el comienzo y otro en el fin, y el tipo (FC, CC, FF, CF) sale del extremo de origen y del extremo donde se suelta. Detección de ciclos. |
| Gantt | Zoom continuo (de días a trimestres, con Ctrl+rueda), ajustar proyecto completo, barras arrastrables, flechas de dependencias, ruta crítica, **barras de holgura**, **ruta de tareas** (predecesoras en naranja y sucesoras en morado de la tarea seleccionada), líneas base, marcadores de fecha límite, línea de hoy y de fecha de estado; nombres y responsables junto a las barras opcionales; tooltips. |
| Responsables | Lista con rol, color y calendario personal; asignación múltiple; filtro por responsable; **hoja de recursos** con tareas y días asignados, primera y última fecha, y gráfico semanal de carga con **sobreasignación** resaltada. |
| Seguimiento | % completado (ponderado en resúmenes), **hasta 11 líneas base** (Línea base y Línea base 1 a 10, como en Project) que se pueden guardar para todo el proyecto o solo para las tareas seleccionadas, mostrar a la vez en el Gantt con colores distintos y elegir cuál se compara en columnas, estadísticas y barra de estado. Fecha de estado, filtros de críticas y pendientes. |
| Archivo | Varios proyectos guardados en el navegador (abrir, duplicar, eliminar). Exportación a JSON, **XML de Microsoft Project** (con calendarios, fechas límite y prioridades), CSV, PNG, SVG e impresión/PDF en vista dedicada. Importación de JSON y XML de Project. |
| Otros | Deshacer/rehacer, búsqueda, preferencias de vista persistentes, atajos de teclado (ver «? Atajos» en la cinta). |

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `Insert` / `Supr` | Nueva tarea / eliminar |
| `F2`, `Enter` o escribir | Editar la celda activa |
| `Mayús+F2` | Información de la tarea |
| `Tab`, flechas | Moverse por las celdas (`Mayús` extiende la selección) |
| `Alt+Mayús+→` / `←` | Aplicar / anular sangría |
| `Alt+←` / `→` | Contraer / expandir resumen |
| `Ctrl+F2` / `Ctrl+Mayús+F2` | Vincular / desvincular |
| `Ctrl+Mayús+F5` | Desplazarse a la tarea en el Gantt |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| `Ctrl++` / `Ctrl+-`, `Ctrl+rueda` | Zoom de la escala temporal |

## Estructura del código

```
index.html        Interfaz (barra de herramientas, tabla, Gantt, diálogos)
css/styles.css    Estilos, incluido el modo de impresión
js/utils.js       Fechas (enteros UTC), formato, descargas
js/calendar.js    Calendarios laborales (días, excepciones, calendarios compuestos)
js/scheduler.js   Esquema EDT y motor CPM (dependencias, restricciones, holguras, ruta crítica)
js/store.js       Estado, deshacer/rehacer, guardado local, proyecto de ejemplo
js/caleditor.js   Editor de calendarios (proyecto y responsables)
js/table.js       Hoja de tareas: celda activa, columnas, indicadores, edición
js/gantt.js       Gantt en SVG: escala, barras, holgura, ruta de tareas, interacción
js/timeline.js    Escala de tiempo (fases e hitos)
js/resources.js   Hoja de recursos y carga semanal
js/exporters.js   Exportación e importación
js/app.js         Controlador: cinta, vistas, menú contextual, diálogos, teclado
```

No hay dependencias ni paso de compilación: son archivos estáticos.

## Publicar con GitHub Pages

En el repositorio: *Settings → Pages → Source: Deploy from a branch*, rama `main`, carpeta `/ (root)`. La app quedará disponible en `https://<usuario>.github.io/Project-planner/`.

## Limitaciones conocidas

- Los datos viven en el navegador. Para trabajar en varios equipos o compartir, usa Exportar/Importar JSON (o el XML de Project).
- Las duraciones son en días laborables enteros; no hay horas ni turnos.
- La nivelación de recursos y los costes no están implementados.
