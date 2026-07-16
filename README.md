# Simulador SQL — PokemonDB

Simulador de ejercicios SQL 100% local para clase de Bases de Datos.
Los alumnos abren `index.html` con doble clic (sin servidor, sin internet,
sin instalar nada) y resuelven consultas contra una base de datos SQLite
que se ejecuta dentro del propio navegador.

## Para los alumnos

1. Descarga la carpeta `dist/` (o el ZIP que te pase el profesor).
2. Descomprime y haz **doble clic en `index.html`**.
3. Escribe tu nombre, elige compañero y resuelve los ejercicios.
4. Cuando quieras continuar en casa, pulsa **Guardar y exportar progreso** durante la práctica y guarda el HTML generado. Al terminar, también podés exportarlo desde la pantalla final.

Después de cada intento, el simulador mantiene el resultado y una sugerencia
de siguiente paso junto al ejercicio. Los errores no interrumpen la consulta:
podés corregirla en el mismo sitio y, fuera del modo examen, pedir una pista
progresiva si la necesitás.

Las confirmaciones breves, como una respuesta correcta o una exportación
realizada, se ocultan solas tras unos cinco segundos. Los errores, las pistas
y las orientaciones para el siguiente paso permanecen visibles hasta que
cambies de ejercicio o actúes de nuevo.

Tu progreso se guarda automáticamente en el navegador: si cierras la
pestaña, al volver a abrir `index.html` podrás continuar donde lo dejaste.
El archivo exportado también sirve para continuar en otro ordenador:
usa *Importar progreso* en la pantalla de inicio y el simulador retomará el
ejercicio, intentos y ejercicios saltados guardados. Podés elegir los temas
Clásico, Índigo, Verde o Azul desde el control fijo de tema; la elección se
guarda en ese navegador.

El área **Compañeros desbloqueables** muestra cuatro compañeros visuales que
se consiguen al completar cada unidad (consultas básicas, JOINs y subconsultas)
o al resolver un ejercicio tras un error o un salto. Cada compañero bloqueado
indica el avance real de su unidad, así que llegar a U2 no equivale a completar
U1. No hay clasificaciones, rachas ni límites de reconocimientos. Los
compañeros usan el arte SVG local del simulador, sin imágenes remotas, y se
recalculan al continuar o exportar/importar el progreso.

## Para el profesor

### Estructura

| Ruta | Qué es |
|---|---|
| `index.html` | Interfaz completa (HTML + CSS) |
| `src/app.js` | Bootstrap, navegación, puntuación, render |
| `src/sql-engine.js` | Motor SQL (sql.js); solo permite un `SELECT`/`WITH` por envío, clonando la BD en cada ejecución |
| `src/result-compare.js` | Comparación del resultado del alumno con el esperado |
| `src/exercise-banks/` | **Bancos de ejercicios, uno por unidad** (U1 básicas, U2 joins, U3 subconsultas) — aquí se añaden/editan ejercicios |
| `src/exercises.js` | Ensamblador: recoge los bancos y expone la API (no se toca al añadir ejercicios) |
| `src/pokemon-seed.js` | Base de datos embebida en base64 (generada, no editar a mano) |
| `src/progress-store.js` | Persistencia del progreso en IndexedDB |
| `src/export-package.js` | Exportación/importación del progreso como HTML |
| `src/schema-reference.js` | Referencia del esquema (modal de tablas) |
| `vendor/sql-asm.js` | SQLite compilado a JavaScript puro (vendorizado — los alumnos no necesitan `npm install`) |
| `data/pokemon.sql` | SQL fuente original (MySQL) de la base de datos |
| `data/pokemon.sqlite` | Base de datos SQLite generada desde el SQL fuente |
| `dist/` | **Build para alumnos** — la regenera GitHub Actions en cada push a `main` |
| `tools/` | Scripts de build (conversión del seed, build de dist) |
| `tests/` | Suite de tests (`node --test`) |

### Requisitos de desarrollo

- Node.js 18+ (los tests usan `node --test`; CI usa Node 22).
- `npm install` para instalar sql.js (solo para desarrollo y tests;
  en runtime se usa la copia vendorizada de `vendor/`).

### Comandos

```bash
npm install                  # dependencias de desarrollo
npm test                     # suite completa (el pretest valida también los ejercicios)
npm run validate-exercises   # valida cada expectedSql contra la BD (ids, sintaxis, filas)
npm run build-dist           # regenera dist/ (la carpeta para alumnos)
npm run check-dist           # verifica que dist/ está al día (lo usa CI)
npm run review-exports -- carpeta/entregas notas.csv   # entregas HTML → CSV de notas
```

