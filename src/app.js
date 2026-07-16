/**
 * app.js
 *
 * Application bootstrap, routing, and UI state for the Database Exercise
 * Simulator.
 *
 * Load this AFTER sql-asm.js, sql-engine.js, result-compare.js,
 * exercises.js, and pokemon-seed.js (all expose globals: initSqlJs,
 * SqlEngine, ResultCompare, AppExercises, window.POKEMON_SEED).
 *
 * Compatible with file:// double-click opening — no ES modules, no fetch()
 * for seed loading under file://. The sql-asm.js build is used so the
 * SQLite engine is pure JavaScript (no WASM binary fetch required at
 * runtime), and the seed database is embedded in src/pokemon-seed.js as
 * a base64 Uint8Array on window.POKEMON_SEED so the same bootstrap works
 * under file:// and http(s):// with no XHR/fetch to data/pokemon.sqlite.
 */
(function () {
  "use strict";

  // ==========================================================================
  // Scoring constants (centralised — keep in sync with exercises.js defaults)
  // ==========================================================================

  var SCORE = {
    DEFAULT_ERROR_PENALTY: 0.25,
    DEFAULT_HINT_PENALTY: 0.1,
  };

  // Recognition is derived from completed learning blocks, never from volume
  // of clicks or repeated attempts. Hints remain outside every criterion.
  var REWARD_DEFINITIONS = [
    { id: "u1-basics", unitPrefix: "u1", avatarId: "flarin", title: "Flarín", description: "Compañero de consultas básicas" },
    { id: "u2-joins", unitPrefix: "u2", avatarId: "aquon", title: "Aquón", description: "Compañero de relaciones con JOIN" },
    { id: "u3-subqueries", unitPrefix: "u3", avatarId: "folix", title: "Folix", description: "Compañero de subconsultas" },
    { id: "recovery", avatarId: "voltis", title: "Voltis", description: "Compañero de volver a intentarlo" }
  ];

  var THEME_STORAGE_KEY = "simulador-consulta-theme";
  var THEMES = { classic: true, indigo: true, green: true, blue: true };

  // ==========================================================================
  // Companions (avatars)
  //
  // Original, offline creature avatars — one per elemental type in the
  // database's `tipo` table. They are original artwork (NOT Pokémon
  // characters, which are Nintendo's copyright) so the simulator can ship
  // them embedded and work under file://.
  //
  // To use your OWN images instead: set `img` to a file path
  // (e.g. img: "assets/companions/flarin.png") and it will be used in place
  // of the inline SVG. Drop the files next to index.html.
  // ==========================================================================

  /**
   * Build a cute, animal-like creature icon (rounded body, ears, paws,
   * blush cheeks) instead of a floating-symbol blob. `ears` and `tail`
   * are paths anchored to the body outline so the silhouette reads as a
   * small animal rather than a disembodied shape.
   */
  function _creatureSvg(body, belly, ears, tail, eyeDx) {
    eyeDx = eyeDx || 0;
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      tail +
      ears +
      // Body: rounded head-and-body silhouette
      '<path d="M14 42 Q13 20 32 19 Q51 20 50 42 Q50 55 32 56 Q14 55 14 42 Z" fill="' + body + '"/>' +
      // Belly patch
      '<ellipse cx="32" cy="45" rx="10.5" ry="9" fill="' + belly + '"/>' +
      // Paws
      '<ellipse cx="21" cy="54" rx="5.5" ry="4" fill="' + body + '"/>' +
      '<ellipse cx="43" cy="54" rx="5.5" ry="4" fill="' + body + '"/>' +
      // Eyes with highlight (looking slightly up — friendly, not vacant)
      '<circle cx="' + (24 + eyeDx) + '" cy="34" r="4" fill="#fff"/>' +
      '<circle cx="' + (25 + eyeDx) + '" cy="35.5" r="2.1" fill="#1E1A14"/>' +
      '<circle cx="' + (25.7 + eyeDx) + '" cy="34.6" r="0.7" fill="#fff"/>' +
      '<circle cx="' + (40 - eyeDx) + '" cy="34" r="4" fill="#fff"/>' +
      '<circle cx="' + (41 - eyeDx) + '" cy="35.5" r="2.1" fill="#1E1A14"/>' +
      '<circle cx="' + (41.7 - eyeDx) + '" cy="34.6" r="0.7" fill="#fff"/>' +
      // Blush cheeks — reads as "friendly creature", not alien
      '<ellipse cx="19" cy="40" rx="2.6" ry="1.7" fill="#FF9E8A" opacity="0.65"/>' +
      '<ellipse cx="45" cy="40" rx="2.6" ry="1.7" fill="#FF9E8A" opacity="0.65"/>' +
      // Small smiling mouth
      '<path d="M28 41.5 Q32 44.5 36 41.5" stroke="#1E1A14" fill="none" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg>';
  }

  var AVATARS = [
    { id: "flarin", name: "Flarín", type: "Fuego",
      img: "", svg: _creatureSvg("#E8622A", "#FCD7B5",
        '<path d="M18 21 Q15 10 22 14 Q22 20 20 24 Z" fill="#E8622A"/><path d="M46 21 Q49 10 42 14 Q42 20 44 24 Z" fill="#E8622A"/>',
        '<path d="M49 46 Q58 42 56 32 Q53 38 48 40 Q44 36 45 30 Q40 38 43 46 Q45 50 49 46 Z" fill="#FF7A00"/>') },
    { id: "aquon", name: "Aquón", type: "Agua",
      img: "", svg: _creatureSvg("#2E86C1", "#BEE3F8",
        '<path d="M17 24 Q10 18 14 10 Q20 14 20 22 Z" fill="#2E86C1"/><path d="M47 24 Q54 18 50 10 Q44 14 44 22 Z" fill="#2E86C1"/>',
        '<path d="M48 48 Q57 50 55 40 Q51 44 47 42 Q47 46 48 48 Z" fill="#5DADE2"/>') },
    { id: "folix", name: "Folix", type: "Planta",
      img: "", svg: _creatureSvg("#2E9E5B", "#C6F0D6",
        '<path d="M25 20 Q22 6 32 11 Q30 16 27 20 Z" fill="#3CB371"/><path d="M39 20 Q42 6 32 11 Q34 16 37 20 Z" fill="#3CB371"/>',
        '<path d="M46 48 Q54 44 51 36 Q47 40 44 40 Q43 44 46 48 Z" fill="#58D68D"/>') },
    { id: "voltis", name: "Voltis", type: "Eléctrico",
      img: "", svg: _creatureSvg("#E8C233", "#FCEFAF",
        '<path d="M20 22 L13 8 L22 12 L19 22 Z" fill="#D4A000"/><path d="M44 22 L51 8 L42 12 L45 22 Z" fill="#D4A000"/>',
        '<path d="M45 48 L54 44 L48 40 L52 34 L42 40 L46 44 Z" fill="#F4D03F"/>') },
    { id: "petrio", name: "Petrio", type: "Roca",
      img: "", svg: _creatureSvg("#9C7A50", "#E4D2AE",
        '<path d="M17 22 L11 12 L21 15 L21 22 Z" fill="#8D6E4A"/><path d="M47 22 L53 12 L43 15 L43 22 Z" fill="#8D6E4A"/>',
        '<path d="M45 49 L52 47 L49 41 L44 43 Z" fill="#A98B63"/>') },
    { id: "nivex", name: "Nivex", type: "Hielo",
      img: "", svg: _creatureSvg("#5DB4C4", "#DFF6FA",
        '<path d="M22 20 Q18 8 27 12 Q26 17 24 21 Z" fill="#4FA3B3"/><path d="M42 20 Q46 8 37 12 Q38 17 40 21 Z" fill="#4FA3B3"/>',
        '<path d="M46 47 Q54 47 53 39 Q49 41 47 40 Q45 43 46 47 Z" fill="#8FE3EE"/>', 0.6) }
  ];

  function _avatarById(id) {
    for (var i = 0; i < AVATARS.length; i++) { if (AVATARS[i].id === id) return AVATARS[i]; }
    return null;
  }

  // ==========================================================================
  // Greeting (status bar) — always shown in a language other than Spanish,
  // chosen at random per session so the status bar reads "Hello, <name>",
  // "Bonjour, <name>", etc.
  // ==========================================================================

  var GREETINGS = ["Hello", "Bonjour", "안녕하세요", "Ciao", "Hallo", "Olá"];

  function _pickGreeting() {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }

  // Confirmation messages acknowledge a completed action; learning feedback
  // remains visible until the learner explicitly changes context.
  var TRANSIENT_MESSAGE_DURATION_MS = 5000;
  var transientMessages = [];

  function _clearTransientMessages() {
    for (var i = 0; i < transientMessages.length; i++) {
      clearTimeout(transientMessages[i].timer);
    }
    transientMessages = [];
  }

  function _showTransientMessage(element, dismiss) {
    if (!element) return;
    for (var i = transientMessages.length - 1; i >= 0; i--) {
      if (transientMessages[i].element === element) {
        clearTimeout(transientMessages[i].timer);
        transientMessages.splice(i, 1);
      }
    }

    var entry = { element: element, timer: null };
    entry.timer = setTimeout(function () {
      var index = transientMessages.indexOf(entry);
      if (index === -1) return;
      transientMessages.splice(index, 1);
      if (dismiss) {
        dismiss();
      } else {
        element.style.display = "none";
        element.textContent = "";
      }
    }, TRANSIENT_MESSAGE_DURATION_MS);
    transientMessages.push(entry);
  }

  /**
   * An exercise's fair share of the total score — its own point value
   * (ex.scoring.points, as defined in exercises.js; default 1 if not set).
   * exercises.js gives different exercises different point values
   * (e.g. 1 pt for guided phase-1 exercises, 3 pt for exam exercises).
   * @param {Object} ex — the exercise object
   * @returns {number}
   */
  function _exerciseShare(ex) {
    if (ex && ex.scoring && typeof ex.scoring.points === "number" && isFinite(ex.scoring.points)) {
      return ex.scoring.points;
    }
    return 1;
  }

  /** Find the current exercise definition for an attempt-log id. */
  function _exerciseById(exerciseId) {
    for (var pi = 0; pi < AppExercises.phases.length; pi++) {
      var exercises = AppExercises.phases[pi].exercises;
      for (var ei = 0; ei < exercises.length; ei++) {
        if (exercises[ei].id === exerciseId) return exercises[ei];
      }
    }
    return null;
  }

  /**
   * Recalculate earned credit and recognition from the attempt log. An
   * exercise earns no credit until it is solved; its own recorded penalties
   * reduce only that exercise's credit. This also migrates legacy saves.
   */
  function _recalculateScore() {
    var total = 0;
    for (var i = 0; i < state.attemptLog.length; i++) {
      var entry = state.attemptLog[i];
      var ex = _exerciseById(entry.exerciseId);
      var penalties = typeof entry.scoreDelta === "number" ? Math.min(0, entry.scoreDelta) : 0;
      entry.earnedPoints = entry.solved && ex
        ? Math.max(0, _exerciseShare(ex) + penalties)
        : 0;
      total += entry.earnedPoints;
    }
    state.score = Math.min(state.maxScore, total);
    _recalculateRewards();
  }

  function _recalculateRewards() {
    var solvedById = {};
    var recovered = false;
    for (var i = 0; i < state.attemptLog.length; i++) {
      var entry = state.attemptLog[i];
      if (!entry.solved) continue;
      solvedById[entry.exerciseId] = true;
      if (entry.skipped === true || entry.attempts > 1) recovered = true;
    }

    var earned = [];
    for (var ri = 0; ri < REWARD_DEFINITIONS.length; ri++) {
      var reward = REWARD_DEFINITIONS[ri];
      if (reward.id === "recovery") {
        if (recovered) earned.push(reward.id);
        continue;
      }
      var hasExercises = false;
      var mastered = true;
      for (var pi = 0; pi < AppExercises.phases.length; pi++) {
        var phase = AppExercises.phases[pi];
        if (phase.id.indexOf(reward.unitPrefix + "-") !== 0) continue;
        for (var ei = 0; ei < phase.exercises.length; ei++) {
          hasExercises = true;
          if (!solvedById[phase.exercises[ei].id]) mastered = false;
        }
      }
      if (hasExercises && mastered) earned.push(reward.id);
    }
    state.rewards = earned;
  }

  function _rewardById(id) {
    for (var i = 0; i < REWARD_DEFINITIONS.length; i++) {
      if (REWARD_DEFINITIONS[i].id === id) return REWARD_DEFINITIONS[i];
    }
    return null;
  }

  function _rewardProgress(reward) {
    var solvedById = {};
    for (var i = 0; i < state.attemptLog.length; i++) {
      if (state.attemptLog[i].solved) solvedById[state.attemptLog[i].exerciseId] = true;
    }
    if (reward.id === "recovery") {
      return {
        earned: state.rewards.indexOf(reward.id) !== -1,
        criterion: "Resuelve un ejercicio después de un error o de haberlo saltado."
      };
    }
    var solved = 0;
    var total = 0;
    for (var pi = 0; pi < AppExercises.phases.length; pi++) {
      var phase = AppExercises.phases[pi];
      if (phase.id.indexOf(reward.unitPrefix + "-") !== 0) continue;
      for (var ei = 0; ei < phase.exercises.length; ei++) {
        total++;
        if (solvedById[phase.exercises[ei].id]) solved++;
      }
    }
    return {
      earned: total > 0 && solved === total,
      criterion: "Unidad completada: " + solved + " de " + total + " ejercicios resueltos."
    };
  }

  function _isExamMode(mode) {
    return mode === "exam";
  }

  function _applyTheme(theme) {
    var selected = THEMES[theme] ? theme : "classic";
    document.documentElement.setAttribute("data-theme", selected);
    if (dom.themeSelect) dom.themeSelect.value = selected;
    return selected;
  }

  function _restoreTheme() {
    var saved = "";
    try { saved = localStorage.getItem(THEME_STORAGE_KEY) || ""; } catch (_e) {}
    return _applyTheme(saved);
  }

  function handleThemeChange() {
    var selected = _applyTheme(dom.themeSelect && dom.themeSelect.value);
    try { localStorage.setItem(THEME_STORAGE_KEY, selected); } catch (_e) {}
    return selected;
  }

  /** Inner markup for an avatar's picture (image file if provided, else SVG). */
  function _avatarPicture(av) {
    if (!av) return "";
    if (av.img) {
      return '<img src="' + av.img + '" alt="">';
    }
    return av.svg;
  }

  // ==========================================================================
  // Application state
  // ==========================================================================

  var state = {
    /** @type {string} "start" | "exercises" | "complete" */
    view: "start",

    /** @type {string} Student name from start screen */
    studentName: "",

    /** @type {string} Randomly chosen non-Spanish greeting word for this session */
    greeting: "",

    /** @type {string} Selected companion avatar id */
    selectedAvatar: "",

    /** @type {number} Current phase index (0-based) */
    phaseIndex: 0,

    /** @type {number} Current exercise index within the phase (0-based) */
    exerciseIndex: 0,

    /** @type {number} Current total score (sum of earned exercise credit) */
    score: 0,

    /** @type {number} Maximum possible score (sum of all exercise points) */
    maxScore: 0,

    /** @type {Array} Log of all attempts across all exercises */
    attemptLog: [],

    /** @type {Array<string>} Recognition ids derived from meaningful mastery */
    rewards: [],

    /** @type {Object|null} Exercise-level state (for current exercise) */
    currentExerciseState: null,

    /** @type {string|null} Table currently selected in the schema modal */
    schemaSelectedTable: null,

    /**
     * @type {boolean} Side-menu collapsed/expanded preference. Persisted to
     * IndexedDB so the student's choice survives a reload. The menu is
     * expanded by default; on small screens the toggle is the primary way
     * to reveal/hide it.
     */
    menuCollapsed: false,
  };

  // ==========================================================================
  // DOM element cache (populated on bootstrap)
  // ==========================================================================

  var dom = {};

  // ==========================================================================
  // sql.js and seed bootstrapping
  // ==========================================================================

  /**
   * Check that all required browser APIs are available.
   * Returns null on success, or an error message string.
   */
  function preflightCheck() {
    if (typeof XMLHttpRequest === "undefined") {
      return "Tu navegador no soporta XMLHttpRequest, necesario para cargar los datos.";
    }
    if (typeof Promise === "undefined") {
      return "Tu navegador no soporta Promises, necesarias para la inicialización.";
    }
    if (typeof ArrayBuffer === "undefined" || typeof Uint8Array === "undefined") {
      return "Tu navegador no soporta ArrayBuffer/Uint8Array, necesarios para la base de datos.";
    }
    if (typeof initSqlJs !== "function") {
      return "No se encontró el motor SQL. Asegúrate de que sql-asm.js se cargó correctamente.";
    }
    if (typeof Blob === "undefined") {
      return "Tu navegador no soporta Blob, necesario para exportar el progreso.";
    }
    if (typeof URL === "undefined" || typeof URL.createObjectURL === "undefined") {
      return "Tu navegador no soporta URL.createObjectURL, necesario para exportar.";
    }
    if (typeof FileReader === "undefined") {
      return "Tu navegador no soporta FileReader, necesario para importar progreso.";
    }
    return null;
  }

  /**
   * Load the SQLite seed database.
   *
   * Strategy (R4-001 — file:// robustness):
   *   1. Prefer the embedded seed exposed by src/pokemon-seed.js on
   *      window.POKEMON_SEED. This is the production path and works
   *      under any protocol (file:// included) because it does not
   *      require any XHR/fetch.
   *   2. Fall back to an XHR for data/pokemon.sqlite. This is kept for
   *      environments where pokemon-seed.js was not loaded (test
   *      harness, stripped build, etc.) and is still useful when the
   *      seed is regenerated outside the normal build flow.
   *
   * Both paths resolve with a Uint8Array (the XHR path converts the
   * ArrayBuffer response into a Uint8Array for a uniform contract).
   *
   * @returns {Promise<Uint8Array>}
   */
  function loadSeed() {
    // 1. Embedded seed (production path) — works under file://.
    if (typeof window !== "undefined" &&
        window.POKEMON_SEED instanceof Uint8Array) {
      return Promise.resolve(window.POKEMON_SEED);
    }

    // 2. Fallback: XHR for data/pokemon.sqlite. Works under http(s)://;
    //    may be blocked under file:// in some browsers, but the
    //    embedded seed above is the production path so this is only
    //    reached when pokemon-seed.js is unavailable.
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "data/pokemon.sqlite", true);
      xhr.responseType = "arraybuffer";
      xhr.onload = function () {
        if (xhr.status === 200 || xhr.status === 0) {
          resolve(new Uint8Array(xhr.response));
        } else {
          reject(new Error("Failed to load seed database: HTTP " + xhr.status));
        }
      };
      xhr.onerror = function () {
        reject(new Error("Failed to load seed database. Ensure data/pokemon.sqlite exists."));
      };
      xhr.send();
    });
  }

  /**
   * Initialise SQL.js (asm build — no WASM binary required).
   *
   * The asm build compiles the SQLite engine to pure JavaScript so no
   * network fetch of a .wasm file is required. This means the same
   * call works under both file:// and http(s)://, with no protocol-
   * specific branches or fallbacks.
   */
  function initEngine() {
    return initSqlJs();
  }

  // ==========================================================================
  // Attempt-log helpers
  // ==========================================================================

  /**
   * Return the attemptLog entry for the current exercise, searching by id.
   * Falls back to the last entry if the current exercise's id is missing
   * (defensive — should not happen after renderPhaseExercise).
   * Returns null when attemptLog is empty.
   *
   * Why this exists: previous-exercise navigation means the entry for the
   * currently displayed exercise is not guaranteed to be the last one in
   * attemptLog. The old `attemptLog[length-1]` pattern would silently
   * mutate the wrong entry. Always look up by current exercise id.
   * @returns {Object|null}
   */
  function _getCurrentLogEntry() {
    if (state.attemptLog.length === 0) return null;
    var phase = AppExercises.phases[state.phaseIndex];
    var ex = phase ? phase.exercises[state.exerciseIndex] : null;
    if (!ex) return state.attemptLog[state.attemptLog.length - 1];
    for (var i = state.attemptLog.length - 1; i >= 0; i--) {
      if (state.attemptLog[i].exerciseId === ex.id) return state.attemptLog[i];
    }
    return state.attemptLog[state.attemptLog.length - 1];
  }

  /**
   * Update the prev/next button enabled state for the current position.
   * btn-prev is visible during exercise rendering (so users can discover
   * the back action) and only disabled on the very first exercise;
   * btn-next is hidden until the current exercise is solved.
   *
   * Visibility contract: this function MUST set btnPrev.style.display to
   * a non-"none" value, otherwise the CSS default `display: none` keeps
   * the button permanently hidden and users cannot navigate back.
   */
  function updateNavButtons() {
    if (!dom.btnPrev) return;
    var isFirst = (state.phaseIndex === 0 && state.exerciseIndex === 0);
    dom.btnPrev.style.display = "inline-block";
    dom.btnPrev.disabled = isFirst;
    dom.btnPrev.setAttribute("aria-disabled", isFirst ? "true" : "false");
  }

  // ==========================================================================
  // View rendering
  // ==========================================================================

  function showStartView() {
    _clearTransientMessages();
    dom.startScreen.style.display = "flex";
    dom.exerciseArea.style.display = "none";
    dom.completeScreen.style.display = "none";
    dom.statusBar.style.display = "none";
  }

  function showExerciseView() {
    _clearTransientMessages();
    _dismissRewardUnlock();
    dom.startScreen.style.display = "none";
    dom.exerciseArea.style.display = "block";
    dom.completeScreen.style.display = "none";
    dom.statusBar.style.display = "flex";
    renderPhaseExercise();
  }

  /**
   * Show the exercise view from a restored state — same DOM rendering as
   * showExerciseView/rendrePhaseExercise but does NOT create fresh
   * attemptLog entries or reset per-exercise state (already in place).
   */
  function showExerciseViewRestored() {
    _clearTransientMessages();
    _dismissRewardUnlock();
    dom.startScreen.style.display = "none";
    dom.exerciseArea.style.display = "block";
    dom.completeScreen.style.display = "none";
    dom.statusBar.style.display = "flex";
    renderPhaseExerciseRestored();
  }

  function showCompleteView() {
    _clearTransientMessages();
    _dismissRewardUnlock();
    dom.startScreen.style.display = "none";
    dom.exerciseArea.style.display = "none";
    dom.completeScreen.style.display = "block";
    dom.statusBar.style.display = "flex";
    renderComplete();
  }

  /**
   * Render the student identity (companion avatar + name) in the status bar.
   * The name is set via textContent (student input — never innerHTML); the
   * avatar markup is app-authored and safe to inject.
   */
  function renderIdentity() {
    if (!dom.statusIdentity) return;
    dom.statusIdentity.textContent = "";
    if (!state.studentName) return;

    var av = _avatarById(state.selectedAvatar);
    if (av) {
      var avatarWrap = document.createElement("span");
      avatarWrap.className = "status-avatar";
      avatarWrap.innerHTML = _avatarPicture(av);
      avatarWrap.title = av.name;
      dom.statusIdentity.appendChild(avatarWrap);
    }
    var nameEl = document.createElement("span");
    nameEl.className = "status-name";
    var greeting = state.greeting || "Hello";
    nameEl.textContent = greeting + ", " + state.studentName;
    dom.statusIdentity.appendChild(nameEl);
  }

  /**
   * Populate the start-screen companion picker. Clicking an option selects
   * it (radiogroup semantics). Safe to call more than once.
   */
  function renderAvatarPicker() {
    if (!dom.avatarGrid) return;
    dom.avatarGrid.textContent = "";

    AVATARS.forEach(function (av) {
      var opt = document.createElement("button");
      opt.type = "button";
      opt.className = "avatar-option";
      opt.setAttribute("role", "radio");
      opt.setAttribute("data-avatar-id", av.id);
      var checked = state.selectedAvatar === av.id;
      opt.setAttribute("aria-checked", checked ? "true" : "false");
      opt.setAttribute("aria-label", av.name + " — tipo " + av.type);

      var pic = document.createElement("span");
      pic.className = "avatar-img";
      pic.innerHTML = _avatarPicture(av);
      opt.appendChild(pic);

      var nm = document.createElement("span");
      nm.className = "avatar-name";
      nm.textContent = av.name;
      opt.appendChild(nm);

      opt.addEventListener("click", function () { selectAvatar(av.id); });
      dom.avatarGrid.appendChild(opt);
    });
  }

  /** Mark one companion as selected and update the picker's checked state. */
  function selectAvatar(id) {
    state.selectedAvatar = id;
    if (!dom.avatarGrid) return;
    var opts = dom.avatarGrid.querySelectorAll(".avatar-option");
    for (var i = 0; i < opts.length; i++) {
      var isSel = opts[i].getAttribute("data-avatar-id") === id;
      opts[i].setAttribute("aria-checked", isSel ? "true" : "false");
    }
  }

  function renderStatusBar() {
    renderIdentity();
    var phase = AppExercises.phases[state.phaseIndex];
    var exIdx = state.exerciseIndex + 1;
    var exTotal = phase.exercises.length;
    var totalEx = AppExercises.totalExerciseCount();

    dom.statusPhase.textContent = phase.label;
    dom.statusStep.textContent = "Ejercicio " + exIdx + " de " + exTotal;
    dom.statusScore.textContent = state.score.toFixed(2) + " / " + state.maxScore.toFixed(2);

    // Progress bar: count completed exercises across all previous phases + current
    var completed = 0;
    for (var pi = 0; pi < state.phaseIndex; pi++) {
      completed += AppExercises.phases[pi].exercises.length;
    }
    completed += state.exerciseIndex;
    var pct = totalEx > 0 ? Math.round((completed / totalEx) * 100) : 0;
    dom.progressFill.style.width = pct + "%";
    if (dom.progressTrack) {
      dom.progressTrack.setAttribute("aria-valuenow", String(pct));
      dom.progressTrack.setAttribute("aria-valuetext",
        "Ejercicio " + exIdx + " de " + exTotal + " — " + pct + "%");
    }
    renderRewards();
  }

  function renderRewards() {
    if (!dom.rewardsSummary || !dom.rewardsList) return;
    var rewards = state.rewards || [];
    dom.rewardsList.textContent = "";
    dom.rewardsSummary.textContent = rewards.length === 0
      ? "Los compañeros se desbloquean con dominio real, no por llegar a una unidad. Las pistas no los bloquean."
      : rewards.length + " compañero" + (rewards.length === 1 ? " desbloqueado." : "s desbloqueados.");

    for (var i = 0; i < REWARD_DEFINITIONS.length; i++) {
      var reward = REWARD_DEFINITIONS[i];
      var progress = _rewardProgress(reward);
      var avatar = _avatarById(reward.avatarId);
      var item = document.createElement("li");
      item.className = "reward-item " + (progress.earned ? "earned" : "locked");
      item.setAttribute("data-reward-id", reward.id);
      var picture = document.createElement("span");
      picture.className = "reward-picture";
      picture.setAttribute("aria-hidden", "true");
      picture.innerHTML = _avatarPicture(avatar);
      var title = document.createElement("strong");
      title.textContent = reward.title;
      var description = document.createElement("span");
      description.className = "reward-description";
      description.textContent = progress.earned ? reward.description : "Bloqueado";
      var criterion = document.createElement("span");
      criterion.className = "reward-criterion";
      criterion.textContent = progress.criterion;
      item.appendChild(picture);
      item.appendChild(title);
      item.appendChild(description);
      item.appendChild(criterion);
      dom.rewardsList.appendChild(item);
    }
  }

  function _dismissRewardUnlock() {
    if (!dom.rewardUnlock) return;
    dom.rewardUnlock.style.display = "none";
    dom.rewardUnlock.textContent = "";
    dom.rewardUnlock.setAttribute("aria-hidden", "true");
  }

  function _showRewardUnlock(rewardIds) {
    if (!dom.rewardUnlock || !rewardIds || rewardIds.length === 0) return;
    dom.rewardUnlock.textContent = "";
    dom.rewardUnlock.style.display = "flex";
    dom.rewardUnlock.setAttribute("aria-hidden", "false");
    var message = document.createElement("span");
    message.className = "reward-unlock-message";
    message.textContent = rewardIds.length === 1
      ? "Nuevo compañero desbloqueado"
      : rewardIds.length + " nuevos compañeros desbloqueados";
    dom.rewardUnlock.appendChild(message);
    for (var i = 0; i < rewardIds.length; i++) {
      var reward = _rewardById(rewardIds[i]);
      if (!reward) continue;
      var avatar = _avatarById(reward.avatarId);
      var companion = document.createElement("span");
      companion.className = "reward-unlock-companion";
      companion.setAttribute("aria-label", reward.title);
      companion.innerHTML = _avatarPicture(avatar);
      dom.rewardUnlock.appendChild(companion);
    }
    var close = document.createElement("button");
    close.type = "button";
    close.className = "reward-unlock-close";
    close.textContent = "Cerrar";
    close.addEventListener("click", function () { _dismissRewardUnlock(); });
    dom.rewardUnlock.appendChild(close);
    _showTransientMessage(dom.rewardUnlock, _dismissRewardUnlock);
  }

  // ==========================================================================
  // Expected-SQL box helpers (no-reveal contract)
  //
  // _hideExpectedSqlBox() wipes the WHOLE container (not just the inner
  // <code>) so no answer text survives anywhere in the DOM after a skip.
  // That destroys the label/<code> children, so _showExpectedSqlBox()
  // rebuilds them on demand before writing the reference SQL.
  // ==========================================================================

  var _expectedSqlBoxCleared = false;

  function _hideExpectedSqlBox() {
    dom.expectedSqlDisplay.style.display = "none";
    if (dom.expectedSqlText) dom.expectedSqlText.textContent = "";
    dom.expectedSqlDisplay.textContent = "";
    dom.expectedSqlDisplay.innerHTML = "";
    _expectedSqlBoxCleared = true;
  }

  function _showExpectedSqlBox(sql) {
    if (_expectedSqlBoxCleared || !dom.expectedSqlText) {
      var label = document.createElement("span");
      label.className = "label";
      label.textContent = "Solución de referencia (SQLite)";
      var code = document.createElement("code");
      code.className = "sql-text";
      code.setAttribute("id", "expected-sql-text");
      dom.expectedSqlDisplay.appendChild(label);
      dom.expectedSqlDisplay.appendChild(code);
      dom.expectedSqlText = code;
      _expectedSqlBoxCleared = false;
    }
    dom.expectedSqlText.textContent = sql;
    dom.expectedSqlDisplay.style.display = "block";
  }

  function renderPhaseExercise() {
    _clearTransientMessages();
    var phase = AppExercises.phases[state.phaseIndex];
    var ex = phase.exercises[state.exerciseIndex];
    if (!ex) return;

    renderStatusBar();
    renderExercise(ex, phase.mode);
    updateNavButtons();
    renderMenu();

    // If an attemptLog entry already exists for this exercise (e.g. user
    // navigated back via handlePrevious and then forward again), reuse it
    // so hints/attempts/solved state is preserved and we don't duplicate
    // the log entry. Otherwise create a fresh entry.
    var existing = null;
    for (var i = state.attemptLog.length - 1; i >= 0; i--) {
      if (state.attemptLog[i].exerciseId === ex.id) { existing = state.attemptLog[i]; break; }
    }
    if (existing) {
      // Reconstruct transient state from the existing entry
      var count = existing.hintsUsed || 0;
      var hintsArr = [];
      for (var hi = 0; hi < count; hi++) hintsArr.push(hi);
      state.currentExerciseState = {
        attempts: existing.attempts || 0,
        hintsUsed: hintsArr,
        solved: !!existing.solved,
        // Skipped state from the existing entry: a skipped exercise must
        // remain navigable from the menu, but the reference solution is
        // never shown for a skipped entry.
        skipped: existing.skipped === true,
        lastSql: null,
      };
    } else {
      // Reset per-exercise state
      state.currentExerciseState = {
        attempts: 0,
        hintsUsed: [],
        solved: false,
        skipped: false,
        /** @type {string|null} — the student's last submitted SQL */
        lastSql: null,
      };

      // Create attemptLog entry at exercise start so hint/submit/skip paths
      // always have a valid entry to mutate (prevents accessing [-1] on empty).
      state.attemptLog.push({
        exerciseId: ex.id,
        title: ex.title,
        attempts: 0,
        hintsUsed: 0,
        solved: false,
        skipped: false,
        scoreDelta: 0,
        earnedPoints: 0,
      });
    }

    // Show exercise, hide feedback
    dom.exerciseEnunciado.textContent = "";
    // Prompt may contain <strong> and <br> tags (authored, not user input)
    dom.exerciseEnunciado.innerHTML = ex.prompt;
    // Nota de sintaxis MySQL (opcional): el simulador ejecuta SQLite,
    // pero la clase trabaja con MySQL — cuando la sintaxis difiere, el
    // ejercicio lo aclara aquí para que el alumno repase AMBAS formas.
    if (dom.mysqlNoteBox && dom.mysqlNoteText) {
      if (!_isExamMode(phase.mode) && ex.mysqlNote) {
        dom.mysqlNoteText.innerHTML = ex.mysqlNote;
        dom.mysqlNoteBox.style.display = "block";
      } else {
        dom.mysqlNoteText.innerHTML = "";
        dom.mysqlNoteBox.style.display = "none";
      }
    }
    // Guided mode shows the reference solution from the start as a worked
    // example — the phase is guided precisely so the student can study the
    // correct query. Semi-guided and exam modes never show it here.
    // Guided mode shows the reference from the start — EXCEPT when the
    // exercise was skipped: skip = "never reveal", in every mode.
    var showExpected = (phase.mode === "guided") &&
      !(state.currentExerciseState && state.currentExerciseState.skipped);
    if (showExpected) {
      _showExpectedSqlBox(ex.expectedSql);
    } else {
      _hideExpectedSqlBox();
    }

    if (state.currentExerciseState.solved) {
      dom.feedbackOk.style.display = "block";
      dom.feedbackOk.classList.remove("feedback-skipped");
      dom.feedbackOkContent.textContent = "✓ ¡Correcto! La consulta produjo los resultados esperados.";
      dom.feedbackOkSql.style.display = _isExamMode(phase.mode) ? "none" : "";
      dom.feedbackOkSql.textContent = _isExamMode(phase.mode) ? "" : ex.expectedSql;
      dom.feedbackErr.style.display = "none";
      dom.resultDisplay.style.display = "none";
      dom.queryInput.value = "";
      dom.queryInput.disabled = true;
      dom.btnSubmit.disabled = true;
      dom.btnSkip.style.display = "none";
      dom.btnNext.style.display = "inline-block";
    } else if (state.currentExerciseState.skipped) {
      // Skipped-not-yet-solved: the reference solution is hidden, the
      // input is enabled so the student can attempt again. No skip
      // button — it's already skipped (skipping twice is meaningless).
      // "Siguiente" stays visible so the student can advance
      // sequentially without seeing the solution — matches the
      // immediate post-skip contract in handleSkip() and the restored
      // branch in renderPhaseExerciseRestored() (RELIABILITY-001).
      dom.feedbackOk.style.display = "block";
      dom.feedbackOk.classList.add("feedback-skipped");
      dom.feedbackOkContent.textContent =
        "Saltaste este ejercicio. Puedes volver a intentarlo desde este mismo lugar — la solución no se mostrará.";
      dom.feedbackOkSql.style.display = "none";
      dom.feedbackOkSql.textContent = "";
      dom.feedbackErr.style.display = "none";
      dom.resultDisplay.style.display = "none";
      dom.queryInput.value = state.currentExerciseState.lastSql || "";
      dom.queryInput.disabled = false;
      dom.btnSubmit.disabled = false;
      dom.btnSkip.style.display = "none";
      dom.btnNext.style.display = "inline-block";
    } else {
      dom.feedbackOk.style.display = "none";
      dom.feedbackOk.classList.remove("feedback-skipped");
      dom.feedbackOkSql.style.display = "";
      dom.feedbackErr.style.display = "none";
      dom.resultDisplay.style.display = "none";
      dom.queryInput.value = "";
      dom.queryInput.disabled = false;
      dom.queryInput.focus();
      dom.btnSubmit.disabled = false;
      dom.btnSkip.style.display = "inline-block";
      dom.btnNext.style.display = "none";
    }

    // Aids (guided)
    if (ex.aids && !_isExamMode(phase.mode)) {
      dom.aidsContext.innerHTML = (ex.aids.context || "");
      dom.aidsGuide.innerHTML = (ex.aids.guide || "");
      dom.aidsContextBox.style.display = "none";
      dom.aidsGuideBox.style.display = "none";
      dom.togContext.classList.remove("active");
      dom.togGuide.classList.remove("active");
      dom.aidsRow.style.display = "flex";

      // Solution note — shown by default in guided mode
      if (ex.aids.solutionNote) {
        dom.solutionNoteText.textContent = "";
        dom.solutionNoteText.innerHTML = ex.aids.solutionNote;
        dom.solutionNote.style.display = "block";
      } else {
        dom.solutionNote.style.display = "none";
      }
    } else {
      dom.aidsRow.style.display = "none";
      dom.aidsContextBox.style.display = "none";
      dom.aidsGuideBox.style.display = "none";
      dom.solutionNote.style.display = "none";
    }

    // Hints (semi-guided / exam)
    if (!_isExamMode(phase.mode) && ex.hints && ex.hints.length > 0) {
      dom.hintsWrap.style.display = "flex";
      dom.hintsWrap.innerHTML = "";
      for (var i = 0; i < ex.hints.length; i++) {
        var hint = ex.hints[i];
        var btn = document.createElement("button");
        btn.className = "hint-btn";
        btn.textContent = hint.label;
        btn.setAttribute("data-hint-index", i);
        btn.onclick = function () {
          var idx = parseInt(this.getAttribute("data-hint-index"), 10);
          revealHint(idx);
        };

        var cost = document.createElement("span");
        cost.className = "hint-cost";
        cost.textContent = "-" + (hint.penalty || 0.1).toFixed(2);
        btn.appendChild(cost);

        var text = document.createElement("div");
        text.className = "hint-text";
        text.id = "hint-text-" + i;
        text.innerHTML = hint.text;

        dom.hintsWrap.appendChild(btn);
        dom.hintsWrap.appendChild(text);
      }
    } else {
      dom.hintsWrap.style.display = "none";
    }
  }

  /**
   * Render the current exercise from a restored state.
   * Same DOM setup as renderPhaseExercise, but does NOT create fresh
   * attemptLog entries or reset currentExerciseState.  Reconstructs the
   * transient per-exercise state from the last attemptLog entry if needed.
   */
  function renderPhaseExerciseRestored() {
    _clearTransientMessages();
    var phase = AppExercises.phases[state.phaseIndex];
    var ex = phase.exercises[state.exerciseIndex];
    if (!ex) return;

    // Reconstruct currentExerciseState from the entry that matches the
    // current exercise id. We can't rely on the last entry because after
    // a previous-navigation the current exercise's entry is no longer
    // guaranteed to be at the end of attemptLog.
    var matchingLog = null;
    for (var li = state.attemptLog.length - 1; li >= 0; li--) {
      if (state.attemptLog[li].exerciseId === ex.id) {
        matchingLog = state.attemptLog[li];
        break;
      }
    }
    var lastLog = state.attemptLog.length > 0
      ? state.attemptLog[state.attemptLog.length - 1] : null;
    var refLog = matchingLog || (lastLog && lastLog.exerciseId === ex.id ? lastLog : null);

    if (refLog) {
      // We are continuing an exercise with saved state — recover transient
      // state. hintsUsed array: we only know the COUNT from refLog.hintsUsed,
      // so we fill with [0, 1, ..., count-1] as a best-effort restoration.
      var count = refLog.hintsUsed || 0;
      var hintsArr = [];
      for (var hi = 0; hi < count; hi++) hintsArr.push(hi);

      state.currentExerciseState = {
        attempts: refLog.attempts || 0,
        hintsUsed: hintsArr,
        solved: !!refLog.solved,
        // Skipped state — must round-trip through restore so a student
        // who skipped an exercise, reloaded, and landed back on it via
        // "Continuar" still sees the skipped feedback (and crucially
        // does NOT see the reference solution).
        skipped: refLog.skipped === true,
        lastSql: null,
      };
    } else {
      // No matching entry — fresh state for safety
      state.currentExerciseState = {
        attempts: 0,
        hintsUsed: [],
        solved: false,
        skipped: false,
        lastSql: null,
      };
    }

    renderStatusBar();
    renderExercise(ex, phase.mode);
    updateNavButtons();
    renderMenu();

    // Show exercise
    dom.exerciseEnunciado.textContent = "";
    dom.exerciseEnunciado.innerHTML = ex.prompt;
    // Nota de sintaxis MySQL (opcional): el simulador ejecuta SQLite,
    // pero la clase trabaja con MySQL — cuando la sintaxis difiere, el
    // ejercicio lo aclara aquí para que el alumno repase AMBAS formas.
    if (dom.mysqlNoteBox && dom.mysqlNoteText) {
      if (!_isExamMode(phase.mode) && ex.mysqlNote) {
        dom.mysqlNoteText.innerHTML = ex.mysqlNote;
        dom.mysqlNoteBox.style.display = "block";
      } else {
        dom.mysqlNoteText.innerHTML = "";
        dom.mysqlNoteBox.style.display = "none";
      }
    }
    // Same as renderPhaseExercise: guided mode shows the reference from
    // the start; semi-guided and exam modes never show it here.
    // Guided mode shows the reference from the start — EXCEPT when the
    // exercise was skipped: skip = "never reveal", in every mode.
    var showExpected = (phase.mode === "guided") &&
      !(state.currentExerciseState && state.currentExerciseState.skipped);
    if (showExpected) {
      _showExpectedSqlBox(ex.expectedSql);
    } else {
      _hideExpectedSqlBox();
    }

    if (state.currentExerciseState.solved) {
      dom.feedbackOk.style.display = "block";
      dom.feedbackOk.classList.remove("feedback-skipped");
      dom.feedbackOkContent.textContent = "✓ ¡Correcto! La consulta produjo los resultados esperados.";
      dom.feedbackOkSql.style.display = _isExamMode(phase.mode) ? "none" : "";
      dom.feedbackOkSql.textContent = _isExamMode(phase.mode) ? "" : ex.expectedSql;
      dom.feedbackErr.style.display = "none";
      dom.resultDisplay.style.display = "none";
      dom.queryInput.value = "";
      dom.queryInput.disabled = true;
      dom.btnSubmit.disabled = true;
      dom.btnSkip.style.display = "none";
      dom.btnNext.style.display = "inline-block";
    } else if (state.currentExerciseState.skipped) {
      // Skipped-not-yet-solved after a reload / "Continuar": keep the
      // contract from handleSkip() — the student must NOT see the
      // reference solution, but "Siguiente" stays visible so they can
      // keep advancing sequentially. Hiding btnNext here would break
      // sequential progress after a restore (RELIABILITY-001).
      dom.feedbackOk.style.display = "block";
      dom.feedbackOk.classList.add("feedback-skipped");
      dom.feedbackOkContent.textContent =
        "Saltaste este ejercicio. Puedes volver a intentarlo desde este mismo lugar — la solución no se mostrará.";
      dom.feedbackOkSql.style.display = "none";
      dom.feedbackOkSql.textContent = "";
      dom.feedbackErr.style.display = "none";
      dom.resultDisplay.style.display = "none";
      dom.queryInput.value = state.currentExerciseState.lastSql || "";
      dom.queryInput.disabled = false;
      dom.btnSubmit.disabled = false;
      dom.btnSkip.style.display = "none";
      dom.btnNext.style.display = "inline-block";
    } else {
      dom.feedbackOk.style.display = "none";
      dom.feedbackOk.classList.remove("feedback-skipped");
      dom.feedbackOkSql.style.display = "";
      dom.feedbackErr.style.display = "none";
      dom.resultDisplay.style.display = "none";
      dom.queryInput.value = "";
      dom.queryInput.disabled = false;
      dom.queryInput.focus();
      dom.btnSubmit.disabled = false;
      dom.btnSkip.style.display = "inline-block";
      dom.btnNext.style.display = "none";
    }

    // Aids (guided)
    if (ex.aids && !_isExamMode(phase.mode)) {
      dom.aidsContext.innerHTML = (ex.aids.context || "");
      dom.aidsGuide.innerHTML = (ex.aids.guide || "");
      dom.aidsContextBox.style.display = "none";
      dom.aidsGuideBox.style.display = "none";
      dom.togContext.classList.remove("active");
      dom.togGuide.classList.remove("active");
      dom.aidsRow.style.display = "flex";

      if (ex.aids.solutionNote) {
        dom.solutionNoteText.textContent = "";
        dom.solutionNoteText.innerHTML = ex.aids.solutionNote;
        dom.solutionNote.style.display = "block";
      } else {
        dom.solutionNote.style.display = "none";
      }
    } else {
      dom.aidsRow.style.display = "none";
      dom.aidsContextBox.style.display = "none";
      dom.aidsGuideBox.style.display = "none";
      dom.solutionNote.style.display = "none";
    }

    // Hints — restore used hints to "used" state
    if (!_isExamMode(phase.mode) && ex.hints && ex.hints.length > 0) {
      dom.hintsWrap.style.display = "flex";
      dom.hintsWrap.innerHTML = "";
      var usedHintIndices = state.currentExerciseState.hintsUsed;
      for (var i = 0; i < ex.hints.length; i++) {
        var hint = ex.hints[i];
        var wasUsed = usedHintIndices.indexOf(i) !== -1;

        var btn = document.createElement("button");
        btn.className = "hint-btn" + (wasUsed ? " used" : "");
        btn.textContent = hint.label;
        btn.setAttribute("data-hint-index", i);
        if (!wasUsed) {
          btn.onclick = function () {
            var idx = parseInt(this.getAttribute("data-hint-index"), 10);
            revealHint(idx);
          };
        }

        var cost = document.createElement("span");
        cost.className = "hint-cost";
        cost.textContent = "-" + (hint.penalty || 0.1).toFixed(2);
        btn.appendChild(cost);

        var text = document.createElement("div");
        text.className = "hint-text" + (wasUsed ? " visible" : "");
        text.id = "hint-text-" + i;
        text.innerHTML = hint.text;

        dom.hintsWrap.appendChild(btn);
        dom.hintsWrap.appendChild(text);
      }
    } else {
      dom.hintsWrap.style.display = "none";
    }
  }

  function renderExercise(ex, mode) {
    // Mode-specific tweaks
    dom.exerciseCard.className = "now-card";
    if (mode === "exam") {
      dom.exerciseCard.classList.add("exam-mode");
    }
    dom.modeBadge.textContent = mode === "guided" ? "Guiado"
      : mode === "semi-guided" ? "Semi-guiado" : "Modo Examen";
    dom.modeBadge.className = "badge";
    if (mode === "guided") dom.modeBadge.classList.add("badge-guided");
    else if (mode === "semi-guided") dom.modeBadge.classList.add("badge-semi");
    else dom.modeBadge.classList.add("badge-exam");

    dom.exerciseTitle.textContent = ex.title;
  }

  function renderComplete() {
    renderStatusBar();
    // Force progress bar to 100% — all exercises are done.
    // Must come after renderStatusBar() which recalculates from indices (8/9).
    dom.progressFill.style.width = "100%";
    if (dom.finalStudent) {
      dom.finalStudent.textContent = state.studentName ? "Alumno/a: " + state.studentName : "";
    }
    dom.finalScore.textContent = state.score.toFixed(2) + " / " + state.maxScore.toFixed(2);
    var pct = state.maxScore > 0 ? Math.round((state.score / state.maxScore) * 100) : 0;
    dom.finalPct.textContent = pct + "%";

    if (dom.finalMotivation) {
      var motivation;
      if (pct >= 90) motivation = "¡Resultado excelente! Dominas las consultas SQL. 🎉";
      else if (pct >= 70) motivation = "¡Muy buen trabajo! Vas por muy buen camino. 💪";
      else if (pct >= 50) motivation = "¡Bien hecho! Con un poco más de práctica lo bordarás. 🙂";
      else motivation = "¡Enhorabuena por terminar! Cada intento suma — sigue practicando. 🌱";
      dom.finalMotivation.textContent = motivation;
    }

    // Build attempt summary using safe DOM nodes
    dom.finalDetail.textContent = "";
    var summaryTitle = document.createElement("strong");
    summaryTitle.textContent = "Resumen de intentos:";
    dom.finalDetail.appendChild(summaryTitle);
    dom.finalDetail.appendChild(document.createElement("br"));
    dom.finalDetail.appendChild(document.createElement("br"));

    for (var i = 0; i < state.attemptLog.length; i++) {
      var a = state.attemptLog[i];
      var line = document.createElement("span");
      var marker = a.solved ? "✓ " : "✗ ";
      var text = marker + a.title + " — " + a.attempts + " intento(s)";
      if (a.hintsUsed > 0) text += " (" + a.hintsUsed + " pistas)";
      if (a.scoreDelta < 0) text += " " + a.scoreDelta.toFixed(2) + " pt";
      line.textContent = text;
      if (a.scoreDelta < 0) {
        var scSpan = document.createElement("span");
        scSpan.style.color = "#E5002B";
        scSpan.textContent = " " + a.scoreDelta.toFixed(2) + " pt";
        // Re-append the red part separately
        line.textContent = marker + a.title + " — " + a.attempts + " intento(s)" +
          (a.hintsUsed > 0 ? " (" + a.hintsUsed + " pistas)" : "");
        line.appendChild(scSpan);
      }
      dom.finalDetail.appendChild(line);
      dom.finalDetail.appendChild(document.createElement("br"));
    }
  }

  function renderFeedback(matched, result, exSql, message, studentResult) {
    _clearTransientMessages();
    dom.feedbackOk.style.display = "none";
    dom.feedbackErr.style.display = "none";
    dom.resultDisplay.style.display = "none";
    // Reset the feedback-ok styling so a fresh submit (after skip or
    // after a wrong answer) doesn't keep the "skipped" orange variant.
    dom.feedbackOk.classList.remove("feedback-skipped");
    var phase = AppExercises.phases[state.phaseIndex];
    var isExam = phase && _isExamMode(phase.mode);
    dom.feedbackOkSql.style.display = isExam ? "none" : "";
    dom.feedbackOkSql.textContent = "";
    dom.queryInput.disabled = true;
    dom.btnSubmit.disabled = true;
    dom.btnSkip.style.display = "none";

    if (matched) {
      dom.feedbackOk.style.display = "block";
      dom.feedbackOkContent.textContent = "✓ ¡Correcto! La consulta produjo los resultados esperados.";
      dom.feedbackOkSql.textContent = isExam ? "" : exSql;
      dom.btnNext.style.display = "inline-block";
      state.currentExerciseState.solved = true;
      _showTransientMessage(dom.feedbackOk, function () {
        dom.feedbackOk.style.display = "none";
        dom.feedbackOkContent.textContent = "";
        dom.feedbackOkSql.textContent = "";
        dom.feedbackOkSql.style.display = "none";
      });
    } else {
      dom.feedbackErr.style.display = "block";
      var errMsg = result && result.error
        ? "Error SQL: " + result.error
        : "✗ La consulta no coincide con el resultado esperado.";
      dom.feedbackErrContent.textContent = errMsg;
      if (message) {
        dom.feedbackErrDetail.textContent = message;
      } else {
        dom.feedbackErrDetail.textContent = "Revisa las columnas, los valores y el orden. " +
          "Recuerda usar sintaxis SQLite: || en lugar de CONCAT, strftime() en lugar de YEAR().";
      }
      // Re-enable input for retry if not solved
      dom.queryInput.disabled = false;
      dom.btnSubmit.disabled = false;
      dom.btnSkip.style.display = "inline-block";
    }

    // Render the student's actual result set when available (valid SQL, no error)
    if (studentResult && !studentResult.error && studentResult.columns) {
      renderResultTable(studentResult);
    }
  }

  /**
   * Render a student's actual result set as a safe DOM table.
   * @param {{columns: string[], rows: any[][]}} studentResult
   */
  function renderResultTable(studentResult) {
    dom.resultDisplay.style.display = "block";
    dom.resultContent.textContent = "";

    if (!studentResult.columns || studentResult.columns.length === 0) {
      var emptyMsg = document.createElement("span");
      emptyMsg.className = "empty-result";
      emptyMsg.textContent = "(La consulta no devolvió columnas.)";
      dom.resultContent.appendChild(emptyMsg);
      return;
    }

    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var tr = document.createElement("tr");
    for (var ci = 0; ci < studentResult.columns.length; ci++) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = studentResult.columns[ci];
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var rows = studentResult.rows || [];
    for (var ri = 0; ri < rows.length; ri++) {
      var row = document.createElement("tr");
      var cells = rows[ri];
      for (var vi = 0; vi < (cells ? cells.length : 0); vi++) {
        var td = document.createElement("td");
        var val = cells[vi];
        td.textContent = (val === null || val === undefined) ? "NULL" : String(val);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    dom.resultContent.appendChild(table);
  }

  function revealHint(hintIndex) {
    var ex = AppExercises.phases[state.phaseIndex].exercises[state.exerciseIndex];
    if (!ex || !ex.hints || hintIndex >= ex.hints.length) return;

    var hint = ex.hints[hintIndex];
    if (state.currentExerciseState.hintsUsed.indexOf(hintIndex) !== -1) return;

    // Mark hint as used
    state.currentExerciseState.hintsUsed.push(hintIndex);

    // Penalties affect this exercise's potential credit, not unresolved work.
    var penalty = hint.penalty !== undefined ? hint.penalty : SCORE.DEFAULT_HINT_PENALTY;
    var curEntry = _getCurrentLogEntry();
    if (curEntry) {
      curEntry.hintsUsed = state.currentExerciseState.hintsUsed.length;
      curEntry.scoreDelta -= penalty;
    }
    _recalculateScore();

    // Show hint text and mark button
    var textEl = document.getElementById("hint-text-" + hintIndex);
    if (textEl) textEl.classList.add("visible");

    var btns = dom.hintsWrap.querySelectorAll(".hint-btn");
    if (btns[hintIndex]) btns[hintIndex].classList.add("used");

    renderStatusBar();
    saveCurrentProgress();
  }

  // ==========================================================================
  // Exercise execution and scoring
  // ==========================================================================

  function handleSubmit() {
    var sql = dom.queryInput.value;
    if (!sql.trim()) return;

    var ex = AppExercises.phases[state.phaseIndex].exercises[state.exerciseIndex];
    if (!ex) return;

    state.currentExerciseState.attempts++;
    state.currentExerciseState.lastSql = sql;
    var submittedLogEntry = _getCurrentLogEntry();
    if (submittedLogEntry) submittedLogEntry.submittedSql = sql;

    // Execute student SQL
    var studentResult = window.SqlEngine.execute(sql);

    // If there's a SQL error, show it immediately
    if (studentResult.error) {
      var errPenalty = ex.scoring && ex.scoring.errorPenalty ? ex.scoring.errorPenalty : SCORE.DEFAULT_ERROR_PENALTY;
      var logEntry = _getCurrentLogEntry();
      if (logEntry) {
        logEntry.attempts = state.currentExerciseState.attempts;
        logEntry.scoreDelta -= errPenalty;
      }
      _recalculateScore();
      renderStatusBar();
      saveCurrentProgress();
      renderFeedback(false, studentResult, ex.expectedSql,
        "Error SQL: " + studentResult.error + ". Revisa la sintaxis e inténtalo de nuevo.");
      renderMenu();
      return;
    }

    // Execute expected SQL against fresh clone
    var expectedResult = window.SqlEngine.execute(ex.expectedSql);
    if (expectedResult.error) {
      // This is a bug in our exercise definition — expected SQL should be valid
      renderFeedback(false, { error: "Error interno: la consulta esperada no es válida." },
        ex.expectedSql, "Contacta al profesor: la consulta de referencia tiene un error.");
      return;
    }

    // Compare results
    var comparison = window.ResultCompare.compare(expectedResult, studentResult, {
      ordered: ex.ordered !== false, // default true
      normalizeCase: false,
    });

    if (comparison.matched) {
      var rewardsBefore = state.rewards.slice();
      state.currentExerciseState.solved = true;
      var curLog = _getCurrentLogEntry();
      if (curLog) {
        curLog.attempts = state.currentExerciseState.attempts;
        curLog.solved = true;
        // Keep the skipped flag in place for the menu (so the student
        // sees it was once skipped) but the solved status is what
        // determines the menu badge. We do NOT clear `skipped` — it
        // records the history without affecting current behaviour.

      }
      _recalculateScore();
      renderStatusBar();
      renderMenu();
      saveCurrentProgress();
      renderFeedback(true, null, ex.expectedSql, null, studentResult);
      var newlyUnlocked = state.rewards.filter(function (id) {
        return rewardsBefore.indexOf(id) === -1;
      });
      _showRewardUnlock(newlyUnlocked);
    } else {
      // Penalize wrong answer
      var penalty = ex.scoring && ex.scoring.errorPenalty ? ex.scoring.errorPenalty : SCORE.DEFAULT_ERROR_PENALTY;
      var logE = _getCurrentLogEntry();
      if (logE) {
        logE.attempts = state.currentExerciseState.attempts;
        logE.scoreDelta -= penalty;
      }
      _recalculateScore();
      renderStatusBar();
      saveCurrentProgress();

      var msg;
      if (comparison.details.columnsOnlyMismatch === true) {
        msg = "¡Casi! Los DATOS de tu resultado son correctos, pero los " +
          "nombres de las columnas no coinciden con los esperados. " +
          "Revisa los alias (AS): por ejemplo, COUNT(*) sin alias produce " +
          "una columna llamada «COUNT(*)» en lugar del nombre pedido.";
      } else {
        msg = "Las columnas o filas no coinciden. ";
        if (comparison.details.columnMatch === false) msg += "Revisa los nombres de las columnas. ";
        if (comparison.details.rowCountMatch === false) msg += "El número de filas no coincide. ";
        if (comparison.details.mismatchedRows && comparison.details.mismatchedRows.length > 0) {
          msg += "Hay " + comparison.details.mismatchedRows.length + " diferencia(s) en las filas.";
        }
      }
      renderFeedback(false, null, ex.expectedSql, msg, studentResult);
      renderMenu();
    }
  }

  function handleSkip() {
    var ex = AppExercises.phases[state.phaseIndex].exercises[state.exerciseIndex];
    if (!ex) return;

    var logE = _getCurrentLogEntry();

    if (logE) {
      logE.solved = false;
      // Mark the entry as skipped so the side menu treats it as
      // navigable (the student can come back and try it later), but
      // the reference solution is NEVER shown for a skipped entry.
      logE.skipped = true;
    }
    _recalculateScore();

    // Mark transient state so renderPath branches know the exercise was
    // skipped. The student can still type/submit from the feedback
    // screen to attempt a solution — solving later simply flips
    // `solved` on the same entry (no duplicate, no double score).
    if (state.currentExerciseState) {
      state.currentExerciseState.skipped = true;
    }

    // Skip feedback — explicitly NOT showing the expected SQL. The
    // box is hidden (we keep the visual contract: skipped ≠ reveal).
    // The input is enabled so the student can keep typing if they
    // change their mind; pressing submit on this same attempt will
    // count as a real attempt (no auto-skip).
    dom.queryInput.disabled = false;
    dom.btnSubmit.disabled = false;
    dom.btnSkip.style.display = "none";
    // No-reveal contract: skipping NEVER shows (and actively hides) the
    // reference solution, in every mode. Even in guided mode — where the
    // solution was visible during the attempt — hiding it here keeps the
    // rule simple and consistent: skipped ≠ revealed. The helper wipes
    // the whole container so no answer text survives in the DOM.
    _hideExpectedSqlBox();
    dom.feedbackOk.style.display = "block";
    dom.feedbackOk.classList.remove("feedback-ok-skip");
    dom.feedbackOk.classList.add("feedback-skipped");
    var skipGuided = AppExercises.phases[state.phaseIndex].mode === "guided";
    dom.feedbackOkContent.textContent =
      "Saltaste este ejercicio (0 puntos hasta que lo resuelvas). Puedes volver a intentarlo cuando quieras desde el menú lateral" +
      (skipGuided ? "." : " — la solución no se mostrará.");
    dom.feedbackOkSql.textContent = "";
    dom.feedbackOkSql.style.display = "none";
    dom.btnNext.style.display = "inline-block";
    // Re-enable input focus so the student can immediately try
    if (dom.queryInput.focus) { try { dom.queryInput.focus(); } catch (e) {} }

    renderStatusBar();
    renderMenu();
    saveCurrentProgress();
  }

  function handleNext() {
    var phase = AppExercises.phases[state.phaseIndex];

    // attemptLog entry was created at exercise start — update it before advancing
    var curLog = _getCurrentLogEntry();
    var es = state.currentExerciseState;
    if (curLog && es) {
      curLog.attempts = es.attempts;
      curLog.hintsUsed = es.hintsUsed.length;
      curLog.solved = es.solved;
    }

    // Advance to next exercise / phase
    var isLastInPhase = state.exerciseIndex >= phase.exercises.length - 1;
    var isLastPhase = state.phaseIndex >= AppExercises.phases.length - 1;

    if (isLastInPhase && isLastPhase) {
      // All done
      state.view = "complete";
      saveCurrentProgress();
      showCompleteView();
    } else if (isLastInPhase) {
      // Next phase
      state.phaseIndex++;
      state.exerciseIndex = 0;
      saveCurrentProgress();
      showExerciseView();
    } else {
      // Next exercise in current phase
      state.exerciseIndex++;
      saveCurrentProgress();
      showExerciseView();
    }
  }

  /**
   * Navigate to the immediately previous exercise, crossing phase
   * boundaries when the current exercise is the first in its phase.
   *
   * State-preservation guarantees:
   *  - The current exercise's attemptLog entry is NOT duplicated by going
   *    back. We re-use the existing entry (which already holds the
   *    student's prior attempts/hints/solved for that exercise) on return.
   *  - The current score is preserved — going back is a no-op for scoring.
   *  - The new position is persisted via saveCurrentProgress() so that a
   *    reload or "Continuar" lands on the previous exercise.
   *
   * No-op when already at the first exercise. The button is also
   * disabled in the UI for that case, but we guard again here so the
   * function is safe to call directly (tests, programmatic invocation).
   */
  function handlePrevious() {
    // No-op on the first exercise — defends against a stuck button
    if (state.phaseIndex === 0 && state.exerciseIndex === 0) return;

    // Sync any in-flight currentExerciseState into its attemptLog entry
    // before moving. We use _getCurrentLogEntry() (not the last entry)
    // so the right entry is updated.
    var curLog = _getCurrentLogEntry();
    var es = state.currentExerciseState;
    if (curLog && es) {
      curLog.attempts = es.attempts;
      curLog.hintsUsed = es.hintsUsed.length;
      curLog.solved = es.solved;
    }

    // Cross-phase boundary if needed: from (phase, 0) jump to
    // (phase - 1, last exercise of that phase).
    if (state.exerciseIndex > 0) {
      state.exerciseIndex--;
    } else {
      state.phaseIndex--;
      var prevPhase = AppExercises.phases[state.phaseIndex];
      state.exerciseIndex = prevPhase.exercises.length - 1;
    }

    saveCurrentProgress();
    // Use the restored path so attemptLog state for the prior exercise
    // is reconstructed from its existing entry (no duplicate created).
    showExerciseViewRestored();
  }

  function handleStart() {
    var nameInput = dom.studentNameInput;
    var nameError = dom.nameError;
    var name = nameInput.value.trim();
    if (!name) {
      nameInput.style.borderColor = "#E5002B";
      if (nameError) { nameError.style.display = "block"; }
      nameInput.focus();
      return;
    }
    nameInput.style.borderColor = "";
    if (nameError) { nameError.style.display = "none"; }

    state.studentName = name;
    state.greeting = _pickGreeting();
    if (!state.selectedAvatar) state.selectedAvatar = AVATARS[0].id;
    state.phaseIndex = 0;
    state.exerciseIndex = 0;
    state.maxScore = AppExercises.maxScore();
    state.score = 0;
    state.attemptLog = [];
    state.rewards = [];
    state.view = "exercises";

    // Persist new session immediately
    saveCurrentProgress();

    showExerciseView();
  }

  /**
   * Save the current app state to IndexedDB.
   * Called after every state-changing action.  Errors are silently ignored
   * so persistence failures never block the exercise flow.
   */
  function _currentProgressSnapshot() {
    // score and earnedPoints are derived from the immutable exercise bank plus
    // attempt-log state. Never carry a stale aggregate across a boundary.
    _recalculateScore();
    return {
      studentName: state.studentName,
      selectedAvatar: state.selectedAvatar,
      phaseIndex: state.phaseIndex,
      exerciseIndex: state.exerciseIndex,
      score: state.score,
      maxScore: state.maxScore,
      attemptLog: state.attemptLog,
      rewards: state.rewards,
      view: state.view,
      menuCollapsed: state.menuCollapsed === true,
    };
  }

  function showStorageRecoveryGuidance() {
    if (!window.ProgressStore || typeof window.ProgressStore.getStatus !== "function") return;
    var status = window.ProgressStore.getStatus();
    var persistenceAvailable = typeof window.ProgressStore.isAvailable === "function" &&
      window.ProgressStore.isAvailable();
    if (status && status.backend === "indexeddb" && persistenceAvailable) return;
    var message = status.backend === "localStorage"
      ? "IndexedDB no ha podido guardar esta sesión. Se está usando una copia local de recuperación; exportá el progreso antes de cerrar el navegador."
      : "El navegador no puede guardar el progreso de forma duradera. Exportá el progreso antes de cerrar el navegador.";
    if (dom.storageWarning) {
      dom.storageWarning.textContent = message;
      dom.storageWarning.style.display = "block";
    }
  }

  function saveCurrentProgress() {
    if (!window.ProgressStore || !window.ProgressStore.isAvailable()) {
      showStorageRecoveryGuidance();
      return Promise.resolve();
    }
    return window.ProgressStore.saveProgress(_currentProgressSnapshot()).then(function () {
      showStorageRecoveryGuidance();
    }).catch(function () {
      showStorageRecoveryGuidance();
    });
  }

  /** Continue from a previously saved session. */
  function handleContinue() {
    if (!window.ProgressStore) return;

    window.ProgressStore.loadProgress().then(function (saved) {
      if (!saved) {
        // No saved progress — fallback to clean start
        dom.studentNameInput.focus();
        return;
      }
      _restoreFromProgress(saved);
    }).catch(function () {
      dom.studentNameInput.focus();
    });
  }

  /** Discard saved progress and start a fresh session. */
  function handleNewSession() {
    if (!window.ProgressStore) return;
    window.ProgressStore.clearProgress().then(function () {
      dom.savedBanner.style.display = "none";
      dom.studentNameInput.value = "";
      dom.studentNameInput.focus();
    }).catch(function () {
      dom.savedBanner.style.display = "none";
      dom.studentNameInput.focus();
    });
  }

  /**
   * Restore app state from a saved/imported progress record.
   * Validates indices against exercise set before applying state.
   * Calls the appropriate view renderer without duplicating attemptLog.
   * @param {Object} saved — validated progress from ProgressStore or import
   */
  function _restoreFromProgress(saved) {
    // Validate indices against the current exercise set before accepting
    if (!_validateProgressIndices(saved)) return false;

    state.studentName = saved.studentName;
    state.greeting = _pickGreeting();
    state.selectedAvatar = saved.selectedAvatar || "";
    state.phaseIndex = saved.phaseIndex;
    state.exerciseIndex = saved.exerciseIndex;
    state.maxScore = AppExercises.maxScore();
    state.attemptLog = saved.attemptLog || [];
    _recalculateScore();
    state.view = saved.view || "exercises";
    state.currentExerciseState = null;
    // Side-menu state — restore the student's collapse preference. Older
    // exports may not carry `menuCollapsed`; default to expanded.
    state.menuCollapsed = saved.menuCollapsed === true;

    dom.studentNameInput.value = saved.studentName;
    dom.savedBanner.style.display = "none";

    if (state.view === "complete") {
      showCompleteView();
    } else {
      showExerciseViewRestored();
    }
    return true;
  }

  /**
   * Validate that the progress indices are valid for the current exercise set.
   * Shows an import error if invalid (handleImport path) or just returns false.
   * @param {Object} progress
   * @returns {boolean}
   */
  function _validateProgressIndices(progress) {
    var phaseIndex = progress && progress.phaseIndex;
    if (typeof phaseIndex !== "number" || !isFinite(phaseIndex) ||
        Math.floor(phaseIndex) !== phaseIndex || phaseIndex < 0 ||
        phaseIndex >= AppExercises.phases.length) {
      dom.importError.style.display = "block";
      dom.importError.textContent =
        "El archivo contiene una fase (" + (phaseIndex + 1) +
        ") que no existe en esta versión del simulador.";
      return false;
    }
    var phase = AppExercises.phases[phaseIndex];
    var exerciseIndex = progress.exerciseIndex;
    if (typeof exerciseIndex !== "number" || !isFinite(exerciseIndex) ||
        Math.floor(exerciseIndex) !== exerciseIndex || exerciseIndex < 0 ||
        exerciseIndex >= phase.exercises.length) {
      dom.importError.style.display = "block";
      dom.importError.textContent =
        "El archivo contiene un ejercicio (" + (exerciseIndex + 1) +
        ") que no existe en la fase " + (phaseIndex + 1) + ".";
      return false;
    }
    return true;
  }

  /** Export current progress as teacher-review HTML and trigger download. */
  function handleExport(statusElement) {
    if (!window.ExportPackage) return;

    var exportStatus = statusElement || dom.exportStatus;
    if (exportStatus) {
      exportStatus.style.display = "none";
      exportStatus.textContent = "";
    }

    // Export immediately from the current state. IndexedDB writes are async,
    // so reading it here could omit an attempt made just before export.
    var progress = _currentProgressSnapshot();
    saveCurrentProgress();
    try {
      var pkg = window.ExportPackage.buildExport(progress);
      window.ExportPackage.exportToFile(pkg);

      if (exportStatus) {
        exportStatus.style.display = "block";
        exportStatus.style.color = "#00C060";
        exportStatus.textContent = "✓ Exportado correctamente.";
        _showTransientMessage(exportStatus);
      }
    } catch (err) {
      if (exportStatus) {
        exportStatus.style.display = "block";
        exportStatus.style.color = "#E5002B";
        exportStatus.textContent = "✗ Error al exportar: " + (err.message || "error desconocido");
      }
    }
  }

  /**
   * Handle file selection for import.
   * @param {File} file
   */
  function handleImport(file) {
    if (!window.ExportPackage) return;

    dom.importError.style.display = "none";
    dom.importOk.style.display = "none";

    // Guard: basic type/extension check
    var fileName = (file.name || "").toLowerCase();
    var hasValidExt = fileName.endsWith(".html") || fileName.endsWith(".htm");
    var hasValidType = file.type === "" || file.type === "text/html";
    if (!hasValidExt && !hasValidType) {
      dom.importError.style.display = "block";
      dom.importError.textContent =
        "Formato no soportado. Solo se aceptan archivos .html o .htm exportados por el simulador.";
      return;
    }

    // Guard: max file size (5 MB)
    var MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      dom.importError.style.display = "block";
      dom.importError.textContent =
        "El archivo es demasiado grande. El tamaño máximo es 5 MB.";
      return;
    }

    window.ExportPackage.importFromFile(file).then(function (progress) {
      // Structural validation was done by importFromFile.
      // Restore recalculates the aggregate before writing the canonical
      // attempt-log state, so legacy exports with old totals stay compatible.
      if (_restoreFromProgress(progress)) {
        saveCurrentProgress();
        dom.importOk.style.display = "block";
        dom.importOk.textContent = "Progreso importado correctamente. Podés continuar desde el ejercicio guardado.";
      }
    }).catch(function (err) {
      dom.importError.style.display = "block";
      dom.importError.textContent = "Error al importar: " + (err.message || "archivo inválido");
    });
  }

  // ==========================================================================
  // Toggle aids
  // ==========================================================================

  function toggleAids(type) {
    if (type === "context") {
      var visible = dom.aidsContextBox.style.display === "block";
      dom.aidsContextBox.style.display = visible ? "none" : "block";
      dom.togContext.classList.toggle("active", !visible);
    } else if (type === "guide") {
      var visible = dom.aidsGuideBox.style.display === "block";
      dom.aidsGuideBox.style.display = visible ? "none" : "block";
      dom.togGuide.classList.toggle("active", !visible);
    }
  }

  // ==========================================================================
  // Schema reference (always-available modal)
  // ==========================================================================

  /**
   * Build the table-list buttons for the schema modal. Each button is a
   * safe DOM node (text content set via textContent) so no input ever
   * reaches the DOM as HTML.
   */
  /**
   * Render a clear "unavailable" state inside the detail pane. Used when
   * window.SchemaReference is missing or a render call throws — the user
   * should always see an explanation, never a blank modal or a click-time
   * exception (RESILIENCE-002).
   */
  /**
   * Render a clear "unavailable" state inside the detail pane. Used when
   * window.SchemaReference is missing or a render call throws — the user
   * should always see an explanation, never a blank modal or a click-time
   * exception (RESILIENCE-002).
   */
  function renderSchemaUnavailable(message) {
    if (!dom.schemaDetail) return;
    dom.schemaDetail.textContent = "";
    var box = document.createElement("div");
    box.className = "schema-unavailable";
    box.setAttribute("role", "status");
    var title = document.createElement("strong");
    title.textContent = "Referencia de esquema no disponible";
    var body = document.createElement("p");
    body.textContent = message;
    box.appendChild(title);
    box.appendChild(document.createElement("br"));
    box.appendChild(body);
    dom.schemaDetail.appendChild(box);
  }

  function renderSchemaTableList() {
    if (!dom.schemaList) return;
    if (!window.SchemaReference || typeof window.SchemaReference.renderTableList !== "function") {
      // SchemaReference missing — list pane is empty; detail pane will
      // show the unavailable message the first time the user opens the modal.
      dom.schemaList.textContent = "";
      return;
    }
    try {
      dom.schemaList.textContent = "";
      var list = window.SchemaReference.renderTableList();
      for (var i = 0; i < list.length; i++) {
        (function (entry) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "schema-list-item";
          btn.setAttribute("role", "option");
          btn.setAttribute("data-table-name", entry.name);
          btn.textContent = entry.name;
          var meta = document.createElement("span");
          meta.className = "schema-list-meta";
          meta.textContent = entry.columnCount + " columna" +
            (entry.columnCount === 1 ? "" : "s") +
            (entry.hasForeignKeys ? " · con FK" : "");
          btn.appendChild(meta);
          btn.addEventListener("click", function () { selectSchemaTable(entry.name); });
          dom.schemaList.appendChild(btn);
        })(list[i]);
      }
    } catch (e) {
      console.error("schema: renderTableList failed", e);
      dom.schemaList.textContent = "";
      renderSchemaUnavailable(
        "No se pudo cargar la lista de tablas: " + (e && e.message ? e.message : "error desconocido")
      );
    }
  }

  /**
   * Render the right-hand detail pane for the given table name.
   * Pure-DOM construction — no innerHTML, no user data.
   * Errors are contained: a thrown render failure shows the
   * "unavailable" state in the detail pane instead of bubbling up
   * and breaking the modal (RESILIENCE-002).
   * @param {string} name
   */
  function renderSchemaDetail(name) {
    if (!dom.schemaDetail) return;
    if (!window.SchemaReference || typeof window.SchemaReference.renderTableDetail !== "function") {
      renderSchemaUnavailable(
        "La referencia de esquema no está cargada. Verifica que src/schema-reference.js " +
        "se haya incluido antes de src/app.js."
      );
      return;
    }
    var detail;
    try {
      detail = window.SchemaReference.renderTableDetail(name);
    } catch (e) {
      console.error("schema: renderTableDetail failed for", name, e);
      renderSchemaUnavailable(
        "No se pudo renderizar la tabla «" + name + "»: " +
        (e && e.message ? e.message : "error desconocido")
      );
      return;
    }
    dom.schemaDetail.textContent = "";
    if (!detail) {
      var empty = document.createElement("span");
      empty.className = "schema-empty";
      empty.textContent = "Tabla no encontrada.";
      dom.schemaDetail.appendChild(empty);
      return;
    }

    var h3 = document.createElement("h3");
    h3.textContent = detail.name;
    dom.schemaDetail.appendChild(h3);

    var desc = document.createElement("div");
    desc.className = "schema-desc";
    desc.textContent = detail.description;
    dom.schemaDetail.appendChild(desc);

    // Columns table
    var colsHeader = document.createElement("h4");
    colsHeader.textContent = "Columnas";
    dom.schemaDetail.appendChild(colsHeader);

    var table = document.createElement("table");
    table.className = "schema-cols-table";
    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    ["Columna", "Tipo", "Nota"].forEach(function (label) {
      var th = document.createElement("th");
      th.scope = "col";
      th.textContent = label;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    for (var i = 0; i < detail.columns.length; i++) {
      var col = detail.columns[i];
      var tr = document.createElement("tr");
      var tdName = document.createElement("td");
      tdName.className = "col-name";
      tdName.textContent = col.name;
      if (col.pk > 0) {
        var pk = document.createElement("span");
        pk.className = "schema-pk";
        pk.textContent = col.pk === 1 ? "PK" : "PK" + col.pk;
        tdName.appendChild(pk);
      }
      tr.appendChild(tdName);

      var tdType = document.createElement("td");
      tdType.className = "col-type";
      tdType.textContent = col.type + (col.notnull ? " NOT NULL" : "");
      tr.appendChild(tdType);

      var tdNote = document.createElement("td");
      tdNote.className = "col-note";
      tdNote.textContent = col.note || "";
      tr.appendChild(tdNote);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    dom.schemaDetail.appendChild(table);

    // Foreign keys
    if (detail.foreignKeys.length > 0) {
      var fkHeader = document.createElement("h4");
      fkHeader.textContent = "Claves foráneas (esta tabla → otras)";
      dom.schemaDetail.appendChild(fkHeader);
      var fkList = document.createElement("ul");
      fkList.className = "schema-fk-list";
      for (var k = 0; k < detail.foreignKeys.length; k++) {
        var fk = detail.foreignKeys[k];
        var li = document.createElement("li");
        var arrow = document.createElement("span");
        arrow.textContent = fk.column + " → ";
        var target = document.createElement("code");
        target.textContent = fk.target + "." + fk.targetColumn;
        li.appendChild(arrow);
        li.appendChild(target);
        fkList.appendChild(li);
      }
      dom.schemaDetail.appendChild(fkList);
    }

    // Inbound references
    if (detail.inboundReferences.length > 0) {
      var inHeader = document.createElement("h4");
      inHeader.textContent = "Apuntan aquí (otras tablas → esta)";
      dom.schemaDetail.appendChild(inHeader);
      var inList = document.createElement("ul");
      inList.className = "schema-inbound-list";
      for (var r = 0; r < detail.inboundReferences.length; r++) {
        var ref = detail.inboundReferences[r];
        var li2 = document.createElement("li");
        var src = document.createElement("code");
        src.textContent = ref.sourceTable + "." + ref.sourceColumn;
        var sep = document.createElement("span");
        sep.textContent = " → " + ref.targetColumn;
        li2.appendChild(src);
        li2.appendChild(sep);
        inList.appendChild(li2);
      }
      dom.schemaDetail.appendChild(inList);
    }

    // Optional student-facing notes
    if (detail.notes) {
      var notesBox = document.createElement("div");
      notesBox.className = "schema-notes";
      notesBox.textContent = detail.notes;
      dom.schemaDetail.appendChild(notesBox);
    }
  }

  /** Select a table in the modal — updates the right pane and the active item. */
  function selectSchemaTable(name) {
    if (!dom.schemaList || !dom.schemaDetail) return;
    state.schemaSelectedTable = name;
    var items = dom.schemaList.querySelectorAll(".schema-list-item");
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var matches = it.getAttribute("data-table-name") === name;
      it.classList.toggle("active", matches);
      if (matches) it.setAttribute("aria-selected", "true");
      else it.removeAttribute("aria-selected");
    }
    renderSchemaDetail(name);
  }

  function openSchemaModal() {
    if (!dom.schemaModal) return;
    // Lazy-init: the table list is built on first open so the simulator
    // stays quiet on the start screen.
    if (dom.schemaList && dom.schemaList.children.length === 0) {
      renderSchemaTableList();
      // Default selection: first table in the list (or none if unavailable)
      var tables = (window.SchemaReference && typeof window.SchemaReference.getTables === "function")
        ? window.SchemaReference.getTables()
        : [];
      if (tables.length > 0) {
        selectSchemaTable(tables[0].name);
      } else {
        // SchemaReference missing or returned no tables — show the
        // unavailable state in the detail pane so the modal is not
        // silently empty (RESILIENCE-002).
        renderSchemaUnavailable(
          "La referencia de esquema no está disponible. " +
          "Comprueba que src/schema-reference.js se cargó correctamente."
        );
      }
    }
    dom.schemaModal.setAttribute("aria-hidden", "false");
    if (dom.btnSchema) dom.btnSchema.setAttribute("aria-expanded", "true");
    // Move focus to close button for keyboard users
    if (dom.btnSchemaClose) {
      try { dom.btnSchemaClose.focus(); } catch (e) { /* focus is best-effort */ }
    }
  }

  function closeSchemaModal() {
    if (!dom.schemaModal) return;
    dom.schemaModal.setAttribute("aria-hidden", "true");
    if (dom.btnSchema) {
      dom.btnSchema.setAttribute("aria-expanded", "false");
      try { dom.btnSchema.focus(); } catch (e) { /* best-effort */ }
    }
  }

  function toggleSchemaModal() {
    if (!dom.schemaModal) return;
    var isOpen = dom.schemaModal.getAttribute("aria-hidden") === "false";
    if (isOpen) closeSchemaModal(); else openSchemaModal();
  }

  /** Click on the modal overlay (outside the card) should close it. */
  function handleSchemaOverlayClick(e) {
    if (!dom.schemaModal) return;
    // The card sits inside the modal; only clicks on the modal itself
    // (i.e. outside the card) should trigger close.
    if (e.target === dom.schemaModal) closeSchemaModal();
  }

  // ==========================================================================
  // Side menu — listing all phases/exercises, with click-to-navigate
  // for solved/skipped entries and a current-exercise indicator.
  // ==========================================================================

  /**
   * Compute the display status for a given phase/exercise.
   *
   * Returns one of:
   *   "solved"   — student submitted a correct query (solved=true in log)
   *   "skipped"  — student clicked Saltar; entry is navigable but the
   *                reference solution is hidden until the student solves
   *                the exercise
   *   "current"  — this is the exercise currently shown to the student
   *   "locked"   — neither solved nor skipped nor the current exercise
   *                (a future exercise the student hasn't reached yet)
   *   "available"— already seen (an exercise the student has navigated
   *                past). The spec only requires solved/skipped to be
   *                navigable from the menu, so we surface these as
   *                locked-but-not-the-current-position. Keeping a
   *                distinct state lets us add a "review" affordance
   *                later without a behavior change.
   *
   * The first exercise (phase=0, index=0) is always "current" until it
   * is solved or skipped — there is no "locked" before the first one.
   */
  function _menuStatusFor(phaseIndex, exerciseIndex) {
    if (phaseIndex === state.phaseIndex && exerciseIndex === state.exerciseIndex) {
      return "current";
    }
    var ex = AppExercises.getExercise(phaseIndex, exerciseIndex);
    if (!ex) return "locked";
    // Find the attemptLog entry for this exercise (if any).
    var entry = null;
    for (var i = 0; i < state.attemptLog.length; i++) {
      if (state.attemptLog[i].exerciseId === ex.id) { entry = state.attemptLog[i]; break; }
    }
    if (entry) {
      if (entry.solved) return "solved";
      if (entry.skipped) return "skipped";
      return "locked"; // touched (attempted/hinted) but not solved/skipped — not navigable
    }
    return "locked";
  }

  /**
   * Render the side menu — one section per phase, one row per exercise.
   * Each row is a `<button>` (clickable when solved/skipped/current) with
   * a status glyph (✓ solved, → skipped, ● current, ○ locked).
   *
   * Safe DOM construction: no innerHTML, every label goes through
   * textContent so an exercise title authored with HTML-ish characters
   * can never reach the DOM as a node.
   */
  function renderMenu() {
    if (!dom.sidebarList) return;
    if (typeof AppExercises === "undefined" || !AppExercises.phases) return;

    dom.sidebarList.textContent = "";

    for (var pi = 0; pi < AppExercises.phases.length; pi++) {
      var phase = AppExercises.phases[pi];
      var section = document.createElement("div");
      section.className = "sidebar-phase";
      section.setAttribute("role", "group");
      section.setAttribute("aria-label", phase.label || ("Fase " + (pi + 1)));

      var header = document.createElement("div");
      header.className = "sidebar-phase-label";
      header.textContent = phase.label || ("Fase " + (pi + 1));
      section.appendChild(header);

      for (var ei = 0; ei < phase.exercises.length; ei++) {
        var ex = phase.exercises[ei];
        var status = _menuStatusFor(pi, ei);

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sidebar-item " + status;
        btn.setAttribute("data-phase-index", String(pi));
        btn.setAttribute("data-exercise-index", String(ei));
        btn.setAttribute("role", "listitem");
        // aria-current for the active exercise so screen readers know
        if (status === "current") {
          btn.setAttribute("aria-current", "true");
        }
        // Locked items must be disabled (no click handler should fire).
        if (status === "locked") {
          btn.disabled = true;
          btn.setAttribute("aria-disabled", "true");
        }

        var statusEl = document.createElement("span");
        statusEl.className = "status";
        statusEl.setAttribute("aria-hidden", "true");
        if (status === "solved") statusEl.textContent = "✓";
        else if (status === "skipped") statusEl.textContent = "→";
        else if (status === "current") statusEl.textContent = "●";
        else statusEl.textContent = "○";
        btn.appendChild(statusEl);

        var label = document.createElement("span");
        label.className = "label";
        label.textContent = ex.title || ("Ejercicio " + (ei + 1));
        btn.appendChild(label);

        // Click handler — only attached for navigable items. The
        // disabled attribute above also blocks the synthetic click
        // from firing on locked items, so this is a belt-and-suspenders
        // guard.
        if (status !== "locked") {
          (function (p, e) {
            btn.addEventListener("click", function () {
              _navigateToMenuExercise(p, e);
            });
          })(pi, ei);
        }
        section.appendChild(btn);
      }
      dom.sidebarList.appendChild(section);
    }

    // Reflect the current collapsed/expanded state on the shell.
    _applyMenuCollapseClass();
  }

  /**
   * Apply the menuCollapsed state to the app shell — adds/removes the
   * .sidebar-collapsed class on the shell wrapper and toggles the
   * visibility of the floating "show menu" button. Always called from
   * renderMenu so the DOM stays in sync with state.menuCollapsed.
   */
  function _applyMenuCollapseClass() {
    if (dom.appShell) {
      if (state.menuCollapsed) dom.appShell.classList.add("sidebar-collapsed");
      else dom.appShell.classList.remove("sidebar-collapsed");
    }
    // Floating "show menu" button is only visible when collapsed.
    if (dom.sidebarFloatingToggle) {
      dom.sidebarFloatingToggle.hidden = !state.menuCollapsed;
    }
    if (dom.btnSidebarExpand) {
      dom.btnSidebarExpand.setAttribute("aria-expanded", state.menuCollapsed ? "false" : "true");
    }
    if (dom.btnSidebarCollapse) {
      dom.btnSidebarCollapse.setAttribute("aria-expanded", state.menuCollapsed ? "false" : "true");
    }
  }

  /**
   * Toggle the menu's collapsed/expanded state. Persists the choice via
   * saveCurrentProgress so a reload/Continue keeps the menu in the
   * student's preferred state.
   */
  function toggleMenu() {
    state.menuCollapsed = !state.menuCollapsed;
    _applyMenuCollapseClass();
    saveCurrentProgress();
  }

  /**
   * Navigate to a specific exercise triggered by a menu click.
   *
   * Guards:
   *  - Target must be solved, skipped, or current. Locked items are
   *    rejected (the button is `disabled` in the DOM, but we guard
   *    here too in case the function is called programmatically).
   *  - Saves progress before the new view renders so a reload lands
   *    on the new exercise.
   *  - No attemptLog entry is created or duplicated — the entry for
   *    the target exercise (if any) is preserved so the student's
   *    earlier work isn't lost.
   *
   * Re-uses the restored-render path (showExerciseViewRestored) so the
   * existing attemptLog entry drives the rendering instead of a fresh
   * state being created.
   *
   * @param {number} phaseIndex
   * @param {number} exerciseIndex
   */
  function _navigateToMenuExercise(phaseIndex, exerciseIndex) {
    // Guard: target must be navigable (solved / skipped / current).
    var status = _menuStatusFor(phaseIndex, exerciseIndex);
    if (status === "locked") return;

    // Sync in-flight transient state into the current exercise's
    // attemptLog entry before moving — same pattern as handlePrevious.
    var curLog = _getCurrentLogEntry();
    var es = state.currentExerciseState;
    if (curLog && es) {
      curLog.attempts = es.attempts;
      curLog.hintsUsed = es.hintsUsed.length;
      curLog.solved = es.solved;
      curLog.skipped = es.skipped === true;
    }

    state.phaseIndex = phaseIndex;
    state.exerciseIndex = exerciseIndex;
    saveCurrentProgress();
    showExerciseViewRestored();
  }

  // ==========================================================================
  // Bootstrap
  // ==========================================================================

  /**
   * Wire the schema-reference modal event listeners. Must be called as
   * soon as the DOM is cached and preflight passes — BEFORE initEngine(),
   * loadSeed(), and SqlEngine.init() — so the always-available button
   * works on the start screen, exercise screen, complete screen, AND
   * on the bootstrap-error screen (R3-003).
   *
   * No engine or app state is required: the schema data is curated and
   * exposed on window.SchemaReference by src/schema-reference.js, which
   * loads before app.js.
   */
  function wireSchemaUI() {
    if (dom.btnSchema) {
      dom.btnSchema.addEventListener("click", toggleSchemaModal);
    }
    if (dom.btnSchemaClose) {
      dom.btnSchemaClose.addEventListener("click", closeSchemaModal);
    }
    if (dom.schemaModal) {
      // Click outside the card closes the modal
      dom.schemaModal.addEventListener("click", handleSchemaOverlayClick);
    }
    // ESC closes the modal from anywhere in the document
    document.addEventListener("keydown", function (e) {
      if (!dom.schemaModal) return;
      if (e.key !== "Escape" && e.key !== "Esc") return;
      if (dom.schemaModal.getAttribute("aria-hidden") === "false") {
        e.preventDefault();
        closeSchemaModal();
      }
    });
  }

  function cacheDom() {
    // Cache DOM elements
    dom.startScreen = document.getElementById("start-screen");
    dom.exerciseArea = document.getElementById("exercise-area");
    dom.completeScreen = document.getElementById("complete-screen");
    dom.statusBar = document.getElementById("status-bar");
    dom.studentNameInput = document.getElementById("student-name");
    dom.btnStart = document.getElementById("btn-start");
    dom.statusIdentity = document.getElementById("status-identity");
    dom.avatarGrid = document.getElementById("avatar-grid");
    dom.statusPhase = document.getElementById("status-phase");
    dom.statusStep = document.getElementById("status-step");
    dom.statusScore = document.getElementById("status-score");
    dom.progressFill = document.getElementById("progress-fill");
    dom.progressTrack = document.getElementById("progress-track");
    dom.rewardsSummary = document.getElementById("rewards-summary");
    dom.rewardsList = document.getElementById("rewards-list");
    dom.rewardUnlock = document.getElementById("reward-unlock");
    dom.exerciseCard = document.getElementById("exercise-card");
    dom.modeBadge = document.getElementById("mode-badge");
    dom.exerciseTitle = document.getElementById("exercise-title");
    dom.exerciseEnunciado = document.getElementById("exercise-enunciado");
    dom.queryInput = document.getElementById("query-input");
    dom.btnSubmit = document.getElementById("btn-submit");
    dom.btnSkip = document.getElementById("btn-skip");
    dom.btnNext = document.getElementById("btn-next");
    dom.btnPrev = document.getElementById("btn-prev");
    dom.expectedSqlDisplay = document.getElementById("expected-sql");
    dom.expectedSqlText = document.getElementById("expected-sql-text");
    dom.mysqlNoteBox = document.getElementById("mysql-note");
    dom.mysqlNoteText = document.getElementById("mysql-note-text");
    dom.feedbackOk = document.getElementById("feedback-ok");
    dom.feedbackOkContent = document.getElementById("feedback-ok-content");
    dom.feedbackOkSql = document.getElementById("feedback-ok-sql");
    dom.feedbackErr = document.getElementById("feedback-err");
    dom.feedbackErrContent = document.getElementById("feedback-err-content");
    dom.feedbackErrDetail = document.getElementById("feedback-err-detail");
    dom.aidsRow = document.getElementById("aids-row");
    dom.togContext = document.getElementById("tog-context");
    dom.togGuide = document.getElementById("tog-guide");
    dom.aidsContextBox = document.getElementById("aids-context");
    dom.aidsContext = document.getElementById("aids-context-text");
    dom.aidsGuideBox = document.getElementById("aids-guide");
    dom.aidsGuide = document.getElementById("aids-guide-text");
    dom.solutionNote = document.getElementById("solution-note");
    dom.solutionNoteText = document.getElementById("solution-note-text");
    dom.hintsWrap = document.getElementById("hints-wrap");
    dom.finalStudent = document.getElementById("final-student");
    dom.finalScore = document.getElementById("final-score");
    dom.finalPct = document.getElementById("final-pct");
    dom.finalMotivation = document.getElementById("final-motivation");
    dom.finalDetail = document.getElementById("final-detail");
    dom.resultDisplay = document.getElementById("result-display");
    dom.resultContent = document.getElementById("result-content");
    dom.nameError = document.getElementById("name-error");
    dom.preflightErr = document.getElementById("preflight-err");
    dom.savedBanner = document.getElementById("saved-banner");
    dom.savedBannerText = document.getElementById("saved-banner-text");
    dom.btnContinue = document.getElementById("btn-continue");
    dom.btnNewSession = document.getElementById("btn-new-session");
    dom.importFile = document.getElementById("import-file");
    dom.importError = document.getElementById("import-error");
    dom.importOk = document.getElementById("import-ok");
    dom.btnExport = document.getElementById("btn-export");
    dom.exportStatus = document.getElementById("export-status");
    dom.btnExportProgress = document.getElementById("btn-export-progress");
    dom.exportProgressStatus = document.getElementById("export-progress-status");
    dom.themeSelect = document.getElementById("theme-select");
    dom.storageWarning = document.getElementById("storage-warning");

    // Schema reference modal
    dom.btnSchema = document.getElementById("btn-schema");
    dom.schemaModal = document.getElementById("schema-modal");
    dom.btnSchemaClose = document.getElementById("btn-schema-close");
    dom.schemaList = document.getElementById("schema-list");
    dom.schemaDetail = document.getElementById("schema-detail");

    // Side menu (phase/exercise list)
    dom.appShell = document.getElementById("app-shell");
    dom.sidebar = document.getElementById("sidebar");
    dom.sidebarList = document.getElementById("sidebar-list");
    dom.btnSidebarCollapse = document.getElementById("btn-sidebar-collapse");
    dom.btnSidebarExpand = document.getElementById("btn-sidebar-expand");
    dom.sidebarFloatingToggle = document.getElementById("sidebar-floating-toggle");
  }

  function bootstrap() {
    // Cache DOM elements
    cacheDom();

    // Loading state
    var loadingEl = document.getElementById("loading-msg");
    if (loadingEl) loadingEl.style.display = "block";

    // Preflight: fail fast if required APIs are missing
    _restoreTheme();
    var preflightErr = preflightCheck();
    if (preflightErr) {
      if (loadingEl) loadingEl.style.display = "none";
      if (dom.preflightErr) {
        dom.preflightErr.style.display = "block";
        dom.preflightErr.textContent = "Error: " + preflightErr;
      }
      console.error("Preflight check failed:", preflightErr);
      // Wire the schema UI even on preflight failure so the
      // always-available button still works on the error screen (R3-003).
      wireSchemaUI();
      return;
    }

    // Wire the schema UI BEFORE the engine init chain so the modal is
    // available on the start screen AND if initEngine/loadSeed/SqlEngine
    // rejects (R3-003).
    wireSchemaUI();

    // Initialise engine then show start screen
    initEngine()
      .then(function (_SQL) {
        // SQL.js is ready. Now load the seed database.
        return loadSeed();
      })
      .then(function (seedBuffer) {
        return window.SqlEngine.init({ seedBuffer: seedBuffer });
      })
      .then(function () {
        if (loadingEl) loadingEl.style.display = "none";
        showStartView();

        // ------------------------------------------------------------------
        // Wire up event listeners for the rest of the app. Schema UI was
        // already wired above so the modal is always available.
        // ------------------------------------------------------------------
        dom.btnStart.addEventListener("click", handleStart);
        dom.studentNameInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") handleStart();
        });
        // Populate the companion picker on the start screen.
        renderAvatarPicker();
        dom.btnSubmit.addEventListener("click", handleSubmit);
        // Textarea key handler: bare Enter inserts a newline (default
        // textarea behavior — DO NOT preventDefault). Ctrl+Enter
        // (and Cmd+Enter on macOS) submits. Shift+Enter also inserts
        // a newline. The Ctrl/Cmd binding is the only path that
        // triggers handleSubmit from the keyboard.
        dom.queryInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
          }
          // Plain Enter: let the textarea insert a newline (no-op here).
        });
        dom.btnSkip.addEventListener("click", handleSkip);
        dom.btnNext.addEventListener("click", handleNext);
        if (dom.btnPrev) dom.btnPrev.addEventListener("click", handlePrevious);
        if (dom.togContext) dom.togContext.addEventListener("click", function () { toggleAids("context"); });
        if (dom.togGuide) dom.togGuide.addEventListener("click", function () { toggleAids("guide"); });

        // Side menu toggle buttons
        if (dom.btnSidebarCollapse) {
          dom.btnSidebarCollapse.addEventListener("click", toggleMenu);
        }
        if (dom.btnSidebarExpand) {
          dom.btnSidebarExpand.addEventListener("click", toggleMenu);
        }
        // Reflect the persisted menuCollapsed state on first render.
        if (dom.exerciseArea) {
          dom.exerciseArea.classList.add("with-sidebar");
        }
        if (dom.appShell) {
          dom.appShell.classList.add("with-sidebar");
          _applyMenuCollapseClass();
        }

        // Export button
        if (dom.btnExport) {
          dom.btnExport.addEventListener("click", function () { handleExport(); });
        }
        if (dom.btnExportProgress) {
          dom.btnExportProgress.addEventListener("click", function () {
            handleExport(dom.exportProgressStatus);
          });
        }
        if (dom.themeSelect) {
          dom.themeSelect.addEventListener("change", handleThemeChange);
        }

        // Import file handler
        if (dom.importFile) {
          dom.importFile.addEventListener("change", function () {
            var file = dom.importFile.files && dom.importFile.files[0];
            if (file) handleImport(file);
          });

          // Also trigger file input when the label is clicked
          var importLabel = document.querySelector('label[for="import-file"]');
          if (importLabel) {
            importLabel.addEventListener("click", function (e) {
              e.preventDefault();
              dom.importFile.click();
            });
          }
        }

        // Saved-banner handlers
        if (dom.btnContinue) {
          dom.btnContinue.addEventListener("click", handleContinue);
        }
        if (dom.btnNewSession) {
          dom.btnNewSession.addEventListener("click", handleNewSession);
        }

        // ------------------------------------------------------------------
        // Check for saved progress on load
        // ------------------------------------------------------------------
        if (window.ProgressStore && window.ProgressStore.isAvailable()) {
          window.ProgressStore.loadProgress().then(function (saved) {
            showStorageRecoveryGuidance();
            if (!saved) return;

            // Populate the name field and show the continue banner
            dom.studentNameInput.value = saved.studentName;
            if (dom.savedBanner && dom.savedBannerText) {
              var scoreDisplay = (typeof saved.score === "number" && isFinite(saved.score))
                ? saved.score.toFixed(2) : "0.00";
              var maxDisplay = (typeof saved.maxScore === "number" && isFinite(saved.maxScore))
                ? saved.maxScore.toFixed(2) : "0.00";
              dom.savedBannerText.textContent =
                "Sesión guardada de «" + saved.studentName +
                "» — Fase " + (saved.phaseIndex + 1) +
                ", Ejercicio " + (saved.exerciseIndex + 1) +
                ". Puntuación: " + scoreDisplay + " / " + maxDisplay + ".";
              dom.savedBanner.style.display = "block";
            }
          }).catch(function () {
            showStorageRecoveryGuidance();
          });
        } else {
          showStorageRecoveryGuidance();
        }
      })
      .catch(function (err) {
        if (loadingEl) {
          loadingEl.textContent = "Error al cargar el simulador: " + err.message +
            ". Asegúrate de que los archivos vendor/sql-asm.js y src/pokemon-seed.js existen.";
          loadingEl.style.color = "#E5002B";
        }
        console.error("Bootstrap error:", err);
        // The schema UI was already wired before this .catch() runs, so
        // the always-available button still works on the error screen.
      });
  }

  // ==========================================================================
  // Test hooks — only exposed when __APP_TEST_HOOKS__ is truthy.
  // During normal app runtime this block is never entered.
  // ==========================================================================
  if (window.__APP_TEST_HOOKS__) {
    window.AppTestHooks = {
      /**
       * Execute renderComplete() with injected dom and state objects.
       * Restores the original module-scoped dom/state after completion.
       * @param {object} domOverride
       * @param {object} stateOverride
       */
      renderComplete: function (domOverride, stateOverride) {
        var savedDom = dom;
        var savedState = state;
        try {
          if (domOverride) dom = domOverride;
          if (stateOverride) state = stateOverride;
          renderComplete();
        } finally {
          dom = savedDom;
          state = savedState;
        }
      },

      /**
       * Execute handlePrevious() with an injected state, dom, and
       * ProgressStore stub. Restores the original module-scoped
       * state/dom after completion. The save call is captured by
       * replacing window.ProgressStore.saveProgress with a recorder
       * the caller can inspect.
       *
       * The dom override is optional — a permissive mock is used when
       * omitted. Tests that need to assert on rendered output should
       * pass their own dom.
       *
       * @param {object} stateOverride
       * @param {object} [domOverride]
       * @param {object} [progressStoreOverride]
       * @returns {{saved: boolean, savedProgress: object|null}}
       */
      handlePrevious: function (stateOverride, domOverride, progressStoreOverride) {
        var savedState = state;
        var savedDom = dom;
        var savedProgressStore = window.ProgressStore;
        var savedCalls = null;
        var useDefaultDom = !domOverride;
        try {
          if (stateOverride) state = stateOverride;
          if (useDefaultDom) dom = _buildDefaultTestDom();
          else dom = domOverride;
          if (progressStoreOverride) {
            window.ProgressStore = progressStoreOverride;
          }
          handlePrevious();
        } finally {
          // Build the return payload after the try so we can record
          // what actually happened without an inline object literal
          // (the embedded-seed test uses a non-greedy regex on
          // AppTestHooks and an inline `};` would shadow the real
          // end-of-object marker).
          if (progressStoreOverride && progressStoreOverride.__lastCall) {
            savedCalls = { saved: true, savedProgress: progressStoreOverride.__lastCall };
          } else {
            savedCalls = { saved: false, savedProgress: null };
          }
          state = savedState;
          dom = savedDom;
          window.ProgressStore = savedProgressStore;
        }
        return savedCalls;
      },

      /**
       * Read the current btn-prev enabled state via the same code path the
       * production UI uses. Exposed so tests can verify the disabled
       * attribute is set correctly on the first exercise.
       * @param {object} stateOverride
       * @returns {boolean} true if btn-prev should be enabled
       */
      isPrevEnabled: function (stateOverride) {
        var savedState = state;
        try {
          if (stateOverride) state = stateOverride;
          return !(state.phaseIndex === 0 && state.exerciseIndex === 0);
        } finally {
          state = savedState;
        }
      },

      /**
       * Execute updateNavButtons() with injected dom and state objects.
       * Restores the original module-scoped dom/state after completion.
       * Exposed so tests can verify the externally visible contract:
       * after the production UI runs, btn-prev must NOT have display:none.
       * @param {object} domOverride
       * @param {object} stateOverride
       */
      updateNavButtons: function (domOverride, stateOverride) {
        var savedDom = dom;
        var savedState = state;
        try {
          if (domOverride) dom = domOverride;
          if (stateOverride) state = stateOverride;
          updateNavButtons();
        } finally {
          dom = savedDom;
          state = savedState;
        }
      },

      /**
       * Execute renderResultTable() with injected dom.
       * @param {object} domOverride
       * @param {object} studentResult
       */
      renderResultTable: function (domOverride, studentResult) {
        var savedDom = dom;
        try {
          if (domOverride) dom = domOverride;
          renderResultTable(studentResult);
        } finally {
          dom = savedDom;
        }
      },

      /**
       * Execute initEngine() — returns the same Promise initEngine returns.
       * Used by tests to verify the bootstrap no longer attempts WASM
       * binary loading for any protocol.
       * @returns {Promise<unknown>}
       */
      initEngine: function () {
        return initEngine();
      },

      /** Recalculate per-exercise earned credit for scoring tests. */
      recalculateScore: function (stateOverride) {
        var savedState = state;
        try {
          if (stateOverride) state = stateOverride;
          _recalculateScore();
          return state.score;
        } finally {
          state = savedState;
        }
      },

      /** Recalculate mastery-based recognition with injected attempt history. */
      recalculateRewards: function (stateOverride) {
        var savedState = state;
        try {
          if (stateOverride) state = stateOverride;
          _recalculateRewards();
          return state.rewards;
        } finally {
          state = savedState;
        }
      },

      /** Render learner-facing recognition with injected DOM and state. */
      renderRewards: function (domOverride, stateOverride) {
        var savedDom = dom;
        var savedState = state;
        try {
          if (domOverride) dom = domOverride;
          if (stateOverride) state = stateOverride;
          renderRewards();
        } finally {
          dom = savedDom;
          state = savedState;
        }
      },

      showRewardUnlock: function (domOverride, rewardIds) {
        var savedDom = dom;
        try {
          if (domOverride) dom = domOverride;
          _showRewardUnlock(rewardIds);
        } finally {
          dom = savedDom;
        }
      },

      dismissRewardUnlock: function (domOverride) {
        var savedDom = dom;
        try {
          if (domOverride) dom = domOverride;
          _dismissRewardUnlock();
        } finally {
          dom = savedDom;
        }
      },

      /** Restore saved progress with injected state and DOM for regression tests. */
      restoreFromProgress: function (domOverride, stateOverride, progress) {
        var savedDom = dom;
        var savedState = state;
        try {
          if (domOverride) dom = domOverride;
          if (stateOverride) state = stateOverride;
          _restoreFromProgress(progress);
          return state;
        } finally {
          dom = savedDom;
          state = savedState;
        }
      },

      /** Run the production export path with injected state and DOM. */
      handleExport: function (stateOverride, domOverride) {
        var savedState = state;
        var savedDom = dom;
        try {
          if (stateOverride) state = stateOverride;
          if (domOverride) dom = domOverride;
          handleExport();
        } finally {
          state = savedState;
          dom = savedDom;
        }
      },

      applyTheme: function (theme, domOverride) {
        var savedDom = dom;
        try {
          if (domOverride) dom = domOverride;
          return _applyTheme(theme);
        } finally {
          dom = savedDom;
        }
      },

      handleThemeChange: function (domOverride) {
        var savedDom = dom;
        try {
          if (domOverride) dom = domOverride;
          return handleThemeChange();
        } finally {
          dom = savedDom;
        }
      },

      /** Schedule a transient confirmation dismissal for deterministic timer tests. */
      showTransientMessage: function (element, dismiss) {
        _showTransientMessage(element, dismiss);
      },

      /** Cancel pending transient confirmation dismissals for deterministic timer tests. */
      clearTransientMessages: function () {
        _clearTransientMessages();
      },

      /** Show persistence recovery guidance with an injected DOM and store. */
      showStorageRecoveryGuidance: function (domOverride, progressStoreOverride) {
        var savedDom = dom;
        var savedProgressStore = window.ProgressStore;
        try {
          if (domOverride) dom = domOverride;
          if (progressStoreOverride) window.ProgressStore = progressStoreOverride;
          showStorageRecoveryGuidance();
        } finally {
          dom = savedDom;
          window.ProgressStore = savedProgressStore;
        }
      },

      /**
       * Execute loadSeed() — returns the same Promise loadSeed returns.
       * Used by tests to verify the embedded-seed-first / XHR-fallback
       * strategy. Tests inject window.POKEMON_SEED and/or override
       * XMLHttpRequest to assert the chosen path.
       * @returns {Promise<Uint8Array>}
       */
      loadSeed: function () {
        return loadSeed();
      },

      /**
       * Wire the schema-reference modal listeners. Used by tests to
       * exercise the modal lifecycle (open / close / Escape / overlay
       * click) without running the full bootstrap. The production
       * bootstrap() calls this BEFORE initEngine() so the modal is
       * always available (R3-003).
       */
      wireSchemaUI: function () {
        wireSchemaUI();
      },

      /**
       * Cache DOM element references into the module-scoped `dom` object.
       * The first half of bootstrap() is shared with the test suite so
       * modal tests can drive the same code path the production app uses.
       */
      cacheDom: function () {
        cacheDom();
      },

      /**
       * Open the schema modal. Lazy-builds the table list on first open.
       */
      openSchemaModal: function () {
        openSchemaModal();
      },

      /**
       * Close the schema modal.
       */
      closeSchemaModal: function () {
        closeSchemaModal();
      },

      /**
       * Toggle the schema modal.
       */
      toggleSchemaModal: function () {
        toggleSchemaModal();
      },

      /**
       * Select a table in the schema modal. Updates the right pane and
       * the active item styling.
       * @param {string} name
       */
      selectSchemaTable: function (name) {
        selectSchemaTable(name);
      },

      /**
       * Build the table-list buttons inside the schema modal.
       */
      renderSchemaTableList: function () {
        renderSchemaTableList();
      },

      /**
       * Render the right-hand detail pane for the given table name.
       * @param {string} name
       */
      renderSchemaDetail: function (name) {
        renderSchemaDetail(name);
      },

      /**
       * Render the "schema unavailable" state in the detail pane.
       * Used by tests to assert the graceful-failure path (RESILIENCE-002).
       * @param {string} message
       */
      renderSchemaUnavailable: function (message) {
        renderSchemaUnavailable(message);
      },

      /**
       * Compute the display status for a given phase/exercise pair
       * (one of "solved" | "skipped" | "current" | "locked"). Exposed
       * so menu tests can assert on the routing logic without
       * re-rendering the menu DOM.
       *
       * @param {number} phaseIndex
       * @param {number} exerciseIndex
       * @param {object} [stateOverride]
       * @returns {string}
       */
      menuStatusFor: function (phaseIndex, exerciseIndex, stateOverride) {
        var savedState = state;
        try {
          if (stateOverride) state = stateOverride;
          return _menuStatusFor(phaseIndex, exerciseIndex);
        } finally {
          state = savedState;
        }
      },

      /**
       * Render the side menu into the supplied dom. Returns the count
       * of items rendered (one per exercise across all phases).
       * @param {object} domOverride
       * @param {object} [stateOverride]
       * @returns {number}
       */
      renderMenu: function (domOverride, stateOverride) {
        var savedDom = dom;
        var savedState = state;
        try {
          if (domOverride) dom = domOverride;
          if (stateOverride) state = stateOverride;
          renderMenu();
        } finally {
          dom = savedDom;
          state = savedState;
        }
        return domOverride && domOverride.sidebarList ? domOverride.sidebarList.children.length : 0;
      },

      /**
       * Toggle the side menu (collapsed/expanded). Mirrors the
       * production toggleMenu function but with a side-effect
       * recorder so tests can verify the persisted state.
       *
       * @param {object} [stateOverride]
       * @param {object} [domOverride]
       * @returns {{menuCollapsed: boolean}}
       */
      toggleMenu: function (stateOverride, domOverride) {
        var savedState = state;
        var savedDom = dom;
        try {
          if (stateOverride) state = stateOverride;
          if (domOverride) dom = domOverride;
          toggleMenu();
        } finally {
          var result = { menuCollapsed: state.menuCollapsed === true };
          state = savedState;
          dom = savedDom;
          return result;
        }
      },

      /**
       * Navigate to a phase/exercise via the side-menu path. Mirrors
       * _navigateToMenuExercise but accepts injected state, dom, and
       * ProgressStore. Returns whether the navigation happened, plus
       * the saved progress (if any) so tests can assert on the save
       * payload.
       *
       * @param {number} phaseIndex
       * @param {number} exerciseIndex
       * @param {object} stateOverride
       * @param {object} domOverride
       * @param {object} [progressStoreOverride]
       * @returns {{navigated: boolean, saved: boolean, savedProgress: object|null}}
       */
      navigateToMenuExercise: function (phaseIndex, exerciseIndex, stateOverride, domOverride, progressStoreOverride) {
        var savedState = state;
        var savedDom = dom;
        var savedProgressStore = window.ProgressStore;
        var useDefaultDom = !domOverride;
        var result;
        try {
          if (stateOverride) state = stateOverride;
          if (useDefaultDom) dom = _buildDefaultTestDom();
          else dom = domOverride;
          if (progressStoreOverride) window.ProgressStore = progressStoreOverride;
          var status = _menuStatusFor(phaseIndex, exerciseIndex);
          if (status === "locked") {
            result = { navigated: false, saved: false, savedProgress: null };
          } else {
            _navigateToMenuExercise(phaseIndex, exerciseIndex);
            var lastCall = progressStoreOverride && progressStoreOverride.__lastCall;
            result = {
              navigated: true,
              saved: !!lastCall,
              savedProgress: lastCall || null,
            };
          }
        } finally {
          state = savedState;
          dom = savedDom;
          window.ProgressStore = savedProgressStore;
        }
        return result;
      },

      /**
       * Execute handleSkip() with injected state/dom. The test mock
       * dom's queryInput/textContent and feedbackOk reflect what the
       * production function would do, so tests can assert on the
       * post-skip DOM (e.g. that the reference solution is NOT shown).
       *
       * @param {object} stateOverride
       * @param {object} domOverride
       * @returns {{saved: boolean, savedProgress: object|null}}
       */
      handleSkip: function (stateOverride, domOverride) {
        var savedState = state;
        var savedDom = dom;
        var savedProgressStore = window.ProgressStore;
        var useDefaultDom = !domOverride;
        var result;
        try {
          if (stateOverride) state = stateOverride;
          if (useDefaultDom) dom = _buildDefaultTestDom();
          else dom = domOverride;
          // Inject a permissive ProgressStore so saveCurrentProgress is
          // captured. Tests can inspect result.savedProgress.
          var stub = {
            isAvailable: function () { return true; },
            saveProgress: function (p) { stub.__lastCall = p; return Promise.resolve(); },
            __lastCall: null,
          };
          window.ProgressStore = stub;
          handleSkip();
          result = {
            saved: !!stub.__lastCall,
            savedProgress: stub.__lastCall,
          };
        } finally {
          state = savedState;
          dom = savedDom;
          window.ProgressStore = savedProgressStore;
        }
        return result;
      },

      /**
       * Read the current menuCollapsed flag. Exposed so tests can
       * verify the toggle persists state correctly.
       * @param {object} [stateOverride]
       * @returns {boolean}
       */
      isMenuCollapsed: function (stateOverride) {
        var savedState = state;
        try {
          if (stateOverride) state = stateOverride;
          return state.menuCollapsed === true;
        } finally {
          state = savedState;
        }
      },

      /**
       * Execute renderPhaseExerciseRestored() with injected dom and
       * state. Restores the original module-scoped dom/state after
       * completion. Exposed so tests can verify the contract for a
       * restored exercise (e.g. skipped state must keep btnNext
       * visible — RELIABILITY-001).
       *
       * @param {object} [domOverride]
       * @param {object} [stateOverride]
       */
      renderPhaseExerciseRestored: function (domOverride, stateOverride) {
        var savedDom = dom;
        var savedState = state;
        var useDefaultDom = !domOverride;
        try {
          if (useDefaultDom) dom = _buildDefaultTestDom();
          else dom = domOverride;
          if (stateOverride) state = stateOverride;
          renderPhaseExerciseRestored();
        } finally {
          dom = savedDom;
          state = savedState;
        }
      },

      /**
       * Execute renderPhaseExercise() with injected dom and state.
       * Restores the original module-scoped dom/state after completion.
       * Exposed so tests can verify the contract for an in-session
       * exercise render (e.g. after navigating back to a skipped
       * exercise via handlePrevious — RELIABILITY-001).
       *
       * @param {object} [domOverride]
       * @param {object} [stateOverride]
       */
      renderPhaseExercise: function (domOverride, stateOverride) {
        var savedDom = dom;
        var savedState = state;
        var useDefaultDom = !domOverride;
        try {
          if (useDefaultDom) dom = _buildDefaultTestDom();
          else dom = domOverride;
          if (stateOverride) state = stateOverride;
          renderPhaseExercise();
        } finally {
          dom = savedDom;
          state = savedState;
        }
      },
    };
  }

  // ==========================================================================
  // Internal test helper — a permissive mock dom for the test hooks.
  // Only referenced when a test calls a hook without supplying a dom.
  // Not part of the production app surface.
  // ==========================================================================
  function _buildDefaultTestDom() {
    function el() {
      return {
        style: {},
        className: "",
        textContent: "",
        innerHTML: "",
        children: [],
        disabled: false,
        hidden: false,
        _attrs: {},
        appendChild: function (c) { this.children.push(c); return c; },
        removeChild: function () {},
        setAttribute: function (k, v) { this._attrs[k] = v; },
        removeAttribute: function (k) { delete this._attrs[k]; },
        getAttribute: function (k) { return this._attrs[k] != null ? this._attrs[k] : null; },
        addEventListener: function () {},
        querySelectorAll: function () { return []; },
        classList: {
          add: function () {},
          remove: function () {},
          toggle: function () {},
          contains: function () { return false; },
        },
        focus: function () {},
      };
    }
    return {
      startScreen: el(),
      exerciseArea: el(),
      completeScreen: el(),
      statusBar: el(),
      statusPhase: el(),
      statusStep: el(),
      statusScore: el(),
      progressFill: el(),
      rewardsSummary: el(),
      rewardsList: el(),
      studentNameInput: el(),
      btnStart: el(),
      nameError: el(),
      savedBanner: el(),
      savedBannerText: el(),
      btnContinue: el(),
      btnNewSession: el(),
      importFile: el(),
      importError: el(),
      importOk: el(),
      exerciseCard: el(),
      modeBadge: el(),
      exerciseTitle: el(),
      exerciseEnunciado: el(),
      expectedSqlDisplay: el(),
      expectedSqlText: el(),
      aidsRow: el(),
      togContext: el(),
      togGuide: el(),
      aidsContextBox: el(),
      aidsContext: el(),
      aidsGuideBox: el(),
      aidsGuide: el(),
      solutionNote: el(),
      solutionNoteText: el(),
      hintsWrap: el(),
      queryInput: el(),
      btnSubmit: el(),
      btnSkip: el(),
      btnNext: el(),
      btnPrev: el(),
      feedbackOk: el(),
      feedbackOkContent: el(),
      feedbackOkSql: el(),
      feedbackErr: el(),
      feedbackErrContent: el(),
      feedbackErrDetail: el(),
      resultDisplay: el(),
      resultContent: el(),
      finalStudent: el(),
      finalScore: el(),
      finalPct: el(),
      finalMotivation: el(),
      finalDetail: el(),
      btnExport: el(),
      exportStatus: el(),
      btnExportProgress: el(),
      exportProgressStatus: el(),
      themeSelect: el(),
      storageWarning: el(),
      btnSchema: el(),
      schemaModal: el(),
      btnSchemaClose: el(),
      schemaList: el(),
      schemaDetail: el(),
      preflightErr: el(),
      // Side menu
      appShell: el(),
      sidebar: el(),
      sidebarList: el(),
      btnSidebarCollapse: el(),
      btnSidebarExpand: el(),
      sidebarFloatingToggle: el(),
    };
  }

  // Start when the DOM is ready (skip in test mode)
  if (!window.__APP_TEST_MODE__) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
      bootstrap();
    }
  }
})();
