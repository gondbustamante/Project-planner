# Planner · cronogramas y diagramas de Gantt

Aplicación web ligera, sin instalación ni servidor, para crear y gestionar cronogramas al estilo de Microsoft Project. Todo se ejecuta en el navegador y se guarda automáticamente en él.

## Cómo usarla

1. Abre `index.html` en el navegador (doble clic sobre el archivo) **o** publica el repositorio con GitHub Pages.
2. La primera vez carga un proyecto de ejemplo para que veas todas las funciones. Desde «⚙ Proyecto → Nuevo proyecto en blanco» puedes empezar de cero.
3. Exporta regularmente a JSON si quieres una copia fuera del navegador (el guardado automático usa `localStorage` y es local a ese navegador y equipo).

## Funciones

| Área | Qué incluye |
|---|---|
| Tareas | Crear, eliminar, mover arriba/abajo, aplicar o anular sangría (resúmenes / subtareas en varios niveles), contraer y expandir, numeración EDT automática. |
| Programación | Motor de ruta crítica (CPM): paso adelante y atrás, comienzo y fin tempranos y límite, holgura total y marcado de tareas críticas. Las duraciones son en días laborables. |
| Calendarios | **Calendario del proyecto**: días laborables de la semana y excepciones con rango de fechas y descripción (festivos, cierres, días laborables extra), con un botón para cargar los festivos nacionales de España de cualquier año. **Calendarios personales** por responsable (vacaciones, permisos, jornada de 4 días…): parten del calendario del proyecto y sus excepciones prevalecen. Una tarea se programa solo en los días en que todos sus responsables trabajan; en el Gantt esos días no laborables se sombrean en amarillo. En la información de la tarea se puede marcar «Ignorar los calendarios personales». Los calendarios viajan también en el XML de Project. |
| Dependencias | Fin‑Comienzo (FC), Comienzo‑Comienzo (CC), Fin‑Fin (FF) y Comienzo‑Fin (CF) con posposición positiva o negativa. Se crean desde el diálogo de la tarea, escribiendo en la columna «Predecesoras» (`3; 5CC+2d`), con el botón «Vincular» sobre varias tareas seleccionadas o arrastrando desde el círculo al final de una barra hasta otra. Detecta y señala dependencias circulares. |
| Restricciones | Lo antes posible, No comenzar antes del, Debe comenzar el. Al escribir una fecha de comienzo o arrastrar una barra se aplica «No comenzar antes del», como hace Project. |
| Hitos | Tareas de duración 0, dibujadas como rombo con fecha. |
| Responsables | Lista de responsables con rol y color, asignación múltiple por tarea y filtro por responsable. |
| Seguimiento | % completado por tarea (los resúmenes lo calculan ponderado por duración), línea base guardable y visible en el Gantt, línea de «hoy». |
| Gantt | Escalas de días, semanas y meses; arrastrar barras para moverlas o redimensionarlas; flechas de dependencias; ruta crítica en rojo. |
| Exportación | JSON (copia completa), XML de Microsoft Project (abre en Project, ProjectLibre, etc.), CSV para Excel, imagen PNG o SVG del Gantt, impresión/PDF. |
| Importación | JSON propio y XML de Microsoft Project (tareas, esquema, dependencias, restricciones, recursos y asignaciones). |
| Otros | Deshacer/rehacer ilimitado, búsqueda, filtro «solo críticas», atajos de teclado. |

## Atajos de teclado

| Tecla | Acción |
|---|---|
| `Insert` | Nueva tarea debajo de la seleccionada |
| `Supr` | Eliminar tarea(s) seleccionada(s) |
| `Tab` / `Shift+Tab` | Aplicar / anular sangría |
| `Enter` | Abrir la información de la tarea |
| `F2` | Editar el nombre en línea |
| `↑` / `↓` (+`Shift`) | Moverse por la lista (y extender la selección) |
| `←` / `→` | Contraer / expandir un resumen |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / rehacer |
| Doble clic en una celda | Editar en línea (nombre, duración, fechas, predecesoras, responsables, %) |

## Estructura del código

```
index.html        Interfaz (barra de herramientas, tabla, Gantt, diálogos)
css/styles.css    Estilos, incluido el modo de impresión
js/utils.js       Fechas (enteros UTC), formato, descargas
js/calendar.js    Calendarios laborales (días, excepciones, calendarios compuestos)
js/scheduler.js   Esquema EDT y motor CPM (dependencias, restricciones, holguras, ruta crítica)
js/store.js       Estado, deshacer/rehacer, guardado local, proyecto de ejemplo
js/caleditor.js   Editor de calendarios (proyecto y responsables)
js/table.js       Hoja de tareas con edición en línea
js/gantt.js       Gantt en SVG e interacción (arrastrar, redimensionar, vincular)
js/exporters.js   Exportación e importación
js/app.js         Controlador: toolbar, diálogos, filtros, teclado
```

No hay dependencias ni paso de compilación: son archivos estáticos.

## Publicar con GitHub Pages

En el repositorio: *Settings → Pages → Source: Deploy from a branch*, rama `main`, carpeta `/ (root)`. La app quedará disponible en `https://<usuario>.github.io/Project-planner/`.

## Limitaciones conocidas

- Los datos viven en el navegador. Para trabajar en varios equipos o compartir, usa Exportar/Importar JSON (o el XML de Project).
- Las duraciones son en días laborables enteros; no hay horas ni turnos.
- La nivelación de recursos y los costes no están implementados.
