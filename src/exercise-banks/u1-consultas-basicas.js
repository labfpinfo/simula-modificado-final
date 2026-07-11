/**
 * exercise-banks/u1-consultas-basicas.js
 *
 * UNIDAD 1 — CONSULTAS BÁSICAS (una sola tabla).
 * SELECT, WHERE, operadores, LIKE, BETWEEN, IN, ORDER BY, DISTINCT,
 * LIMIT, cálculos con alias, concatenación y agregación básica
 * (GROUP BY / HAVING sobre una tabla).
 *
 * Para AÑADIR un ejercicio: añade un objeto a la fase que toque y
 * ejecuta `npm run validate-exercises` para comprobar que tu
 * expectedSql funciona contra la base de datos. No hace falta tocar
 * ningún otro archivo del simulador.
 *
 * Campo opcional `mysqlNote`: aclaración de sintaxis para MySQL cuando
 * SQLite difiere (se muestra bajo el enunciado).
 *
 * Load BEFORE src/exercises.js (el ensamblador recoge los bancos).
 */
(function () {
  "use strict";

  window.AppExerciseBanks = window.AppExerciseBanks || [];

  window.AppExerciseBanks.push({
    order: 1,
    phases: [
      // ======================================================================
      // U1 — Fase guiada
      // ======================================================================
      {
        id: "u1-guiada",
        label: "U1 Básicas — Guiada",
        mode: "guided",
        phaseScoring: { maxHintPenalty: 0 },
        exercises: [
          {
            id: "u1g1-select-order",
            mode: "guided",
            title: "Tu primera consulta — SELECT y ORDER BY",
            prompt: "Muestra el <strong>nombre y la descripción de todas las ciudades</strong>, ordenadas alfabéticamente por nombre.",
            expectedSql: "SELECT nombre, descripcion FROM ciudades ORDER BY nombre ASC",
            ordered: true,
            aids: {
              context: "La estructura mínima de una consulta es <code>SELECT columnas FROM tabla</code>. Las columnas se separan con comas y se escriben tal cual aparecen en la tabla. <code>ORDER BY columna ASC</code> ordena el resultado de la A a la Z (ASC es el orden por defecto, DESC lo invierte).",
              guide: "Paso 1: ¿qué columnas? → <code>nombre</code>, <code>descripcion</code>.<br>Paso 2: ¿de qué tabla? → <code>ciudades</code>.<br>Paso 3: ¿orden alfabético? → <code>ORDER BY nombre ASC</code> al final.",
              solutionNote: "SELECT elige columnas, FROM elige la tabla y ORDER BY ordena el resultado. Es el esqueleto de casi todas las consultas que harás."
            },
            scoring: { points: 1 }
          },
          {
            id: "g1-simple-where",
            mode: "guided",
            title: "Filtro con WHERE — entrenadores de Kanto",
            prompt: "Obtén el nombre, apellidos y nivel de todos los entrenadores de la región <strong>Kanto</strong>.",
            expectedSql: "SELECT nombre, apellidos, nivel FROM entrenadores WHERE region = 'Kanto'",
            ordered: false,
            aids: {
              context: "La tabla <code>entrenadores</code> guarda la región en el campo <code>region</code>. Usamos <strong>WHERE</strong> para filtrar solo las filas donde ese campo valga exactamente 'Kanto'. Sin WHERE, la consulta devolvería todos los entrenadores de todas las regiones juntas.",
              guide: "Paso 1: ¿qué columnas necesito? → <code>nombre</code>, <code>apellidos</code>, <code>nivel</code>.<br>Paso 2: ¿de qué tabla? → <code>entrenadores</code>.<br>Paso 3: ¿qué filtra? → <code>WHERE region = 'Kanto'</code>.<br>Paso 4: los textos en SQL siempre van entre comillas simples.",
              solutionNote: "WHERE filtra filas antes de mostrarlas. Solo aparecen los entrenadores cuyo campo <code>region</code> valga exactamente 'Kanto'."
            },
            scoring: { points: 1 }
          },
          {
            id: "g2-and",
            mode: "guided",
            title: "Dos condiciones con AND — Pokémon para revisión",
            prompt: "El departamento médico necesita Pokémon <strong>masculinos con salud inferior a 100</strong>. Muestra el nombre, la salud y el sexo de esos Pokémon.",
            expectedSql: "SELECT nombre, salud, sexo FROM pokemon WHERE salud < 100 AND sexo = 'M'",
            ordered: false,
            aids: {
              context: "Necesitamos dos condiciones que deben cumplirse <strong>simultáneamente</strong>. <code>AND</code> exige que ambas sean verdaderas. Si usáramos <code>OR</code>, aparecerían todos los Pokémon de salud baja (sin importar sexo) más todos los masculinos (sin importar salud).",
              guide: "Paso 1: tabla → <code>pokemon</code> tiene <code>salud</code> y <code>sexo</code>.<br>Paso 2: condición 1 → <code>salud &lt; 100</code>.<br>Paso 3: condición 2 → <code>sexo = 'M'</code>.<br>Paso 4: ¿deben cumplirse las dos? Sí → une con <code>AND</code>.",
              solutionNote: "AND significa que AMBAS condiciones deben cumplirse. Con OR bastaría con que se cumpla una de las dos, produciendo un resultado más amplio."
            },
            scoring: { points: 1 }
          },
          {
            id: "g3-like-between",
            mode: "guided",
            title: "Patrones con LIKE y rangos con BETWEEN",
            prompt: "Encuentra los Pokémon cuyo <strong>nombre empieza por 'Ch'</strong> O cuyo <strong>nivel esté entre 20 y 50</strong>. Muestra nombre, nivel y descripción.",
            expectedSql: "SELECT nombre, nivel, descripcion FROM pokemon WHERE nombre LIKE 'Ch%' OR nivel BETWEEN 20 AND 50",
            ordered: false,
            aids: {
              context: "<code>LIKE</code> busca patrones de texto con el comodín <code>%</code>. <code>'Ch%'</code> significa «empieza por Ch». <code>'%Ch%'</code> significaría «contiene Ch en cualquier parte». <code>BETWEEN 20 AND 50</code> incluye ambos extremos (20 y 50). Como basta con UNA de las dos condiciones, usamos <code>OR</code>.",
              guide: "Paso 1: ¿buscar patrón de texto? → <code>LIKE 'Ch%'</code> para «empieza por Ch».<br>Paso 2: ¿rango numérico? → <code>BETWEEN 20 AND 50</code> (incluye 20 y 50).<br>Paso 3: ¿ambas condiciones o solo una? → basta con una → <code>OR</code>.<br>¡Atención! <code>'Ch%'</code> y <code>'%Ch%'</code> son distintos.",
              solutionNote: "LIKE con % busca patrones. 'Ch%' significa «empieza por Ch». BETWEEN incluye ambos extremos."
            },
            scoring: { points: 1 }
          }
        ]
      },

      // ======================================================================
      // U1 — Fase práctica (semi-guiada)
      // ======================================================================
      {
        id: "u1-practica",
        label: "U1 Básicas — Práctica",
        mode: "semi-guided",
        phaseScoring: { maxHintPenalty: 0.4 },
        exercises: [
          {
            id: "g4-notin-order",
            mode: "semi-guided",
            title: "NOT IN y ORDER BY — excluir valores",
            prompt: "Muestra los entrenadores de <strong>otras regiones</strong> (que no sean Kanto ni Sinnoh), ordenados por edad de menor a mayor. Muestra nombre, región y edad.",
            expectedSql: "SELECT nombre, region, edad FROM entrenadores WHERE region NOT IN ('Kanto', 'Sinnoh') ORDER BY edad ASC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — ¿Cómo excluir varios valores?",
                text: "<code>NOT IN ('A','B')</code> excluye una lista de valores. Equivale a <code>region &lt;&gt; 'Kanto' AND region &lt;&gt; 'Sinnoh'</code>. <strong>Trampa clásica:</strong> <code>region &lt;&gt; 'Kanto' OR region &lt;&gt; 'Sinnoh'</code> no filtra nada.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura",
                text: "NOT IN va en el WHERE; <code>ORDER BY edad ASC</code> va al final de la consulta.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u1s1-distinct",
            mode: "semi-guided",
            title: "DISTINCT — valores sin repetir",
            prompt: "¿En qué <strong>regiones distintas</strong> hay entrenadores? Muestra cada región una sola vez, ordenadas alfabéticamente.",
            expectedSql: "SELECT DISTINCT region FROM entrenadores ORDER BY region ASC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — ¿Cómo evito los duplicados?",
                text: "Un <code>SELECT region FROM entrenadores</code> normal devuelve una fila POR ENTRENADOR, repitiendo la región. <code>SELECT DISTINCT region ...</code> colapsa los duplicados y muestra cada valor una sola vez.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT DISTINCT region FROM entrenadores ORDER BY region ASC</code> — DISTINCT va justo después de SELECT, antes de la lista de columnas.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u1s2-calculo-alias",
            mode: "semi-guided",
            title: "Cálculos y alias — inventario de tiendas",
            prompt: "Para cada tienda, muestra el nombre y el <strong>total de objetos</strong> (la suma de objetos de curaciones y objetos de ayuda). La columna del nombre debe llamarse <strong>Tienda</strong> y la del cálculo <strong>Total Objetos</strong>.",
            expectedSql: "SELECT nombre_tienda AS 'Tienda', objetos_de_curaciones + objetos_de_ayuda AS 'Total Objetos' FROM tiendas",
            ordered: false,
            hints: [
              {
                label: "Pista 1 — Operar con columnas",
                text: "En el SELECT puedes hacer aritmética con las columnas: <code>columna1 + columna2</code>. La tabla es <code>tiendas</code> y los campos son <code>objetos_de_curaciones</code> y <code>objetos_de_ayuda</code>.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Renombrar columnas",
                text: "<code>AS 'Nuevo Nombre'</code> da nombre a la columna del resultado: <code>SELECT nombre_tienda AS 'Tienda', a + b AS 'Total Objetos' FROM tiendas</code>. Sin el alias, la columna calculada saldría con un nombre feo como «objetos_de_curaciones + objetos_de_ayuda».",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u1s3-top-limit",
            mode: "semi-guided",
            title: "ORDER BY DESC y LIMIT — el podio de salud",
            prompt: "Muestra el nombre y la salud de los <strong>3 Pokémon con más salud</strong>, de mayor a menor.",
            expectedSql: "SELECT nombre, salud FROM pokemon ORDER BY salud DESC LIMIT 3",
            ordered: true,
            mysqlNote: "LIMIT funciona igual en MySQL. (En otros SGBD como SQL Server sería TOP 3, y en Oracle FETCH FIRST 3 ROWS ONLY.)",
            hints: [
              {
                label: "Pista 1 — ¿Cómo me quedo solo con los primeros?",
                text: "Primero ordena de mayor a menor con <code>ORDER BY salud DESC</code>. Después, <code>LIMIT 3</code> corta el resultado y se queda solo con las 3 primeras filas. El orden importa: LIMIT siempre va al final.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT nombre, salud FROM pokemon ORDER BY salud DESC LIMIT 3</code> — sin el ORDER BY, LIMIT devolvería 3 filas cualesquiera, no las de más salud.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "u1s4-concatenar",
            mode: "semi-guided",
            title: "Concatenar textos — fichas de Pokémon",
            prompt: "Genera una <strong>ficha</strong> por cada Pokémon de nivel 50 o superior con el formato <code>Nombre - nivel N</code> (por ejemplo: «Charizard - nivel 50»). La columna debe llamarse <strong>Ficha</strong>.",
            expectedSql: "SELECT nombre || ' - nivel ' || nivel AS 'Ficha' FROM pokemon WHERE nivel >= 50",
            ordered: false,
            mysqlNote: "En MySQL la concatenación se hace con la función CONCAT: <code>CONCAT(nombre, ' - nivel ', nivel) AS Ficha</code>. El operador <code>||</code> es de SQLite (y del estándar SQL).",
            hints: [
              {
                label: "Pista 1 — Unir textos en SQLite",
                text: "El operador <code>||</code> pega textos y valores: <code>nombre || ' - nivel ' || nivel</code>. Fíjate en los espacios DENTRO de las comillas del literal <code>' - nivel '</code> — sin ellos saldría «Charizard- nivel50».",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT nombre || ' - nivel ' || nivel AS 'Ficha' FROM pokemon WHERE nivel &gt;= 50</code> — recuerda el filtro de nivel y el alias.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          },
          {
            id: "s1-groupby-count",
            mode: "semi-guided",
            title: "GROUP BY con COUNT — Pokémon por entrenador",
            prompt: "¿Cuántos Pokémon tiene cada entrenador? Muestra el nombre del entrenador y el total, ordenado de mayor a menor.",
            expectedSql: "SELECT nombre_entrenador AS 'Entrenador', COUNT(*) AS 'Total' FROM pokemon GROUP BY nombre_entrenador ORDER BY COUNT(*) DESC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — ¿Qué tabla y qué tipo de consulta?",
                text: "La información está en la tabla <strong>pokemon</strong> (campo <code>nombre_entrenador</code>). La pregunta «cuántos por cada…» implica <strong>GROUP BY</strong>. Agrupa por <code>nombre_entrenador</code> y cuenta con <code>COUNT(*)</code>.",
                penalty: 0.1
              },
              {
                label: "Pista 2 — Estructura casi completa",
                text: "<code>SELECT nombre_entrenador, COUNT(*) FROM pokemon GROUP BY nombre_entrenador ORDER BY COUNT(*) DESC</code> — Solo faltan los alias para las columnas. Usa <code>AS 'nombre'</code>.",
                penalty: 0.15
              }
            ],
            scoring: { points: 2, errorPenalty: 0.25 }
          }
        ]
      },

      // ======================================================================
      // U1 — Examen
      // ======================================================================
      {
        id: "u1-examen",
        label: "U1 Básicas — Examen",
        mode: "exam",
        phaseScoring: { maxHintPenalty: 0.5 },
        exercises: [
          {
            id: "u1e1-combinada",
            mode: "exam",
            title: "Examen U1 — Filtros, orden y límite",
            prompt: "La Liga busca candidatos de élite: entrenadores con <strong>nivel 70 o superior</strong> que <strong>NO sean de Kanto</strong>. Muestra su nombre y nivel, ordenados de mayor a menor nivel.",
            expectedSql: "SELECT nombre, nivel FROM entrenadores WHERE nivel >= 70 AND region <> 'Kanto' ORDER BY nivel DESC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — Las dos condiciones",
                text: "«Nivel 70 o superior» → <code>nivel &gt;= 70</code>. «Que no sean de Kanto» → <code>region &lt;&gt; 'Kanto'</code>. Ambas deben cumplirse → <code>AND</code>.",
                penalty: 0.15
              },
              {
                label: "Pista 2 — Estructura completa",
                text: "<code>SELECT nombre, nivel FROM entrenadores WHERE nivel &gt;= 70 AND region &lt;&gt; 'Kanto' ORDER BY nivel DESC</code>",
                penalty: 0.25
              }
            ],
            scoring: { points: 3, errorPenalty: 0.25 }
          },
          {
            id: "e1-having-groupby",
            mode: "exam",
            title: "Examen U1 — GROUP BY con HAVING",
            prompt: "La Liga quiere saber cuántos Pokémon tiene cada entrenador, pero <strong>solo los que tienen más de un Pokémon</strong>. Muestra el nombre del entrenador y el total, ordenado de mayor a menor.",
            expectedSql: "SELECT nombre_entrenador AS 'Entrenador', COUNT(*) AS 'Total' FROM pokemon GROUP BY nombre_entrenador HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC",
            ordered: true,
            hints: [
              {
                label: "Pista 1 — ¿Qué tabla y qué tipo de consulta?",
                text: "Los datos están en <strong>pokemon</strong> (campo <code>nombre_entrenador</code>). «Cuántos por cada» → <strong>GROUP BY</strong>. Cuenta con <code>COUNT(*)</code>. El filtro «más de uno» va sobre el resultado de la agrupación (no sobre filas individuales).",
                penalty: 0.10
              },
              {
                label: "Pista 2 — WHERE no puede filtrar grupos",
                text: "<strong>WHERE</strong> filtra filas ANTES de agrupar, por eso no puede usar COUNT, AVG, etc. <strong>HAVING</strong> filtra grupos DESPUÉS de GROUP BY. Necesitas <code>HAVING COUNT(*) &gt; 1</code>.",
                penalty: 0.15
              },
              {
                label: "Pista 3 — Estructura completa",
                text: "<code>SELECT nombre_entrenador, COUNT(*) FROM pokemon GROUP BY nombre_entrenador HAVING COUNT(*) &gt; 1 ORDER BY COUNT(*) DESC</code> — Solo faltan los alias y el formato final.",
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