### Estructura de los ejercicios (3 unidades)

El contenido está organizado en **3 unidades temáticas independientes**,
cada una con progresión guiada → práctica → examen para ganar confianza:

1. **U1 — Consultas básicas** (12): SELECT, WHERE, LIKE, BETWEEN, NOT IN,
   ORDER BY, DISTINCT, LIMIT, cálculos con alias, concatenación,
   GROUP BY/HAVING sobre una tabla.
2. **U2 — JOINs** (8): INNER JOIN de 2 y 3 tablas, LEFT JOIN + IS NULL,
   N:M con tabla puente, JOIN con agregación y filtro de fecha.
3. **U3 — Subconsultas** (7): IN/NOT IN, subconsulta escalar (AVG/MAX),
   EXISTS correlacionada, subconsulta en FROM y en HAVING.

### Añadir o modificar ejercicios

Edita el banco de la unidad que toque en `src/exercise-banks/` — el
núcleo del simulador no se toca. Cada ejercicio es un objeto con `id`
(único global), `mode` (`guided` | `semi-guided` | `exam`), `prompt`,
`expectedSql` (sintaxis SQLite: `||` en vez de `CONCAT`,
`strftime('%Y', ...)` en vez de `YEAR()`), `ordered` (si el orden de
filas importa), `mysqlNote` (opcional: aclaración de sintaxis MySQL que
se muestra al alumno), ayudas/pistas y puntuación.

Después ejecuta `npm run validate-exercises`: comprueba cada consulta
contra la base de datos real (errores de SQL, ids duplicados, resultados
vacíos, ordered sin ORDER BY) sin abrir el navegador. Y por último
`npm test` y `npm run build-dist`.

Para añadir una **unidad nueva**: crea `src/exercise-banks/u4-loquesea.js`
copiando la estructura de un banco existente, y añade su `<script>` en
`index.html` ANTES de `src/exercises.js`.

### Nota MySQL

La clase trabaja con MySQL pero el simulador ejecuta SQLite. En los
ejercicios donde la sintaxis difiere (concatenación, funciones de
fecha…), el campo `mysqlNote` muestra al alumno un recuadro con la
equivalencia MySQL, de modo que el repaso refuerce ambas sintaxis.

Nota sobre la validación: si los datos del alumno son correctos pero los
alias de columna no coinciden, el simulador se lo indica explícitamente
("los datos son correctos, revisa los alias") en lugar de un genérico
"resultado incorrecto".

### Regenerar la base de datos

Si cambias `data/pokemon.sql`:

```bash
npm run build-seed     # data/pokemon.sql → data/pokemon.sqlite
npm run build-seed-js  # data/pokemon.sqlite → src/pokemon-seed.js (embebido)
npm test               # el pretest verifica que el seed embebido está al día
```

### La carpeta dist/ y GitHub Actions

El workflow `.github/workflows/build-dist.yml` se ejecuta en cada push a
`main`: pasa los tests, regenera `dist/` y, si cambió, lo commitea de
vuelta al repo (además sube un ZIP como artefacto del run). Así `dist/`
siempre refleja el estado probado de `main` y es lo único que necesitas
pasar a los alumnos.

Para que el bot pueda hacer push: en *Settings → Actions → General →
Workflow permissions*, activa **Read and write permissions**.

### Recogida y corrección de entregas

Cada alumno exporta un HTML autocontenido con su nombre, puntuación y
registro de intentos; se puede abrir directamente en el navegador para
revisarlo una a una.

Para corregir en bloque, junta todas las entregas en una carpeta y:

```bash
npm run review-exports -- ~/Descargas/entregas-1daw notas.csv
```

Genera `notas.csv` (una fila por alumno: nota, %, resueltos, saltados,
intentos, pistas) y `notas-detalle.csv` (una fila por alumno×ejercicio,
para ver qué ejercicios costaron más a la clase). Ambos se abren
directamente en Excel/LibreOffice.

Ten en cuenta que la puntuación se calcula en el cliente: para
evaluación con nota real, revisa el registro de intentos y no solo la
cifra final.

## Licencias

- Código del simulador: uso docente.
- `vendor/sql-asm.js` — [sql.js](https://github.com/sql-js/sql.js), MIT
  (copia de la licencia en `vendor/sql.js-LICENSE`).
