/**
 * exercise-banks/u3-subconsultas.js
 *
 * UNIDAD 3 — SUBCONSULTAS.
 * Subconsultas en WHERE (IN, NOT IN, comparación con escalar),
 * correlacionadas con EXISTS, subconsultas en FROM y en HAVING.
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
    order: 3,
    phases: [
      // ======================================================================
      // U3 — Fase guiada
      // ======================================================================
      {
        id: "u3-guiada",
        label: "U3 Subconsultas — Guiada",
        mode: "guided",
        phaseScoring: { maxHintPenalty: 0 },
        exercises: [
          {
            id: "u3g1-in",
            mode: "guided",
            title: "Subconsulta con IN — entrenadores victoriosos",
            prompt: "Muestra el nombre y apellidos de los entrenadores que han conseguido <strong>al menos una victoria</strong> en combates de gimnasio. Resuélvelo con una <strong>subconsulta</strong> (sin JOIN).",
            expectedSql: "SELECT nombre, apellidos FROM entrenadores WHERE identrenador IN (SELECT identrenador FROM combaten WHERE resultado = 'Victoria')",
            ordered: false,
            aids: {
              context: "Una <strong>subconsulta</strong> es una consulta dentro de otra. La interior se ejecuta primero y produce la lista de <code>identrenador</code> con victorias; la exterior usa <code>IN (esa lista)</code> para quedarse con los entrenadores cuyo id está en ella. Ventaja frente al JOIN en este caso: aunque un entrenador tenga 3 victorias, aparece UNA sola vez (IN no duplica filas).",
              guide: "Paso 1: consulta interior → <code>SELECT identrenador FROM combaten WHERE resultado = 'Victoria'</code>.<br>Paso 2: pruébala sola primero — devuelve la lista de ids.<br>Paso 3: consulta exterior → <code>SELECT nombre, apellidos FROM entrenadores WHERE identrenador IN ( ... )</code>.<br>Paso 4: la interior va SIEMPRE entre paréntesis.",
              solutionNote: "La subconsulta con IN filtra por pertenencia a una lista calculada. Truco de examen: escribe y prueba primero la consulta interior sola, y cuando funcione, envuélvela."
            },
            scoring: { points: 1 }
          },
          {
            id: "u3g2-avg-escalar",
            mode: "guided",
            title: "Subconsulta escalar — por encima de la media",
            prompt: "Muestra el nombre y la salud de los Pokémon cuya salud es <strong>superior a la salud media</strong> de todos los Pokémon.",
            expectedSql: "SELECT nombre, salud FROM pokemon WHERE salud > (SELECT AVG(salud) FROM pokemon)",
            ordered: false,
            aids: {
              context: "No puedes escribir <code>WHERE salud &gt; AVG(salud)</code> — las funciones de agregación no se permiten en el WHERE directamente. La solución es una <strong>subconsulta escalar</strong>: <code>(SELECT AVG(salud) FROM pokemon)</code> devuelve UN único valor (la media), y ese valor se compara con la salud de cada fila.",
              guide: "Paso 1: ¿cuál es la media? → <code>SELECT AVG(salud) FROM pokemon</code> (devuelve un solo número).<br>Paso 2: exterior → <code>SELECT nombre, salud FROM pokemon WHERE salud &gt; ( ... )</code>.<br>Paso 3: fíjate en que la misma tabla aparece en las dos consultas — es válido y muy habitual.",
              solutionNote: "Una subconsulta escalar devuelve un único valor y puede usarse en cualquier comparación (>, <, =, ...). Es el patrón estándar para «mayor/menor que la media, el máximo, el mínimo...»."
            },
            scoring: { points: 1 }
          }
        ]
      },

      // ======================================================================
      // U3 — Fase práctica (semi-guiada)
      // ======================================================================
      {
        id: "u3-practica",
        label: "U3 Subconsultas — Práctica",
        mode: "semi-guided",
        phaseScoring: { maxHintPenalty: 0.4 },
        exercises: [
          {
            id: "u3s1-notin",
            mode: "semi-guided",
            title: "NOT IN con subconsulta — Pokémon sin historial médico",
            prompt: "¿Qué Pokémon <strong>no han asistido nunca</strong> a un Centro Pokémon? Muestra su nombre. (La tabla <code>pokemonasistencia</code> registra las asistencias.)",
            expectedSql: "SELECT nombre FROM pokemon WHERE idpokemon NOT IN (SELECT idpokemon FROM pokemonasistencia)",
            ordered: false,
            hints: [
              {
                label: "Pista 1 — Darle la vuelta al IN",
                text: "La subconsulta <code>SELECT idpokemon FROM pokemonasistencia</code> devuelve los ids de los Pokémon que SÍ han asistido. Como buscas los que NO, usa <code>NOT IN</code> en la consulta exterior.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT nombre FROM pokemon WHERE idpokemon NOT IN (SELECT idpokemon FROM pokemonasistencia)</code> — este patrón equivale al LEFT JOIN + IS NULL que viste en la unidad 2. En un examen, cualquiera de los dos vale (aquí se pide con subconsulta).",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u3s2-max",
            mode: "semi-guided",
            title: "Subconsulta con MAX — el Pokémon más fuerte",
            prompt: "Muestra el nombre y el nivel del Pokémon (o Pokémon, si hay empate) con el <strong>nivel más alto</strong> de toda la base de datos. Resuélvelo con una subconsulta, no con ORDER BY + LIMIT.",
            expectedSql: "SELECT nombre, nivel FROM pokemon WHERE nivel = (SELECT MAX(nivel) FROM pokemon)",
            ordered: false,
            hints: [
              {
                label: "Pista 1 — ¿Por qué no vale ORDER BY + LIMIT 1?",
                text: "Con <code>LIMIT 1</code>, si dos Pokémon empatan al nivel máximo solo verías uno. La forma correcta: calcula el máximo con una subconsulta escalar <code>(SELECT MAX(nivel) FROM pokemon)</code> y compara con <code>=</code>.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT nombre, nivel FROM pokemon WHERE nivel = (SELECT MAX(nivel) FROM pokemon)</code> — mismo patrón que el ejercicio de la media, cambiando AVG por MAX y &gt; por =.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u3s3-exists",
            mode: "semi-guided",
            title: "EXISTS correlacionada — ciudades con gimnasio de Agua",
            prompt: "¿Qué <strong>ciudades</strong> tienen algún <strong>gimnasio de tipo 'Agua'</strong>? Muestra el nombre de la ciudad (columna <strong>Ciudad</strong>). Resuélvelo con <strong>EXISTS</strong>.",
            expectedSql: "SELECT c.nombre AS 'Ciudad' FROM ciudades c WHERE EXISTS (SELECT 1 FROM gimnasios g WHERE g.idciudad = c.idciudad AND g.tipo = 'Agua')",
            ordered: false,
            hints: [
              {
                label: "Pista 1 — ¿Qué es una subconsulta correlacionada?",
                text: "<code>EXISTS (subconsulta)</code> es verdadero si la subconsulta devuelve AL MENOS una fila. La subconsulta es «correlacionada» porque usa una columna de la consulta exterior: <code>g.idciudad = c.idciudad</code> conecta cada ciudad con SUS gimnasios. Por convención se escribe <code>SELECT 1</code> dentro (lo que se seleccione da igual; solo importa si hay filas).",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT c.nombre FROM ciudades c WHERE EXISTS (SELECT 1 FROM gimnasios g WHERE g.idciudad = c.idciudad AND g.tipo = 'Agua')</code> — falta el alias de columna. La exterior necesita alias de tabla (<code>c</code>) para que la interior pueda referirse a ella.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          }
        ]
      },

      // ======================================================================
      // U3 — Examen
      // ======================================================================
      {
        id: "u3-examen",
        label: "U3 Subconsultas — Examen",
        mode: "exam",
        phaseScoring: { maxHintPenalty: 0.5 },
        exercises: [
          {
            id: "u3e1-from",
            mode: "exam",
            title: "Examen U3 — Subconsulta en el FROM",
            prompt: "¿Cuál es la <strong>media de Pokémon por entrenador</strong>? Calcula primero cuántos Pokémon tiene cada entrenador (subconsulta en el FROM) y después la media de esos totales, redondeada a 2 decimales. La columna debe llamarse <strong>Media Pokémon</strong>.",
            expectedSql: "SELECT ROUND(AVG(t.total), 2) AS 'Media Pokémon' FROM (SELECT identrenador, COUNT(*) AS total FROM pokemon GROUP BY identrenador) t",
            ordered: false,
            mysqlNote: "Igual en MySQL. En ambos SGBD la subconsulta del FROM necesita obligatoriamente un alias (aquí, <code>t</code>) — olvidarlo es un error de sintaxis clásico.",
            hints: [
              {
                label: "Pista 1 — Una media de un conteo",
                text: "No puedes escribir <code>AVG(COUNT(*))</code> — no se pueden anidar agregaciones. La solución en dos pasos: la subconsulta del FROM calcula los conteos (<code>SELECT identrenador, COUNT(*) AS total FROM pokemon GROUP BY identrenador</code>) y actúa como si fuera una tabla; la exterior hace <code>AVG(total)</code> sobre ella.",
                penalty: 0.15
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT ROUND(AVG(t.total), 2) FROM (SELECT identrenador, COUNT(*) AS total FROM pokemon GROUP BY identrenador) t</code> — no olvides el alias <code>t</code> de la subconsulta ni el alias de la columna final.",
                penalty: 0.25
              }
            ],
            scoring: { points: 3, errorPenalty: 0.25 }
          },
          {
            id: "u3e2-having-sub",
            mode: "exam",
            title: "Examen U3 — Por encima de la media (HAVING con subconsulta)",
            prompt: "¿Qué entrenadores tienen <strong>más Pokémon que la media</strong> de Pokémon por entrenador? Muestra el nombre del entrenador y su total, de mayor a menor. Columnas: <strong>Entrenador</strong> y <strong>Total</strong>. (Combina lo aprendido: GROUP BY, HAVING y la subconsulta del ejercicio anterior.)",
            expectedSql: "SELECT nombre_entrenador AS 'Entrenador', COUNT(*) AS 'Total' FROM pokemon GROUP BY nombre_entrenador HAVING COUNT(*) > (SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM pokemon GROUP BY nombre_entrenador)) ORDER BY COUNT(*) DESC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — El plan",
                text: "La consulta exterior es el GROUP BY con COUNT que ya conoces de la unidad 1. La novedad: el umbral del HAVING no es un número fijo, sino la media calculada con una subconsulta (que a su vez contiene la subconsulta en FROM del ejercicio anterior).",
                penalty: 0.15
              },
              {
                label: "Pista 2 — El HAVING",
                text: "<code>HAVING COUNT(*) &gt; (SELECT AVG(cnt) FROM (SELECT COUNT(*) AS cnt FROM pokemon GROUP BY nombre_entrenador))</code> — la subconsulta devuelve un único valor (la media), así que puede compararse directamente.",
                penalty: 0.25
              }
            ],
            scoring: { points: 3, errorPenalty: 0.25 }
          }
        ]
      }
    ]
  });
})();
