/**
 * exercise-banks/u2-joins.js
 *
 * UNIDAD 2 — JOINS.
 * INNER JOIN de 2 y 3 tablas, LEFT JOIN, IS NULL, relaciones N:M con
 * tabla puente, y JOIN combinado con agregación (GROUP BY / HAVING).
 *
 * Para AÑADIR un ejercicio: añade un objeto a la fase que toque y
 * ejecuta `npm run validate-exercises`. No hace falta tocar ningún
 * otro archivo del simulador.
 *
 * Load BEFORE src/exercises.js.
 */
(function () {
  "use strict";

  window.AppExerciseBanks = window.AppExerciseBanks || [];

  window.AppExerciseBanks.push({
    order: 2,
    phases: [
      // ======================================================================
      // U2 — Fase guiada
      // ======================================================================
      {
        id: "u2-guiada",
        label: "U2 JOINs — Guiada",
        mode: "guided",
        phaseScoring: { maxHintPenalty: 0 },
        exercises: [
          {
            id: "u2g1-join-simple",
            mode: "guided",
            title: "Tu primer JOIN — gimnasios y sus ciudades",
            prompt: "Muestra el nombre de cada <strong>gimnasio</strong> junto al nombre de la <strong>ciudad</strong> donde está. La columna del gimnasio debe llamarse <strong>Gimnasio</strong> y la de la ciudad <strong>Ciudad</strong>.",
            expectedSql: "SELECT g.nombre AS 'Gimnasio', c.nombre AS 'Ciudad' FROM gimnasios g INNER JOIN ciudades c ON g.idciudad = c.idciudad",
            ordered: false,
            aids: {
              context: "La tabla <code>gimnasios</code> no guarda el nombre de la ciudad — guarda <code>idciudad</code>, una clave ajena que apunta a la tabla <code>ciudades</code>. <strong>INNER JOIN</strong> une las dos tablas emparejando las filas donde <code>g.idciudad = c.idciudad</code>. Los alias de tabla (<code>g</code>, <code>c</code>) abrevian y son imprescindibles aquí: ambas tablas tienen una columna <code>nombre</code>, así que hay que distinguir <code>g.nombre</code> de <code>c.nombre</code>.",
              guide: "Paso 1: tabla principal → <code>FROM gimnasios g</code>.<br>Paso 2: unir con → <code>INNER JOIN ciudades c</code>.<br>Paso 3: ¿por qué campo se relacionan? → <code>ON g.idciudad = c.idciudad</code>.<br>Paso 4: columnas con prefijo de tabla y alias → <code>g.nombre AS 'Gimnasio', c.nombre AS 'Ciudad'</code>.",
              solutionNote: "El JOIN empareja filas de dos tablas por la condición del ON (normalmente clave ajena = clave primaria). Cuando dos tablas tienen columnas con el mismo nombre, el prefijo de tabla es obligatorio."
            },
            scoring: { points: 1 }
          },
          {
            id: "u2g2-join-where",
            mode: "guided",
            title: "JOIN con filtro — los Pokémon de Kanto",
            prompt: "Muestra el nombre de cada <strong>Pokémon</strong> junto al nombre de su <strong>entrenador</strong>, pero solo de los entrenadores de la región <strong>Kanto</strong>. Columnas: <strong>Pokémon</strong> y <strong>Entrenador</strong>.",
            expectedSql: "SELECT p.nombre AS 'Pokémon', e.nombre AS 'Entrenador' FROM pokemon p INNER JOIN entrenadores e ON p.identrenador = e.identrenador WHERE e.region = 'Kanto'",
            ordered: false,
            aids: {
              context: "El filtro <code>WHERE</code> se combina con el JOIN sin problema: primero se emparejan las filas (ON), y después se filtran (WHERE). Fíjate en que la condición del filtro usa una columna de <code>entrenadores</code> (<code>e.region</code>) aunque en el SELECT también haya columnas de <code>pokemon</code> — una vez unidas, puedes usar columnas de cualquiera de las dos tablas en cualquier parte de la consulta.",
              guide: "Paso 1: <code>FROM pokemon p INNER JOIN entrenadores e</code>.<br>Paso 2: ¿campo que las relaciona? → <code>ON p.identrenador = e.identrenador</code>.<br>Paso 3: filtro → <code>WHERE e.region = 'Kanto'</code>.<br>Paso 4: el ON une, el WHERE filtra — no los mezcles.",
              solutionNote: "ON dice CÓMO se emparejan las tablas; WHERE dice QUÉ filas del resultado emparejado te interesan. Son cosas distintas y van en cláusulas distintas."
            },
            scoring: { points: 1 }
          }
        ]
      },

      // ======================================================================
      // U2 — Fase práctica (semi-guiada)
      // ======================================================================
      {
        id: "u2-practica",
        label: "U2 JOINs — Práctica",
        mode: "semi-guided",
        phaseScoring: { maxHintPenalty: 0.4 },
        exercises: [
          {
            id: "s2-join-avg",
            mode: "semi-guided",
            title: "JOIN con AVG — salud media por región",
            prompt: "Calcula la <strong>salud media</strong> de los Pokémon <strong>por región del entrenador</strong>. Muestra la región y la salud media redondeada a un decimal. Ordena de mayor a menor salud media.",
            expectedSql: "SELECT e.region AS 'Región', ROUND(AVG(p.salud), 1) AS 'Salud Media' FROM pokemon p INNER JOIN entrenadores e ON p.identrenador = e.identrenador GROUP BY e.region ORDER BY AVG(p.salud) DESC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — ¿Por qué necesitas JOIN?",
                text: "La <code>salud</code> está en la tabla <strong>pokemon</strong>, pero la <code>region</code> está en <strong>entrenadores</strong>. Necesitas unir ambas tablas. El campo que las relaciona es <code>identrenador</code>: <code>p.identrenador = e.identrenador</code>. Usa alias de tabla (p, e) para abreviar.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Funciones de agregación",
                text: "<code>AVG(p.salud)</code> calcula la media de salud en cada grupo. <code>ROUND(valor, 1)</code> redondea a un decimal. Agrupa por <code>e.region</code> después del JOIN. Para ordenar de mayor a menor, usa <code>ORDER BY AVG(p.salud) DESC</code>.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "s3-leftjoin-isnull",
            mode: "semi-guided",
            title: "LEFT JOIN con IS NULL — Pokémon sin historial médico",
            prompt: "¿Qué Pokémon <strong>no han asistido nunca</strong> a un Centro Pokémon? Muestra su nombre y su nivel. (Las asistencias se registran en la tabla <code>pokemonasistencia</code>.)",
            expectedSql: "SELECT p.nombre AS 'Nombre', p.nivel AS 'Nivel' FROM pokemon p LEFT JOIN pokemonasistencia pa ON p.idpokemon = pa.idpokemon WHERE pa.idcentropokemon IS NULL",
            ordered: false,
            hints: [
              {
                label: "Pista 1 — ¿INNER JOIN o LEFT JOIN?",
                text: "Un <strong>INNER JOIN</strong> solo devuelve Pokémon que SÍ tienen asistencias. Para encontrar los que NO, necesitas <strong>LEFT JOIN</strong>: todos los Pokémon aparecen, y los que nunca asistieron tendrán <code>NULL</code> en las columnas de <code>pokemonasistencia</code>. La tabla izquierda es <code>pokemon</code>.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Filtrar los NULL",
                text: "Después del LEFT JOIN, los Pokémon sin asistencias tienen <code>NULL</code> en <code>pa.idcentropokemon</code> y demás columnas del lado derecho. Usa <code>WHERE pa.idcentropokemon IS NULL</code>. ¡Importante! No uses <code>= NULL</code> — NULL siempre se compara con <code>IS NULL</code> o <code>IS NOT NULL</code>.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u2s1-tres-tablas",
            mode: "semi-guided",
            title: "Tres tablas encadenadas — el registro de victorias",
            prompt: "Muestra las <strong>victorias</strong> registradas: nombre del entrenador, nombre del gimnasio y el resultado. Solo los combates cuyo resultado sea <strong>'Victoria'</strong>. Columnas: <strong>Entrenador</strong>, <strong>Gimnasio</strong>, <strong>Resultado</strong>.",
            expectedSql: "SELECT e.nombre AS 'Entrenador', g.nombre AS 'Gimnasio', co.resultado AS 'Resultado' FROM combaten co INNER JOIN entrenadores e ON co.identrenador = e.identrenador INNER JOIN gimnasios g ON co.idgimnasio = g.idgimnasio WHERE co.resultado = 'Victoria'",
            ordered: false,
            hints: [
              {
                label: "Pista 1 — ¿Qué tablas intervienen?",
                text: "<strong>combaten</strong> es la tabla central: tiene <code>identrenador</code> (→ entrenadores) y <code>idgimnasio</code> (→ gimnasios). Necesitas DOS JOINs partiendo de ella, uno hacia cada tabla.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Encadenar JOINs",
                text: "<code>FROM combaten co INNER JOIN entrenadores e ON co.identrenador = e.identrenador INNER JOIN gimnasios g ON co.idgimnasio = g.idgimnasio</code> — cada JOIN lleva su propio ON. Después el WHERE del resultado.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u2s2-nm-ciudades",
            mode: "semi-guided",
            title: "Relación N:M — qué ciudades ha visitado cada entrenador",
            prompt: "Un entrenador puede visitar muchas ciudades y una ciudad recibe a muchos entrenadores (relación N:M a través de la tabla puente <code>entrenadoresciudades</code>). Muestra cada pareja <strong>entrenador–ciudad</strong>, ordenada por nombre de entrenador y, dentro de cada entrenador, por nombre de ciudad. Columnas: <strong>Entrenador</strong> y <strong>Ciudad</strong>.",
            expectedSql: "SELECT e.nombre AS 'Entrenador', c.nombre AS 'Ciudad' FROM entrenadoresciudades ec INNER JOIN entrenadores e ON ec.identrenador = e.identrenador INNER JOIN ciudades c ON ec.idciudad = c.idciudad ORDER BY e.nombre ASC, c.nombre ASC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — La tabla puente",
                text: "Las relaciones N:M no se guardan en las tablas principales, sino en una tabla puente con las dos claves ajenas: <code>entrenadoresciudades(identrenador, idciudad)</code>. Parte de ella con el FROM y haz un JOIN hacia cada lado.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Orden con dos criterios",
                text: "<code>ORDER BY e.nombre ASC, c.nombre ASC</code> — el segundo criterio decide el orden dentro de los empates del primero. La estructura de JOINs es igual que en el ejercicio anterior, cambiando las tablas.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          }
        ]
      },

      // ======================================================================
      // U2 — Examen
      // ======================================================================
      {
        id: "u2-examen",
        label: "U2 JOINs — Examen",
        mode: "exam",
        phaseScoring: { maxHintPenalty: 0.5 },
        exercises: [
          {
            id: "u2e1-join-groupby-having",
            mode: "exam",
            title: "Examen U2 — JOIN con agrupación y HAVING",
            prompt: "¿Qué <strong>regiones</strong> acumulan <strong>2 o más victorias</strong> en combates de gimnasio? Muestra la región y su número de victorias, ordenado de más a menos victorias. Columnas: <strong>Región</strong> y <strong>Victorias</strong>.",
            expectedSql: "SELECT e.region AS 'Región', COUNT(*) AS 'Victorias' FROM combaten co INNER JOIN entrenadores e ON co.identrenador = e.identrenador WHERE co.resultado = 'Victoria' GROUP BY e.region HAVING COUNT(*) >= 2 ORDER BY COUNT(*) DESC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — El orden de las piezas",
                text: "Necesitas: JOIN entre <code>combaten</code> y <code>entrenadores</code>, un WHERE para quedarte solo con victorias, GROUP BY por región, HAVING para el mínimo de 2, y ORDER BY. Ese es exactamente el orden en que se escriben.",
                penalty: 0.15
              },
              {
                label: "Pista 2 — WHERE vs HAVING (otra vez)",
                text: "«Solo victorias» filtra FILAS individuales → <code>WHERE co.resultado = 'Victoria'</code>. «2 o más victorias» filtra GRUPOS ya contados → <code>HAVING COUNT(*) &gt;= 2</code>. Cada filtro en su sitio.",
                penalty: 0.20
              },
              {
                label: "Pista 3 — Estructura completa",
                text: "<code>SELECT e.region, COUNT(*) FROM combaten co INNER JOIN entrenadores e ON co.identrenador = e.identrenador WHERE co.resultado = 'Victoria' GROUP BY e.region HAVING COUNT(*) &gt;= 2 ORDER BY COUNT(*) DESC</code> — faltan los alias.",
                penalty: 0.25
              }
            ],
            scoring: { points: 3, errorPenalty: 0.25 }
          },
          {
            id: "e2-join-nm-strftime",
            mode: "exam",
            title: "Examen U2 — JOIN N:M con filtro de fecha",
            prompt: "El archivo histórico necesita los Pokémon que <strong>visitaron algún Centro Pokémon en el año 2025</strong>. Muestra el nombre del Pokémon, el nombre del centro y la fecha de asistencia. Ordena por fecha ascendente. <br><br>Pista técnica: la relación entre Pokémon y Centros es N:M y necesita la tabla puente <code>pokemonasistencia</code>. Para filtrar por año, usa <code>strftime('%Y', campo_fecha) = '2025'</code> en SQLite.",
            expectedSql: "SELECT p.nombre AS 'Pokémon', a.nombre_centro AS 'Centro', a.fecha_asistencia AS 'Fecha' FROM pokemon p INNER JOIN pokemonasistencia pa ON p.idpokemon = pa.idpokemon INNER JOIN asistencia a ON pa.idcentropokemon = a.idcentropokemon WHERE strftime('%Y', a.fecha_asistencia) = '2025' ORDER BY a.fecha_asistencia ASC",
            ordered: true,
            mysqlNote: "En MySQL el año se extrae con <code>YEAR(a.fecha_asistencia) = 2025</code> (devuelve número, sin comillas). <code>strftime</code> es propio de SQLite.",
            hints: [
              {
                label: "Pista 1 — Tablas necesarias",
                text: "Necesitas <strong>pokemon</strong> (nombre), <strong>asistencia</strong> (nombre del centro y fecha). Pero no se conectan directamente: hay una tabla puente <strong>pokemonasistencia</strong> (campos: <code>idpokemon</code>, <code>idcentropokemon</code>). Necesitas dos JOINs encadenados.",
                penalty: 0.10
              },
              {
                label: "Pista 2 — Filtrar por año en SQLite",
                text: "La fecha está en formato ISO-8601 (YYYY-MM-DD) en el campo <code>fecha_asistencia</code>. En SQLite, extraes el año con <code>strftime('%Y', a.fecha_asistencia)</code>. Compara con <code>= '2025'</code> (como texto, porque strftime devuelve texto).",
                penalty: 0.15
              },
              {
                label: "Pista 3 — Cadena de JOINs",
                text: "<code>FROM pokemon p INNER JOIN pokemonasistencia pa ON p.idpokemon = pa.idpokemon INNER JOIN asistencia a ON pa.idcentropokemon = a.idcentropokemon</code>. Después añade el WHERE con strftime() y el ORDER BY por fecha.",
                penalty: 0.20
              }
            ],
            scoring: { points: 3, errorPenalty: 0.25 }
          }
        ]
      }
    ]
  });
})();
