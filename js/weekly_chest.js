// ============================================================
// Weekly Chest
//
// Data lives in data/weekly-chest.json (fetched at runtime, same
// pattern as data/sentences.json) with shape:
//   { "rotation": { "key": "DD/MM/YYYY" | "no_rotation", ... },
//     "chestAssign": { "key": 1, ... } }
// Local overrides (edited in-tab) are merged on top so dates can
// be changed without touching logic. "Current/Next week" chests
// are computed automatically from the rotation dates.
// ============================================================

const WC_DATA_FILE = "data/weekly-chest.json";
const WC_OVERRIDES_KEY = "labophase.wc.overrides";
const WC_CHEST_OVERRIDES_KEY = "labophase.wc.chests";
let WC_OVERRIDES = {};
let WC_CHEST_OVERRIDES = {};
let WC_EDITING = false;
let WC_ROTATION = {};
let WC_CHEST_ASSIGN = {};
let WC_DATA_LOADED = false;

// ------------------------------------------------------------
// Overrides (local edit mode)
// ------------------------------------------------------------

function wcReadOverrides() {
  try {
    const raw = window.localStorage ? localStorage.getItem(WC_OVERRIDES_KEY) : "";
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function wcWriteOverrides(overrides) {
  try {
    if (window.localStorage) localStorage.setItem(WC_OVERRIDES_KEY, JSON.stringify(overrides));
  } catch (_err) {
    // Ignore storage write failures.
  }
}

function wcReadChestOverrides() {
  try {
    const raw = window.localStorage ? localStorage.getItem(WC_CHEST_OVERRIDES_KEY) : "";
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_err) {
    return {};
  }
}

function wcWriteChestOverrides() {
  try {
    if (window.localStorage) localStorage.setItem(WC_CHEST_OVERRIDES_KEY, JSON.stringify(WC_CHEST_OVERRIDES));
  } catch (_err) {
    // Ignore storage write failures.
  }
}

function wcDateTime(dateStr) {
  if (!dateStr || dateStr === "no_rotation") return null;
  const ms = wcParseDate(dateStr).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function wcPickMostRecent(baseVal, localVal) {
  const baseMs = wcDateTime(baseVal);
  const localMs = wcDateTime(localVal);
  if (baseMs === null && localMs === null) {
    return localVal || baseVal || "no_rotation";
  }
  if (baseMs === null) return localVal;
  if (localMs === null) return baseVal;
  return localMs >= baseMs ? localVal : baseVal;
}

function wcGetRotationData() {
  let base = {};
  if (typeof WC_ROTATION === "object" && WC_ROTATION) base = WC_ROTATION;
  const merged = {};
  for (const key in base) merged[key] = base[key];

  // In edit mode the user is crafting the data, so the local value wins
  // as typed. Outside edit mode the most recent date between the server
  // default and the local override always wins, so stale overrides no
  // longer shadow newer published data.
  if (WC_EDITING) {
    for (const key in WC_OVERRIDES) merged[key] = WC_OVERRIDES[key];
    return merged;
  }

  for (const key in WC_OVERRIDES) {
    merged[key] = wcPickMostRecent(base[key], WC_OVERRIDES[key]);
  }
  return merged;
}

function wcSetOverride(key, dateStr) {
  const base = (typeof WC_ROTATION === "object" && WC_ROTATION
    && Object.prototype.hasOwnProperty.call(WC_ROTATION, key)) ? WC_ROTATION[key] : undefined;
  if (base !== undefined && dateStr === base) {
    delete WC_OVERRIDES[key];
  } else {
    WC_OVERRIDES[key] = dateStr;
  }
  wcWriteOverrides(WC_OVERRIDES);
  wcRefreshAll();
}

function wcClearOverrides() {
  WC_OVERRIDES = {};
  WC_CHEST_OVERRIDES = {};
  wcWriteOverrides(WC_OVERRIDES);
  wcWriteChestOverrides();
  wcRefreshAll();
}

// ------------------------------------------------------------
// Profile integration (export/import junto com o perfil)
// ------------------------------------------------------------

function weeklyChestGetState() {
  const hasDate = Object.keys(WC_OVERRIDES).length > 0;
  const hasChest = Object.keys(WC_CHEST_OVERRIDES).length > 0;
  if (!hasDate && !hasChest) return null;
  return {
    overrides: JSON.parse(JSON.stringify(WC_OVERRIDES)),
    chestOverrides: JSON.parse(JSON.stringify(WC_CHEST_OVERRIDES))
  };
}

function applyWeeklyChestState(state) {
  if (!state || typeof state !== "object") return;
  const overrides = (state.overrides && typeof state.overrides === "object" && !Array.isArray(state.overrides))
    ? state.overrides : {};
  const chestOverrides = (state.chestOverrides && typeof state.chestOverrides === "object" && !Array.isArray(state.chestOverrides))
    ? state.chestOverrides : {};

  WC_OVERRIDES = {};
  WC_CHEST_OVERRIDES = {};
  wcWriteOverrides(WC_OVERRIDES);
  wcWriteChestOverrides();

  for (const key in overrides) wcSetOverride(key, overrides[key]);
  for (const key in chestOverrides) {
    const n = parseInt(chestOverrides[key], 10);
    wcSetChestOverride(key, Number.isFinite(n) ? n : null);
  }
}

function wcSetChestOverride(key, num) {
  const base = (typeof WC_CHEST_ASSIGN === "object" && WC_CHEST_ASSIGN && WC_CHEST_ASSIGN[key] !== undefined)
    ? parseInt(WC_CHEST_ASSIGN[key], 10)
    : null;
  const derived = WC_DERIVED_CHEST[key] || null;
  const clean = (Number.isFinite(num) && num > 0) ? num : null;
  if (clean !== null && (clean === base || clean === derived)) {
    delete WC_CHEST_OVERRIDES[key];
  } else if (clean !== null) {
    WC_CHEST_OVERRIDES[key] = String(clean);
  } else {
    delete WC_CHEST_OVERRIDES[key];
  }
  wcWriteChestOverrides();
  wcRefreshAll();
}

// ------------------------------------------------------------
// Current / Next chest groups (auto-computed from dates)
// ------------------------------------------------------------

let WC_CURRENT_SET = new Set();

// Derived chest number per character (chunk of a rotation group in data order)
let WC_DERIVED_CHEST = {};

const WC_CHARS_PER_CHEST = 3;

function wcGetChest(key) {
  if (WC_CHEST_OVERRIDES[key] !== undefined) {
    const n = parseInt(WC_CHEST_OVERRIDES[key], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const base = (typeof WC_CHEST_ASSIGN === "object" && WC_CHEST_ASSIGN && WC_CHEST_ASSIGN[key] !== undefined)
    ? parseInt(WC_CHEST_ASSIGN[key], 10)
    : 0;
  if (Number.isFinite(base) && base > 0) return base;
  return WC_DERIVED_CHEST[key] || null;
}

function wcComputeChestSets() {
  const data = wcGetRotationData();
  const now = Date.now();
  const groups = new Map();
  for (const [key, dateStr] of Object.entries(data)) {
    if (!dateStr || dateStr === "no_rotation") continue;
    const ms = wcParseDate(dateStr).getTime();
    if (!groups.has(ms)) groups.set(ms, []);
    groups.get(ms).push(key);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]);

  WC_DERIVED_CHEST = {};
  for (const [, keys] of ordered) {
    keys.forEach((key, i) => {
      WC_DERIVED_CHEST[key] = Math.floor(i / WC_CHARS_PER_CHEST) + 1;
    });
  }

  function toRows(keys) {
    const byNum = new Map();
    for (const key of keys) {
      const num = wcGetChest(key);
      if (num === null) continue;
      if (!byNum.has(num)) byNum.set(num, []);
      byNum.get(num).push(key);
    }
    return [...byNum.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([num, chars]) => ({ num, chars }));
  }

  let currentIdx = -1;
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i][0] <= now) currentIdx = i;
  }

  if (currentIdx === -1) {
    const nextKeys = ordered.length ? ordered[0][1] : [];
    return { current: [], next: toRows(nextKeys), currentKeys: [], nextKeys };
  }
  const currentKeys = ordered[currentIdx][1];
  const nextKeys = currentIdx + 1 < ordered.length ? ordered[currentIdx + 1][1] : [];
  return { current: toRows(currentKeys), next: toRows(nextKeys), currentKeys, nextKeys };
}

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

const WC_CLASS_DEFS = [
  { key: "tank",    icon: "sprites/icons_classes/icon_tank.png",    labelKey: "charactersGroupTank" },
  { key: "bruiser", icon: "sprites/icons_classes/icon_bruiser.png", labelKey: "charactersGroupBruiser" },
  { key: "dps",     icon: "sprites/icons_classes/icon_dps.png",     labelKey: "charactersGroupDps" },
  { key: "support", icon: "sprites/icons_classes/icon_support.png", labelKey: "charactersGroupSupport" },
];

// spriteId -> class key, built once from CHARACTER_GROUPS_CONFIG
let WC_SPRITE_CLASS = null;

function wcBuildSpriteClassMap() {
  WC_SPRITE_CLASS = {};
  if (typeof CHARACTER_GROUPS_CONFIG === "undefined") return;
  for (const cls of ["tank", "bruiser", "dps", "support"]) {
    for (const spriteId of (CHARACTER_GROUPS_CONFIG[cls] || [])) {
      WC_SPRITE_CLASS[spriteId] = cls;
    }
  }
}

// Keys from rotation data that differ from CHARACTER_NAME_TO_SPRITE_ID
const WC_EXTRA_KEY_MAP = {
  "buchi_&_sham": "bucchi_sham",
  "miss_doublefinger_(zala)": "miss_doublefinger",
  "mr._1": "mr_1",
  "mr._2": "mr_2",
  "mr._3": "mr_3",
  "mr._4": "mr_4",
  "mr._5": "mr_5"
};

function wcGetSpriteId(key) {
  if (WC_EXTRA_KEY_MAP[key]) return WC_EXTRA_KEY_MAP[key];
  if (CHARACTER_NAME_TO_SPRITE_ID[key]) return CHARACTER_NAME_TO_SPRITE_ID[key];
  return key;
}

function wcGetDisplayName(spriteId) {
  const ov = typeof CHARACTER_OVERRIDES !== "undefined" && CHARACTER_OVERRIDES[spriteId];
  if (ov && ov.name) return ov.name;
  return spriteId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function wcParseDate(dateStr) {
  const parts = dateStr.split("/");
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  let year = parts.length >= 3 ? parseInt(parts[2], 10) : new Date().getFullYear();
  return new Date(year, month - 1, day);
}

function wcToInputDate(dateStr) {
  const parts = dateStr.split("/");
  const day = parts[0].padStart(2, "0");
  const month = parts[1].padStart(2, "0");
  const year = parts[2] || new Date().getFullYear();
  return `${year}-${month}-${day}`;
}

function wcFromInputDate(iso) {
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function wcGetStatus(key, dateStr) {
  if (WC_CURRENT_SET.has(key)) return "current";
  if (!dateStr || dateStr === "no_rotation") return "no_rotation";
  const diffDays = (Date.now() - wcParseDate(dateStr).getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "purple";  // Future date
  if (diffDays <= 30) return "yellow";
  if (diffDays <= 60) return "orange";
  return "red";
}

function wcNormalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wcMatchesSearch(key, spriteId, query) {
  if (!query) return true;
  const q = wcNormalize(query);
  if (wcNormalize(key.replace(/[_&.()/]/g, " ")).includes(q)) return true;
  if (wcNormalize(wcGetDisplayName(spriteId)).includes(q)) return true;
  const ov = typeof CHARACTER_OVERRIDES !== "undefined" && CHARACTER_OVERRIDES[spriteId];
  if (ov && ov.aliases) {
    for (const alias of ov.aliases) {
      if (wcNormalize(alias).includes(q)) return true;
    }
  }
  return false;
}

// ------------------------------------------------------------
// Rendering
// ------------------------------------------------------------

function wcBuildChestChar(key) {
  const spriteId = wcGetSpriteId(key);
  const displayName = wcGetDisplayName(spriteId);
  return (
    `<div class="wc-chest-char" title="${displayName}">` +
      `<div class="wc-chest-char-sprite-wrap">` +
        `<img class="wc-chest-char-sprite" src="sprites/characters/${spriteId}.png" alt="${displayName}" onerror="this.onerror=null;this.src='sprites/branding/logo_0.png';" />` +
      `</div>` +
      `<div class="wc-chest-char-name">${displayName}</div>` +
    `</div>`
  );
}

function wcRenderChests() {
  const currentContainer = document.getElementById("wc-current-chests");
  const nextContainer = document.getElementById("wc-next-chests");
  if (!currentContainer || !nextContainer) return;

  const { current: currentRows, next: nextRows } = wcComputeChestSets();

  function buildRows(rows, emptyKey) {
    if (!rows.length) {
      return WC_DATA_LOADED
        ? `<p class="wc-empty-note">${t(emptyKey)}</p>`
        : `<p class="wc-empty-note">${t("wcLoading")}</p>`;
    }
    return rows.map((row) => {
      const chars = row.chars.map((key) => wcBuildChestChar(key)).join("");
      return (
        `<div class="wc-chest-row">` +
          `<span class="wc-chest-row-label">${t("wcChestLabel")} ${row.num}</span>` +
          `<div class="wc-chest-row-chars">${chars}</div>` +
        `</div>`
      );
    }).join("");
  }

  currentContainer.innerHTML = buildRows(currentRows, "wcNoCurrentChest");
  nextContainer.innerHTML = buildRows(nextRows, "wcNoNextChest");
}

function wcBuildCard(key, dateStr) {
  const spriteId = wcGetSpriteId(key);
  const displayName = wcGetDisplayName(spriteId);
  const status = wcGetStatus(key, dateStr);
  const chest = wcGetChest(key);
  const isOverridden = Object.prototype.hasOwnProperty.call(WC_OVERRIDES, key)
    || Object.prototype.hasOwnProperty.call(WC_CHEST_OVERRIDES, key);
  const dateLabel = (!dateStr || dateStr === "no_rotation") ? "&mdash;" : dateStr;

  let editRow = "";
  if (WC_EDITING) {
    const isNoRotation = (dateStr === "no_rotation");
    const inputDate = (!dateStr || isNoRotation) ? "" : wcToInputDate(dateStr);
    const noRotChecked = isNoRotation ? " checked" : "";
    editRow =
      `<div class="wc-edit-cols">` +
        `<div class="wc-edit-line wc-edit-line-bau">` +
          `<input type="number" class="wc-edit-bau" data-wc-key="${key}" min="1" max="9" value="${chest !== null ? chest : ""}" aria-label="${t("wcChestLabel")}" title="${t("wcChestLabel")}" />` +
          `<label class="wc-edit-norot" title="${t("wcNoRotationFlag")}">` +
            `<input type="checkbox" class="wc-edit-norot-cb" data-wc-key="${key}"${noRotChecked} />` +
            `<span>NR</span>` +
          `</label>` +
          (isOverridden
            ? `<button type="button" class="wc-edit-revert" data-wc-key="${key}" title="${t("wcRevertDate")}" aria-label="${t("wcRevertDate")}">↺</button>`
            : "") +
        `</div>` +
        (isNoRotation
          ? ""
          : `<div class="wc-edit-line wc-edit-line-date">` +
              `<input type="date" class="wc-edit-date" data-wc-key="${key}" value="${inputDate}" aria-label="Date" />` +
            `</div>`) +
      `</div>`;
  }

  return (
    `<div class="wc-char-card wc-status-${status}${isOverridden ? " wc-is-overridden" : ""}" title="${displayName}">` +
      `<div class="wc-char-sprite-wrap">` +
        `<img class="wc-char-sprite" src="sprites/characters/${spriteId}.png" alt="${displayName}" onerror="this.onerror=null;this.src='sprites/branding/logo_0.png';" />` +
        `<div class="wc-char-date wc-date-${status}">${dateLabel}</div>` +
      `</div>` +
      `<div class="wc-char-name">${displayName}</div>` +
      editRow +
    `</div>`
  );
}

// Pre-computed per-character data built once per refresh; avoids repeated lookups inside sort
let WC_CHAR_CACHE = null;

function wcBuildCharCache() {
  if (!WC_SPRITE_CLASS) wcBuildSpriteClassMap();
  const now = Date.now();
  WC_CHAR_CACHE = Object.entries(wcGetRotationData()).map(([key, dateStr]) => {
    const spriteId = wcGetSpriteId(key);
    const displayName = wcGetDisplayName(spriteId);
    const isCurrent = WC_CURRENT_SET.has(key);
    const sortDate = (!dateStr || dateStr === "no_rotation")
      ? -Infinity
      : (isCurrent ? now : wcParseDate(dateStr).getTime());
    const charClass = WC_SPRITE_CLASS[spriteId] || null;
    const cardHtml = wcBuildCard(key, dateStr);
    return { key, dateStr, spriteId, displayName, sortName: displayName.toLowerCase(), sortDate, charClass, cardHtml };
  });
}

function wcRender() {
  const container = document.getElementById("wc-grid");
  if (!container) return;
  if (!WC_CHAR_CACHE) wcBuildCharCache();
  if (!WC_DATA_LOADED) {
    container.innerHTML = `<p class="wc-no-results">${t("wcLoading")}</p>`;
    return;
  }

  const query = (document.getElementById("wc-search-input") || {}).value || "";
  const hideNoRot = !!(document.getElementById("wc-hide-no-rotation") || {}).checked;
  const sortMode = (document.getElementById("wc-sort-select") || {}).value || "name_az";

  const entries = WC_CHAR_CACHE.slice();

  switch (sortMode) {
    case "name_za":     entries.sort((a, b) => b.sortName.localeCompare(a.sortName)); break;
    case "date_newest": entries.sort((a, b) => b.sortDate - a.sortDate);              break;
    case "date_oldest": entries.sort((a, b) => a.sortDate - b.sortDate);              break;
    default:            entries.sort((a, b) => a.sortName.localeCompare(b.sortName)); break;
  }

  const activeClasses = new Set(
    [...document.querySelectorAll(".wc-class-btn.is-active")].map((b) => b.dataset.wcClass)
  );

  let html = "";
  let count = 0;
  for (const entry of entries) {
    if (hideNoRot && (!entry.dateStr || entry.dateStr === "no_rotation")) continue;
    if (activeClasses.size > 0 && !activeClasses.has(entry.charClass)) continue;
    if (!wcMatchesSearch(entry.key, entry.spriteId, query)) continue;
    html += entry.cardHtml;
    count++;
  }

  container.innerHTML = count === 0
    ? `<p class="wc-no-results">${t("wcNoResults")}</p>`
    : html;
}

function wcRefreshAll() {
  const { currentKeys } = wcComputeChestSets();
  WC_CURRENT_SET = new Set(currentKeys);
  wcBuildCharCache();
  wcRenderChests();
  wcRender();
  wcUpdateEditBar();
}

function wcUpdateEditBar() {
  const bar = document.getElementById("wc-edit-bar");
  if (bar) bar.classList.toggle("is-open", WC_EDITING);
  const toggle = document.getElementById("wc-edit-toggle-btn");
  if (toggle) toggle.classList.toggle("is-active", WC_EDITING);
  const countEl = document.getElementById("wc-changes-count");
  if (countEl) {
    countEl.textContent = String(Object.keys(WC_OVERRIDES).length + Object.keys(WC_CHEST_OVERRIDES).length);
  }
}

// ------------------------------------------------------------
// Edit-mode actions
// ------------------------------------------------------------

function wcCopyCode() {
  const rotated = wcGetRotationData();
  if (typeof WC_DERIVED_CHEST !== "object" || !Object.keys(WC_DERIVED_CHEST).length) {
    wcComputeChestSets();
  }

  // Full explicit chest map: override > WC_CHEST_ASSIGN > auto-derived.
  const mergedChests = {};
  for (const key in rotated) {
    let n = null;
    if (typeof WC_CHEST_OVERRIDES === "object" && WC_CHEST_OVERRIDES[key] !== undefined) {
      n = parseInt(WC_CHEST_OVERRIDES[key], 10);
    } else if (typeof WC_CHEST_ASSIGN === "object" && WC_CHEST_ASSIGN && WC_CHEST_ASSIGN[key] !== undefined) {
      n = parseInt(WC_CHEST_ASSIGN[key], 10);
    } else if (typeof WC_DERIVED_CHEST === "object" && WC_DERIVED_CHEST[key] !== undefined) {
      n = parseInt(WC_DERIVED_CHEST[key], 10);
    }
    if (n !== null && Number.isFinite(n) && n > 0) mergedChests[key] = n;
  }
  const code = JSON.stringify({ rotation: rotated, chestAssign: mergedChests }, null, 2);

  const done = () => showToast(t("wcCodeCopied"));
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(() => {
      const reply = prompt(t("wcCopyManual"), code);
      if (reply !== null) done();
    });
  } else {
    const reply = prompt(t("wcCopyManual"), code);
    if (reply !== null) done();
  }
}

function wcBindEditDelegates() {
  const grid = document.getElementById("wc-grid");
  if (!grid) return;

  grid.addEventListener("change", (event) => {
    const target = event.target;
    if (target.classList && target.classList.contains("wc-edit-bau")) {
      const key = target.getAttribute("data-wc-key");
      if (!key) return;
      const num = parseInt(target.value, 10);
      wcSetChestOverride(key, Number.isFinite(num) ? num : null);
      return;
    }
    if (target.classList && target.classList.contains("wc-edit-date")) {
      const key = target.getAttribute("data-wc-key");
      if (!key) return;
      const iso = target.value;
      const next = iso ? wcFromInputDate(iso) : "no_rotation";
      wcSetOverride(key, next);
      return;
    }
    if (target.classList && target.classList.contains("wc-edit-norot-cb")) {
      const key = target.getAttribute("data-wc-key");
      if (!key) return;
      wcSetOverride(key, target.checked ? "no_rotation" : "");
    }
  });

  grid.addEventListener("click", (event) => {
    const target = event.target;
    if (target.closest && target.closest(".wc-edit-revert")) {
      const key = target.closest(".wc-edit-revert").getAttribute("data-wc-key");
      if (!key) return;
      delete WC_OVERRIDES[key];
      delete WC_CHEST_OVERRIDES[key];
      wcWriteOverrides(WC_OVERRIDES);
      wcWriteChestOverrides();
      wcRefreshAll();
    }
  });

  const toggle = document.getElementById("wc-edit-toggle-btn");
  if (toggle) {
    toggle.addEventListener("click", () => {
      WC_EDITING = !WC_EDITING;
      wcRefreshAll();
    });
  }

  const restore = document.getElementById("wc-edit-restore-btn");
  if (restore) restore.addEventListener("click", wcClearOverrides);

  const copy = document.getElementById("wc-edit-copy-btn");
  if (copy) copy.addEventListener("click", wcCopyCode);
}

// ------------------------------------------------------------
// Init
// ------------------------------------------------------------

function wcLoadData() {
  function onLoaded(json) {
    WC_ROTATION = (json && typeof json.rotation === "object" && json.rotation) ? json.rotation : {};
    WC_CHEST_ASSIGN = (json && typeof json.chestAssign === "object" && json.chestAssign) ? json.chestAssign : {};
    WC_DATA_LOADED = true;
    wcRefreshAll();
  }
  function onError(err) {
    WC_ROTATION = {};
    WC_CHEST_ASSIGN = {};
    WC_DATA_LOADED = true;
    console.error("Weekly Chest: could not load " + WC_DATA_FILE + ":", err);
    wcRefreshAll();
  }
  if (typeof fetch !== "function") {
    onError(new Error("fetch unavailable"));
    return Promise.resolve();
  }
  const promise = fetch(WC_DATA_FILE)
    .then(function (resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status + " loading " + WC_DATA_FILE);
      return resp.json();
    })
    .then(onLoaded)
    .catch(onError);
  return promise;
}

let _weeklyChestInitDone = false;
function weeklyChestInit() {
  if (_weeklyChestInitDone) {
    wcRefreshAll();
    return;
  }
  _weeklyChestInitDone = true;

  WC_OVERRIDES = wcReadOverrides();
  WC_CHEST_OVERRIDES = wcReadChestOverrides();
  wcLoadData();

  const searchInput = document.getElementById("wc-search-input");
  if (searchInput) {
    searchInput.placeholder = t("wcSearchPlaceholder");
    const debouncedWcRender = (typeof debounce === "function"
      ? debounce(wcRender, 140)
      : wcRender);
    searchInput.addEventListener("input", debouncedWcRender);
  }
  const cb = document.getElementById("wc-hide-no-rotation");
  if (cb) cb.addEventListener("change", wcRender);
  const sortSel = document.getElementById("wc-sort-select");
  if (sortSel) sortSel.addEventListener("change", () => requestAnimationFrame(wcRender));

  wcBuildSpriteClassMap();
  wcBuildFilterButtons();
  wcBindEditDelegates();
  wcRefreshAll();
}

function weeklyChestApplyTranslations() {
  const searchInput = document.getElementById("wc-search-input");
  if (searchInput) searchInput.placeholder = t("wcSearchPlaceholder");
  wcBuildFilterButtons();
  wcRefreshAll();
}

function wcBuildFilterButtons() {
  const row = document.getElementById("wc-filter-row");
  if (!row) return;
  row.innerHTML = WC_CLASS_DEFS.map(({ key, icon, labelKey }) =>
    `<button type="button" class="characters-filter-toggle wc-class-btn" data-wc-class="${key}" title="${t(labelKey)}">` +
      `<img src="${icon}" alt="${t(labelKey)}" />` +
      `<span>${t(labelKey)}</span>` +
    `</button>`
  ).join("");
  row.querySelectorAll(".wc-class-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("is-active");
      requestAnimationFrame(wcRender);
    });
  });
}