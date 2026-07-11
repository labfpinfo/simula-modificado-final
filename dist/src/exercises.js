/**
 * exercises.js — ENSAMBLADOR de bancos de ejercicios.
 *
 * Los ejercicios ya NO se definen aquí: viven en archivos independientes
 * dentro de src/exercise-banks/ (uno por unidad temática). Cada banco se
 * registra en window.AppExerciseBanks y este archivo los ordena, valida
 * y expone la API pública window.AppExercises que consume el simulador.
 *
 * VENTAJA: para añadir/quitar ejercicios o unidades enteras solo se
 * tocan los bancos (y la lista de <script> en index.html si se añade un
 * banco nuevo). El núcleo del simulador no cambia.
 *
 * Orden de carga en index.html:
 *   1. src/exercise-banks/u1-consultas-basicas.js
 *   2. src/exercise-banks/u2-joins.js
 *   3. src/exercise-banks/u3-subconsultas.js
 *   4. src/exercises.js   ← este archivo (el ensamblador), SIEMPRE el último
 *
 * Exercise shape (igual que siempre):
 *   @property {string}  id           — identificador único GLOBAL
 *   @property {string}  mode         — "guided" | "semi-guided" | "exam"
 *   @property {string}  title        — título del ejercicio
 *   @property {string}  prompt       — enunciado (español, admite HTML)
 *   @property {string}  expectedSql  — consulta correcta en sintaxis SQLite
 *   @property {boolean} ordered      — el orden de filas importa (default true)
 *   @property {string}  [mysqlNote]  — aclaración de sintaxis MySQL (opcional)
 *   @property {Object}  [aids]       — ayudas de modo guiado (context/guide/solutionNote)
 *   @property {Array}   [hints]      — pistas con penalización (semi/exam)
 *   @property {Object}  scoring      — { points, errorPenalty }
 *
 * Expected SQL usa sintaxis SQLite (|| en vez de CONCAT, strftime('%Y',...)
 * en vez de YEAR()). El campo mysqlNote documenta la diferencia al alumno.
 */
(function () {
  "use strict";

  var banks = window.AppExerciseBanks || [];

  if (banks.length === 0) {
    // Los bancos no se han cargado (falta un <script> o se cargó este
    // archivo antes que ellos). Mensaje claro en vez de fallo silencioso.
    console.error(
      "exercises.js: no hay bancos registrados en window.AppExerciseBanks. " +
      "Comprueba que los <script> de src/exercise-banks/*.js van ANTES " +
      "que src/exercises.js en index.html.");
  }

  // Ordenar bancos por su campo `order` y aplanar sus fases.
  var sorted = banks.slice().sort(function (a, b) {
    return (a.order || 0) - (b.order || 0);
  });

  var phases = [];
  for (var i = 0; i < sorted.length; i++) {
    var bankPhases = sorted[i].phases || [];
    for (var j = 0; j < bankPhases.length; j++) {
      phases.push(bankPhases[j]);
    }
  }

  // Validación de integridad: ids de ejercicio duplicados rompen el
  // guardado de progreso y la corrección. Avisar alto y claro.
  var seen = {};
  for (var pi = 0; pi < phases.length; pi++) {
    var exs = phases[pi].exercises || [];
    for (var ei = 0; ei < exs.length; ei++) {
      var id = exs[ei].id;
      if (seen[id]) {
        console.error(
          "exercises.js: id de ejercicio DUPLICADO: '" + id + "' " +
          "(aparece en las fases '" + seen[id] + "' y '" + phases[pi].id + "'). " +
          "Cada ejercicio necesita un id único global.");
      }
      seen[id] = phases[pi].id;
    }
  }

  // ==========================================================================
  // Public API (idéntica a la versión anterior — el resto del simulador
  // no nota el cambio de arquitectura)
  // ==========================================================================

  var AppExercises = {
    /**
     * Ordered list of all phases with metadata.
     *
     * Each phase entry:
     *   @property {string} id           — phase identifier
     *   @property {string} label        — human-readable label (Spanish)
     *   @property {string} mode         — "guided" | "semi-guided" | "exam"
     *   @property {Array}  exercises    — exercise objects for this phase
     *   @property {Object} phaseScoring — scoring config for this phase
     */
    phases: phases,

    /**
     * Get the total number of exercises across all phases.
     * @returns {number}
     */
    totalExerciseCount: function () {
      var total = 0;
      for (var i = 0; i < this.phases.length; i++) {
        total += this.phases[i].exercises.length;
      }
      return total;
    },

    /**
     * Get a specific exercise by phase index and exercise index.
     * @param {number} phaseIndex
     * @param {number} exerciseIndex
     * @returns {Object|null}
     */
    getExercise: function (phaseIndex, exerciseIndex) {
      var phase = this.phases[phaseIndex];
      if (!phase) return null;
      return phase.exercises[exerciseIndex] || null;
    },

    /**
     * Calculate the maximum possible score across all exercises.
     * @returns {number}
     */
    maxScore: function () {
      var total = 0;
      for (var pi = 0; pi < this.phases.length; pi++) {
        var exs = this.phases[pi].exercises;
        for (var ei = 0; ei < exs.length; ei++) {
          total += (exs[ei].scoring && exs[ei].scoring.points) || 1;
        }
      }
      return total;
    }
  };

  // -----------------------------------------------------------------------
  // Export
  // -----------------------------------------------------------------------

  window.AppExercises = AppExercises;
})();
