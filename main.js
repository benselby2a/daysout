const SUPABASE_URL = "https://cnkznpkvwoqxaiywwmhr.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xlNQ_QudJNUlMLjWpr0iJA_YgO87tox";

const UK_MAP_URL = "./data/uk.json";
const FILTER_STORAGE_KEY = "daysout.filters";
const VIEW_STORAGE_KEY = "daysout.view";

const inHub = window !== window.parent;

let db = null;
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "daysout" },
  });
}

if (inHub) {
  document.documentElement.setAttribute("data-hub", "");
}

(function initThemeToggle() {
  const saved = localStorage.getItem("daysout-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  function updateIcon() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    btn.textContent = dark ? "☀️" : "🌙";
  }
  updateIcon();
  btn.addEventListener("click", function () {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("daysout-theme", next);
    updateIcon();
    // The map paints straight from CSS custom properties, so it follows the
    // theme automatically — only the inline swatch colours need recomputing.
    render();
  });
  new MutationObserver(updateIcon).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
})();

// Institutions offered in the add/edit form and the filter row. A property can
// belong to several (an RHS Partner Garden that is also a National Trust place),
// so these are stored as a text[] rather than a single column.
const INSTITUTIONS = [
  { name: "National Trust", short: "NT", varName: "--inst-nt" },
  { name: "National Trust for Scotland", short: "NTS", varName: "--inst-nts" },
  { name: "English Heritage", short: "EH", varName: "--inst-eh" },
  { name: "Historic Environment Scotland", short: "HES", varName: "--inst-hes" },
  { name: "Cadw", short: "Cadw", varName: "--inst-cadw" },
  { name: "RHS Garden", short: "RHS", varName: "--inst-rhs" },
  { name: "RHS Partner Garden", short: "RHS Partner", varName: "--inst-rhsp" },
  { name: "Historic Houses", short: "HH", varName: "--inst-hh" },
];

const INSTITUTION_BY_NAME = new Map(INSTITUTIONS.map((i) => [i.name, i]));

function institutionColour(name) {
  const known = INSTITUTION_BY_NAME.get(name);
  const varName = known ? known.varName : "--muted";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#6b7280";
}

const state = {
  properties: [],
  visitsByProperty: new Map(),
  filters: {
    search: "",
    visited: "all",
    country: "all",
    sort: "name",
    institutions: [],
  },
  view: "list",
  mapFeatures: null,
  selectedPropertyId: null,
};

const el = {
  heroSummary: document.getElementById("hero-summary"),
  progressCards: document.getElementById("progress-cards"),
  propertyList: document.getElementById("property-list"),
  resultCount: document.getElementById("result-count"),
  institutionChips: document.getElementById("institution-chips"),
  filterSearch: document.getElementById("filter-search"),
  filterVisited: document.getElementById("filter-visited"),
  filterCountry: document.getElementById("filter-country"),
  filterSort: document.getElementById("filter-sort"),
  listTab: document.getElementById("list-tab"),
  mapTab: document.getElementById("map-tab"),
  listView: document.getElementById("list-view"),
  mapView: document.getElementById("map-view"),
  ukMap: document.getElementById("uk-map"),
  propertyModal: document.getElementById("property-modal"),
  propertyModalTitle: document.getElementById("property-modal-title"),
  propertyForm: document.getElementById("property-form"),
  propertyInstitutions: document.getElementById("property-institutions"),
  propertySubmit: document.getElementById("property-submit"),
  propertyFormError: document.getElementById("property-form-error"),
  removeProperty: document.getElementById("remove-property"),
  visitModal: document.getElementById("visit-modal"),
  visitModalProperty: document.getElementById("visit-modal-property"),
  visitForm: document.getElementById("visit-form"),
  visitHistory: document.getElementById("visit-history"),
  statusToast: document.getElementById("status-toast"),
};

/* ── Utilities ─────────────────────── */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let toastTimer = null;
function showToast(message, isError = false) {
  if (!el.statusToast) return;
  el.statusToast.textContent = message;
  el.statusToast.className = `status-toast ${isError ? "error" : "success"}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.statusToast.classList.add("hidden"), isError ? 6000 : 3000);
}

function hidePageLoading() {
  document.getElementById("page-loading-overlay")?.classList.add("hidden");
}

function formatVisitDate(iso) {
  if (!iso) return "Date not recorded";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function readFilterPrefs() {
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.assign(state.filters, {
      search: typeof saved.search === "string" ? saved.search : "",
      visited: ["all", "visited", "unvisited"].includes(saved.visited) ? saved.visited : "all",
      country: typeof saved.country === "string" ? saved.country : "all",
      sort: ["name", "location", "recent"].includes(saved.sort) ? saved.sort : "name",
      institutions: Array.isArray(saved.institutions) ? saved.institutions : [],
    });
  } catch (_) {
    // Ignore unreadable/corrupt preferences and start from the defaults.
  }
}

function writeFilterPrefs() {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state.filters));
  } catch (_) {
    // Ignore localStorage access issues (private mode, browser policy, etc.)
  }
}

function readViewPref() {
  try {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return saved === "map" ? "map" : "list";
  } catch (_) {
    return "list";
  }
}

function writeViewPref(view) {
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch (_) {
    // Ignore localStorage access issues.
  }
}

/* ── Data ──────────────────────────── */

function visitsFor(propertyId) {
  return state.visitsByProperty.get(propertyId) || [];
}

function isVisited(property) {
  return visitsFor(property.id).length > 0;
}

// Most recent recorded visit date, or null when a place is only marked as
// visited with no date. Used for the "most recently visited" sort.
function lastVisitDate(property) {
  const dated = visitsFor(property.id)
    .map((v) => v.visitedOn)
    .filter(Boolean)
    .sort();
  return dated.length ? dated[dated.length - 1] : null;
}

async function loadData() {
  if (!db) {
    showToast("Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in main.js.", true);
    return;
  }

  const [propertiesRes, visitsRes] = await Promise.all([
    db.from("properties").select("*").order("name", { ascending: true }),
    db.from("visits").select("*").order("visited_on", { ascending: true, nullsFirst: true }),
  ]);

  if (propertiesRes.error || visitsRes.error) {
    const reason = propertiesRes.error?.message || visitsRes.error?.message || "Unknown error";
    showToast(`Could not load data from Supabase: ${reason}`, true);
    return;
  }

  state.properties = (propertiesRes.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    location: p.location || "",
    country: p.country || "England",
    institutions: Array.isArray(p.institutions) ? p.institutions : [],
    latitude: p.latitude === null || p.latitude === undefined ? null : Number(p.latitude),
    longitude: p.longitude === null || p.longitude === undefined ? null : Number(p.longitude),
    website: p.website || "",
    notes: p.notes || "",
  }));

  state.visitsByProperty = new Map();
  for (const v of visitsRes.data || []) {
    const list = state.visitsByProperty.get(v.property_id) || [];
    list.push({ id: v.id, propertyId: v.property_id, visitedOn: v.visited_on, notes: v.notes || "" });
    state.visitsByProperty.set(v.property_id, list);
  }
}

/* ── Filtering ─────────────────────── */

function filteredProperties() {
  const { search, visited, country, sort, institutions } = state.filters;
  const needle = search.trim().toLowerCase();

  let rows = state.properties.filter((p) => {
    if (needle) {
      const haystack = `${p.name} ${p.location} ${p.institutions.join(" ")}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (country !== "all" && p.country !== country) return false;
    if (visited === "visited" && !isVisited(p)) return false;
    if (visited === "unvisited" && isVisited(p)) return false;
    // An empty institution filter means "no institution filter", and a property
    // matches if it belongs to any of the selected ones.
    if (institutions.length && !p.institutions.some((i) => institutions.includes(i))) return false;
    return true;
  });

  const collator = new Intl.Collator("en-GB", { sensitivity: "base" });
  rows = rows.slice().sort((a, b) => {
    if (sort === "location") {
      const byLocation = collator.compare(a.location || "￿", b.location || "￿");
      if (byLocation !== 0) return byLocation;
    }
    if (sort === "recent") {
      const aDate = lastVisitDate(a);
      const bDate = lastVisitDate(b);
      // Undated and unvisited places sort last, newest visit first.
      if (aDate !== bDate) {
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate.localeCompare(aDate);
      }
      const aVisited = isVisited(a);
      const bVisited = isVisited(b);
      if (aVisited !== bVisited) return aVisited ? -1 : 1;
    }
    return collator.compare(a.name, b.name);
  });

  return rows;
}

/* ── Rendering ─────────────────────── */

function renderHeroSummary() {
  if (!el.heroSummary) return;
  const total = state.properties.length;
  const visited = state.properties.filter(isVisited).length;
  if (!total) {
    el.heroSummary.textContent = "No properties yet — add one to get started.";
    return;
  }
  const pct = Math.round((visited / total) * 100);
  el.heroSummary.textContent = `${visited} of ${total} places visited (${pct}%) — ${total - visited} still to go.`;
}

function renderProgressCards() {
  if (!el.progressCards) return;
  const total = state.properties.length;
  const visited = state.properties.filter(isVisited).length;

  const cards = [
    `<div class="progress-card total">
      <div class="progress-card-name">All places</div>
      <div class="progress-card-value">${visited} <span>/ ${total}</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${total ? (visited / total) * 100 : 0}%"></div></div>
    </div>`,
  ];

  // Only show an institution card when the list actually contains places for it,
  // so a pared-back list does not render a row of empty cards.
  for (const institution of INSTITUTIONS) {
    const rows = state.properties.filter((p) => p.institutions.includes(institution.name));
    if (!rows.length) continue;
    const done = rows.filter(isVisited).length;
    cards.push(`<div class="progress-card">
      <div class="progress-card-name">
        <span class="progress-card-swatch" style="background:${escapeHtml(institutionColour(institution.name))}"></span>
        ${escapeHtml(institution.short)}
      </div>
      <div class="progress-card-value">${done} <span>/ ${rows.length}</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${(done / rows.length) * 100}%"></div></div>
    </div>`);
  }

  el.progressCards.innerHTML = cards.join("");
}

function renderInstitutionChips() {
  if (!el.institutionChips) return;
  // Include any institution typed in by hand alongside the built-in list.
  const custom = new Set();
  for (const p of state.properties) {
    for (const i of p.institutions) if (!INSTITUTION_BY_NAME.has(i)) custom.add(i);
  }
  const all = [
    ...INSTITUTIONS.map((i) => i.name),
    ...[...custom].sort((a, b) => a.localeCompare(b)),
  ];

  el.institutionChips.innerHTML = all
    .map((name) => {
      const count = state.properties.filter((p) => p.institutions.includes(name)).length;
      if (!count) return "";
      const active = state.filters.institutions.includes(name);
      const label = INSTITUTION_BY_NAME.get(name)?.short || name;
      return `<button type="button" class="chip-toggle" data-institution="${escapeHtml(name)}" aria-pressed="${active}">
        <span class="chip-swatch" style="background:${escapeHtml(institutionColour(name))}"></span>
        ${escapeHtml(label)}
        <span class="chip-count">${count}</span>
      </button>`;
    })
    .join("");
}

function institutionTags(property) {
  if (!property.institutions.length) return `<span class="tag tag-institution">Unaffiliated</span>`;
  return property.institutions
    .map((name) => {
      const label = INSTITUTION_BY_NAME.get(name)?.short || name;
      return `<span class="tag tag-institution">
        <span class="chip-swatch" style="background:${escapeHtml(institutionColour(name))}"></span>
        ${escapeHtml(label)}
      </span>`;
    })
    .join("");
}

function visitedTag(property) {
  const visits = visitsFor(property.id);
  if (!visits.length) return `<span class="tag tag-unvisited">Not visited</span>`;
  const date = lastVisitDate(property);
  const suffix = visits.length > 1 ? ` ×${visits.length}` : "";
  return `<span class="tag tag-visited">Visited${date ? ` ${formatVisitDate(date)}` : ""}${suffix}</span>`;
}

function renderPropertyList() {
  if (!el.propertyList) return;
  const rows = filteredProperties();

  if (el.resultCount) {
    const total = state.properties.length;
    const visited = rows.filter(isVisited).length;
    el.resultCount.textContent = rows.length === total
      ? `Showing all ${total} places · ${visited} visited`
      : `Showing ${rows.length} of ${total} places · ${visited} visited`;
  }

  if (!rows.length) {
    el.propertyList.innerHTML = `<p class="empty-state">No places match these filters.</p>`;
    return;
  }

  el.propertyList.innerHTML = `<div class="property-list">${rows
    .map((p) => {
      const visited = isVisited(p);
      const location = [p.location, p.country].filter(Boolean).join(", ");
      return `<article class="property-row${visited ? " is-visited" : ""}" data-property-id="${p.id}">
        <div class="property-main">
          <div class="property-title">
            <span class="property-name">${escapeHtml(p.name)}</span>
            ${location ? `<span class="property-location">${escapeHtml(location)}</span>` : ""}
          </div>
          <div class="property-meta">
            ${visitedTag(p)}
            ${institutionTags(p)}
            ${p.website ? `<a class="property-website" href="${escapeHtml(p.website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ""}
          </div>
          ${p.notes ? `<p class="property-note">${escapeHtml(p.notes)}</p>` : ""}
        </div>
        <div class="property-actions">
          <button type="button" data-action="visit" data-property-id="${p.id}">${visited ? "Visits" : "Mark visited"}</button>
          <button type="button" class="ghost" data-action="edit" data-property-id="${p.id}">Edit</button>
        </div>
      </article>`;
    })
    .join("")}</div>`;
}

function render() {
  renderHeroSummary();
  renderProgressCards();
  renderInstitutionChips();
  renderPropertyList();
  if (state.view === "map") renderMap();
}

/* ── UK map ────────────────────────── */

// Albers equal-area conic, standard parallels 50°N/60°N — the usual choice for
// a UK-only map. Plain lat/lon would visibly shear Scotland.
const D2R = Math.PI / 180;
const ALBERS_LON0 = -4.0;
const ALBERS_LAT0 = 55.0;
const ALBERS_P1 = 50.0 * D2R;
const ALBERS_P2 = 60.0 * D2R;
const ALBERS_N = 0.5 * (Math.sin(ALBERS_P1) + Math.sin(ALBERS_P2));
const ALBERS_C = Math.cos(ALBERS_P1) ** 2 + 2 * ALBERS_N * Math.sin(ALBERS_P1);
const ALBERS_RHO0 = Math.sqrt(ALBERS_C - 2 * ALBERS_N * Math.sin(ALBERS_LAT0 * D2R)) / ALBERS_N;

function projectAlbers(lon, lat) {
  const theta = ALBERS_N * (lon - ALBERS_LON0) * D2R;
  const rho = Math.sqrt(ALBERS_C - 2 * ALBERS_N * Math.sin(lat * D2R)) / ALBERS_N;
  return [rho * Math.sin(theta), ALBERS_RHO0 - rho * Math.cos(theta)];
}

const MAP_WIDTH = 620;
const MAP_PADDING = 12;
let mapTransform = null;

// Fits the projected UK into the SVG viewBox. Albers y increases northwards and
// SVG y increases downwards, hence the flip on the y axis.
function computeMapTransform(features) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of features) {
    for (const polygon of f.geometry.coordinates) {
      for (const [lon, lat] of polygon[0]) {
        const [x, y] = projectAlbers(lon, lat);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const scale = (MAP_WIDTH - MAP_PADDING * 2) / (maxX - minX);
  const height = (maxY - minY) * scale + MAP_PADDING * 2;
  return { minX, maxY, scale, width: MAP_WIDTH, height };
}

function projectToMap(lon, lat) {
  const [x, y] = projectAlbers(lon, lat);
  return [
    (x - mapTransform.minX) * mapTransform.scale + MAP_PADDING,
    (mapTransform.maxY - y) * mapTransform.scale + MAP_PADDING,
  ];
}

async function loadUkMap() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(UK_MAP_URL, { signal: controller.signal });
  } catch (err) {
    throw new Error(err?.name === "AbortError" ? "Timed out loading the UK map" : "Network error loading the UK map");
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Could not load the UK map (${res.status})`);
  const geojson = await res.json();
  return geojson.features || [];
}

let ukMapPromise = null;
function ensureUkMapLoaded() {
  if (!ukMapPromise) {
    ukMapPromise = loadUkMap()
      .then((features) => {
        state.mapFeatures = features;
        mapTransform = computeMapTransform(features);
        renderMap();
      })
      .catch((err) => {
        console.error("[Days Out] Failed to load the UK map:", err);
        if (el.ukMap) el.ukMap.innerHTML = `<p class="map-loading">Could not load the UK map.</p>`;
      });
  }
  return ukMapPromise;
}

function mappableProperties(rows) {
  return rows.filter((p) => typeof p.latitude === "number" && typeof p.longitude === "number");
}

function renderMap() {
  if (!el.ukMap) return;
  if (!state.mapFeatures) {
    el.ukMap.innerHTML = `<div class="map-loading"><div class="map-spinner"></div><span>Loading map…</span></div>`;
    ensureUkMapLoaded();
    return;
  }

  const rows = filteredProperties();
  const plotted = mappableProperties(rows);
  const missing = rows.length - plotted.length;

  // Build the shell once, then only refresh the markers on later renders — the
  // nation outlines never change and re-serialising them on every filter change
  // is wasted work.
  let svg = el.ukMap.querySelector(".uk-map-svg");
  if (!svg) {
    const nations = state.mapFeatures
      .map((f) => {
        const d = f.geometry.coordinates
          .map((polygon) => "M" + polygon[0].map(([lon, lat]) => projectToMap(lon, lat).map((v) => v.toFixed(1)).join(",")).join("L") + "Z")
          .join("");
        return `<path class="map-nation" d="${d}" data-nation="${escapeHtml(f.properties.name)}"></path>`;
      })
      .join("");

    el.ukMap.innerHTML = `
      <div class="uk-map-layout">
        <div class="uk-map-svg-wrap" style="--map-aspect:${(mapTransform.width / mapTransform.height).toFixed(4)}">
          <div class="map-zoom-controls">
            <button type="button" data-map-zoom="in" aria-label="Zoom in">+</button>
            <button type="button" data-map-zoom="out" aria-label="Zoom out">−</button>
            <button type="button" data-map-zoom="reset" aria-label="Reset zoom">⤢</button>
          </div>
          <svg class="uk-map-svg" viewBox="0 0 ${mapTransform.width} ${mapTransform.height.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of visited properties across the UK">
            <g class="map-nations">${nations}</g>
            <g class="map-markers"></g>
          </svg>
          <div class="uk-map-tooltip" hidden></div>
        </div>
        <div class="map-side">
          <div class="map-legend">
            <div class="map-legend-row"><span class="map-legend-dot" style="background:var(--map-visited)"></span> Visited</div>
            <div class="map-legend-row"><span class="map-legend-dot" style="background:var(--map-unvisited)"></span> Not visited</div>
          </div>
          <p class="map-hint">Scroll or use + / − to zoom, drag to pan, and click a marker for details. Markers respect the filters above.</p>
          <div class="map-selected"></div>
          <div class="map-no-coords hidden"></div>
        </div>
      </div>`;

    svg = el.ukMap.querySelector(".uk-map-svg");
    wireMapInteractions(svg);
  }

  const markersGroup = svg.querySelector(".map-markers");
  markersGroup.innerHTML = plotted
    .map((p) => {
      const [x, y] = projectToMap(p.longitude, p.latitude);
      const visited = isVisited(p);
      const active = state.selectedPropertyId === p.id;
      return `<circle class="map-marker ${visited ? "visited" : "unvisited"}${active ? " active" : ""}"
        cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"
        data-property-id="${p.id}"><title>${escapeHtml(p.name)}</title></circle>`;
    })
    .join("");

  const noCoords = el.ukMap.querySelector(".map-no-coords");
  if (noCoords) {
    noCoords.classList.toggle("hidden", missing === 0);
    if (missing > 0) {
      noCoords.textContent = `${missing} matching ${missing === 1 ? "place has" : "places have"} no coordinates yet, so ${missing === 1 ? "it is" : "they are"} not on the map. Edit ${missing === 1 ? "it" : "them"} to add a latitude and longitude.`;
    }
  }

  renderMapSelection();
}

function renderMapSelection() {
  const box = el.ukMap?.querySelector(".map-selected");
  if (!box) return;
  const property = state.properties.find((p) => p.id === state.selectedPropertyId);
  if (!property) {
    box.innerHTML = `<p class="map-hint">No place selected.</p>`;
    return;
  }
  const location = [property.location, property.country].filter(Boolean).join(", ");
  box.innerHTML = `
    <div class="property-title"><span class="property-name">${escapeHtml(property.name)}</span></div>
    ${location ? `<div class="property-location">${escapeHtml(location)}</div>` : ""}
    <div class="property-meta">${visitedTag(property)}${institutionTags(property)}</div>
    ${property.website ? `<a class="property-website" href="${escapeHtml(property.website)}" target="_blank" rel="noopener noreferrer">Website ↗</a>` : ""}
    <div class="property-actions">
      <button type="button" data-action="visit" data-property-id="${property.id}">${isVisited(property) ? "Visits" : "Mark visited"}</button>
      <button type="button" class="ghost" data-action="edit" data-property-id="${property.id}">Edit</button>
    </div>`;
}

function wireMapInteractions(svg) {
  const wrap = el.ukMap.querySelector(".uk-map-svg-wrap");
  const tip = el.ukMap.querySelector(".uk-map-tooltip");
  const baseView = { x: 0, y: 0, w: mapTransform.width, h: mapTransform.height };
  let view = { ...baseView };
  let dragState = null;

  function applyView() {
    svg.setAttribute("viewBox", `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`);
    // Keep markers a constant on-screen size as the map zooms.
    const zoom = baseView.w / view.w;
    svg.querySelectorAll(".map-marker").forEach((node) => node.setAttribute("r", (4 / zoom).toFixed(2)));
  }

  function clampView() {
    view.w = Math.min(baseView.w, Math.max(baseView.w / 12, view.w));
    view.h = Math.min(baseView.h, Math.max(baseView.h / 12, view.h));
    view.x = Math.min(baseView.w - view.w, Math.max(0, view.x));
    view.y = Math.min(baseView.h - view.h, Math.max(0, view.y));
  }

  function zoomAt(factor, originX, originY) {
    const newW = view.w / factor;
    const newH = view.h / factor;
    const ratioX = (originX - view.x) / view.w;
    const ratioY = (originY - view.y) / view.h;
    view.x = originX - ratioX * newW;
    view.y = originY - ratioY * newH;
    view.w = newW;
    view.h = newH;
    clampView();
    applyView();
  }

  function toSvgPoint(evt) {
    const rect = svg.getBoundingClientRect();
    return [
      view.x + ((evt.clientX - rect.left) / rect.width) * view.w,
      view.y + ((evt.clientY - rect.top) / rect.height) * view.h,
    ];
  }

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const [px, py] = toSvgPoint(e);
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, px, py);
  }, { passive: false });

  el.ukMap.querySelectorAll("[data-map-zoom]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mapZoom;
      if (mode === "reset") {
        view = { ...baseView };
        applyView();
        return;
      }
      zoomAt(mode === "in" ? 1.4 : 1 / 1.4, view.x + view.w / 2, view.y + view.h / 2);
    });
  });

  svg.addEventListener("pointerdown", (e) => {
    if (e.target.classList.contains("map-marker")) return;
    dragState = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    if (dragState) {
      const rect = svg.getBoundingClientRect();
      view.x = dragState.viewX - ((e.clientX - dragState.startX) / rect.width) * view.w;
      view.y = dragState.viewY - ((e.clientY - dragState.startY) / rect.height) * view.h;
      clampView();
      applyView();
      return;
    }
    if (!e.target.classList.contains("map-marker")) {
      tip.hidden = true;
      return;
    }
    const property = state.properties.find((p) => p.id === Number(e.target.dataset.propertyId));
    if (!property) return;
    const wrapRect = wrap.getBoundingClientRect();
    const location = [property.location, property.country].filter(Boolean).join(", ");
    const visits = visitsFor(property.id);
    const sub = visits.length ? `Visited ${formatVisitDate(lastVisitDate(property))}` : "Not visited";
    tip.innerHTML = `${escapeHtml(property.name)}<span class="tooltip-sub">${escapeHtml(location)} · ${escapeHtml(sub)}</span>`;
    tip.style.left = `${e.clientX - wrapRect.left}px`;
    tip.style.top = `${e.clientY - wrapRect.top}px`;
    tip.hidden = false;
  });

  function endDrag(e) {
    if (!dragState) return;
    dragState = null;
    if (e.pointerId !== undefined && svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  }
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });

  svg.addEventListener("click", (e) => {
    if (!e.target.classList.contains("map-marker")) return;
    state.selectedPropertyId = Number(e.target.dataset.propertyId);
    svg.querySelectorAll(".map-marker.active").forEach((n) => n.classList.remove("active"));
    e.target.classList.add("active");
    renderMapSelection();
  });
}

/* ── View toggle ───────────────────── */

function toggleView(view) {
  state.view = view;
  writeViewPref(view);
  const isList = view === "list";
  el.listView.classList.toggle("hidden", !isList);
  el.mapView.classList.toggle("hidden", isList);
  el.listTab.classList.toggle("active", isList);
  el.mapTab.classList.toggle("active", !isList);
  el.listTab.setAttribute("aria-selected", isList ? "true" : "false");
  el.mapTab.setAttribute("aria-selected", isList ? "false" : "true");
  if (!isList) renderMap();
}

/* ── Property add / edit ───────────── */

function renderInstitutionCheckboxes(selected = []) {
  if (!el.propertyInstitutions) return;
  el.propertyInstitutions.innerHTML = INSTITUTIONS.map(
    (i) => `<label><input type="checkbox" name="institution" value="${escapeHtml(i.name)}"${selected.includes(i.name) ? " checked" : ""} /> ${escapeHtml(i.short)}</label>`
  ).join("");
}

function openPropertyModal(property) {
  const form = el.propertyForm;
  form.reset();
  el.propertyFormError.classList.add("hidden");
  el.propertyFormError.textContent = "";

  if (property) {
    el.propertyModalTitle.textContent = "Edit Property";
    el.propertySubmit.textContent = "Save Changes";
    el.removeProperty.classList.remove("hidden");
    form.elements.propertyId.value = property.id;
    form.elements.name.value = property.name;
    form.elements.location.value = property.location;
    form.elements.country.value = property.country;
    form.elements.latitude.value = property.latitude ?? "";
    form.elements.longitude.value = property.longitude ?? "";
    form.elements.website.value = property.website;
    form.elements.notes.value = property.notes;
    renderInstitutionCheckboxes(property.institutions);
    // Institutions typed in by hand are not in the checkbox list, so put them
    // back in the free-text field rather than silently dropping them on save.
    form.elements.customInstitution.value = property.institutions
      .filter((i) => !INSTITUTION_BY_NAME.has(i))
      .join(", ");
  } else {
    el.propertyModalTitle.textContent = "Add Property";
    el.propertySubmit.textContent = "Add Property";
    el.removeProperty.classList.add("hidden");
    form.elements.propertyId.value = "";
    renderInstitutionCheckboxes([]);
  }

  el.propertyModal.classList.remove("hidden");
  form.elements.name.focus();
}

function readPropertyForm() {
  const form = el.propertyForm;
  const institutions = Array.from(form.querySelectorAll('input[name="institution"]:checked')).map((n) => n.value);
  const custom = String(form.elements.customInstitution.value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const name of custom) if (!institutions.includes(name)) institutions.push(name);

  const latRaw = form.elements.latitude.value;
  const lonRaw = form.elements.longitude.value;

  return {
    name: String(form.elements.name.value || "").trim(),
    location: String(form.elements.location.value || "").trim() || null,
    country: form.elements.country.value,
    institutions,
    latitude: latRaw === "" ? null : Number(latRaw),
    longitude: lonRaw === "" ? null : Number(lonRaw),
    website: String(form.elements.website.value || "").trim() || null,
    notes: String(form.elements.notes.value || "").trim() || null,
  };
}

function showPropertyFormError(message) {
  el.propertyFormError.textContent = message;
  el.propertyFormError.classList.remove("hidden");
}

async function submitPropertyForm() {
  if (!db) return;
  const payload = readPropertyForm();
  const id = el.propertyForm.elements.propertyId.value;

  if (!payload.name) {
    showPropertyFormError("Give the property a name.");
    return;
  }
  // A half-filled coordinate pair would place the marker at the equator, so
  // insist on both or neither.
  if ((payload.latitude === null) !== (payload.longitude === null)) {
    showPropertyFormError("Enter both a latitude and a longitude, or leave both blank.");
    return;
  }
  if (payload.latitude !== null && (Number.isNaN(payload.latitude) || Number.isNaN(payload.longitude))) {
    showPropertyFormError("Latitude and longitude must be numbers.");
    return;
  }

  try {
    if (id) {
      const { error } = await db.from("properties").update(payload).eq("id", Number(id));
      if (error) throw error;
    } else {
      const { error } = await db.from("properties").insert(payload);
      if (error) throw error;
    }
    el.propertyModal.classList.add("hidden");
    await loadData();
    render();
    showToast(id ? `Updated ${payload.name}.` : `Added ${payload.name}.`);
  } catch (err) {
    const duplicate = err?.code === "23505";
    const message = duplicate
      ? `There is already a property called "${payload.name}".`
      : `Could not save the property: ${err?.message || "Unknown error"}`;
    showPropertyFormError(message);
    console.error("[Days Out] Save property error:", err);
  }
}

async function removeCurrentProperty() {
  if (!db) return;
  const id = Number(el.propertyForm.elements.propertyId.value);
  const property = state.properties.find((p) => p.id === id);
  if (!property) return;
  if (!window.confirm(`Remove ${property.name} and any recorded visits?`)) return;

  try {
    const { error } = await db.from("properties").delete().eq("id", id);
    if (error) throw error;
    el.propertyModal.classList.add("hidden");
    if (state.selectedPropertyId === id) state.selectedPropertyId = null;
    await loadData();
    render();
    showToast(`Removed ${property.name}.`);
  } catch (err) {
    showPropertyFormError(`Could not remove the property: ${err?.message || "Unknown error"}`);
    console.error("[Days Out] Remove property error:", err);
  }
}

/* ── Visits ────────────────────────── */

function renderVisitHistory(property) {
  const visits = visitsFor(property.id);
  if (!visits.length) {
    el.visitHistory.innerHTML = "";
    return;
  }
  const sorted = visits.slice().sort((a, b) => (b.visitedOn || "").localeCompare(a.visitedOn || ""));
  el.visitHistory.innerHTML = `<div class="visit-history-list">
    <h3>Recorded visits</h3>
    ${sorted
      .map(
        (v) => `<div class="visit-history-row">
          <div>
            ${escapeHtml(formatVisitDate(v.visitedOn))}
            ${v.notes ? `<div class="visit-history-note">${escapeHtml(v.notes)}</div>` : ""}
          </div>
          <button type="button" class="ghost" data-action="delete-visit" data-visit-id="${v.id}">Remove</button>
        </div>`
      )
      .join("")}
  </div>`;
}

function openVisitModal(property) {
  el.visitForm.reset();
  el.visitForm.elements.propertyId.value = property.id;
  el.visitModalProperty.textContent = [property.location, property.country].filter(Boolean).join(", ")
    ? `${property.name} — ${[property.location, property.country].filter(Boolean).join(", ")}`
    : property.name;
  renderVisitHistory(property);
  el.visitModal.classList.remove("hidden");
}

async function submitVisitForm() {
  if (!db) return;
  const propertyId = Number(el.visitForm.elements.propertyId.value);
  const property = state.properties.find((p) => p.id === propertyId);
  if (!property) return;

  const visitedOn = el.visitForm.elements.visitedOn.value || null;
  const notes = String(el.visitForm.elements.notes.value || "").trim() || null;

  try {
    const { error } = await db.from("visits").insert({ property_id: propertyId, visited_on: visitedOn, notes });
    if (error) throw error;
    el.visitModal.classList.add("hidden");
    await loadData();
    render();
    showToast(`Marked ${property.name} as visited.`);
  } catch (err) {
    showToast(`Could not save the visit: ${err?.message || "Unknown error"}`, true);
    console.error("[Days Out] Save visit error:", err);
  }
}

async function deleteVisit(visitId) {
  if (!db) return;
  const propertyId = Number(el.visitForm.elements.propertyId.value);
  try {
    const { error } = await db.from("visits").delete().eq("id", visitId);
    if (error) throw error;
    await loadData();
    render();
    const property = state.properties.find((p) => p.id === propertyId);
    if (property) renderVisitHistory(property);
    showToast("Visit removed.");
  } catch (err) {
    showToast(`Could not remove the visit: ${err?.message || "Unknown error"}`, true);
    console.error("[Days Out] Delete visit error:", err);
  }
}

/* ── Events ────────────────────────── */

el.filterSearch?.addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  writeFilterPrefs();
  renderPropertyList();
  if (state.view === "map") renderMap();
});

for (const [node, key] of [
  [el.filterVisited, "visited"],
  [el.filterCountry, "country"],
  [el.filterSort, "sort"],
]) {
  node?.addEventListener("change", (e) => {
    state.filters[key] = e.target.value;
    writeFilterPrefs();
    renderPropertyList();
    if (state.view === "map") renderMap();
  });
}

el.institutionChips?.addEventListener("click", (e) => {
  const chip = e.target.closest("[data-institution]");
  if (!chip) return;
  const name = chip.dataset.institution;
  const active = state.filters.institutions.includes(name);
  state.filters.institutions = active
    ? state.filters.institutions.filter((i) => i !== name)
    : [...state.filters.institutions, name];
  writeFilterPrefs();
  renderInstitutionChips();
  renderPropertyList();
  if (state.view === "map") renderMap();
});

// One delegated handler covers the list and the map's selected-property panel,
// both of which render the same action buttons.
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;

  if (action === "delete-visit") {
    deleteVisit(Number(button.dataset.visitId));
    return;
  }

  const property = state.properties.find((p) => p.id === Number(button.dataset.propertyId));
  if (!property) return;
  if (action === "visit") openVisitModal(property);
  if (action === "edit") openPropertyModal(property);
});

el.listTab?.addEventListener("click", () => toggleView("list"));
el.mapTab?.addEventListener("click", () => toggleView("map"));

document.getElementById("open-add-property")?.addEventListener("click", () => openPropertyModal(null));
document.getElementById("property-cancel")?.addEventListener("click", () => el.propertyModal.classList.add("hidden"));
document.getElementById("visit-cancel")?.addEventListener("click", () => el.visitModal.classList.add("hidden"));
el.propertyForm?.addEventListener("submit", (e) => { e.preventDefault(); submitPropertyForm(); });
el.visitForm?.addEventListener("submit", (e) => { e.preventDefault(); submitVisitForm(); });
el.removeProperty?.addEventListener("click", removeCurrentProperty);

// Click the backdrop or press Escape to dismiss either modal.
for (const modal of [el.propertyModal, el.visitModal]) {
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  el.propertyModal?.classList.add("hidden");
  el.visitModal?.classList.add("hidden");
});

/* ── Auth and boot ─────────────────── */

function setAuthedUI(authed) {
  const gate = document.getElementById("auth-gate");
  const app = document.getElementById("app-main");
  if (gate) gate.classList.toggle("hidden", authed);
  // Only ever hide app-main here; revealing it waits until the data has loaded
  // so the empty shell never flashes.
  if (!authed) {
    if (app) app.classList.add("hidden");
    hidePageLoading();
  }
}

function revealApp() {
  document.getElementById("app-main")?.classList.remove("hidden");
  hidePageLoading();
}

function showUserInfo(session) {
  const userEmailEl = document.getElementById("user-email");
  if (userEmailEl) userEmailEl.textContent = session?.user?.email || "";
}

document.getElementById("sign-out-btn")?.addEventListener("click", async () => {
  if (db) await db.auth.signOut();
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith("sb-")) localStorage.removeItem(k);
  });
  setAuthedUI(false);
  showUserInfo(null);
  location.reload();
});

function applyFiltersToInputs() {
  if (el.filterSearch) el.filterSearch.value = state.filters.search;
  if (el.filterVisited) el.filterVisited.value = state.filters.visited;
  if (el.filterCountry) el.filterCountry.value = state.filters.country;
  if (el.filterSort) el.filterSort.value = state.filters.sort;
}

(async function init() {
  readFilterPrefs();
  applyFiltersToInputs();

  if (!db) {
    hidePageLoading();
    document.getElementById("auth-gate")?.classList.remove("hidden");
    return;
  }

  const signInForm = document.getElementById("sign-in-form");
  const authError = document.getElementById("auth-error");

  if (signInForm) {
    signInForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (authError) authError.textContent = "";
      const email = document.getElementById("sign-in-email").value;
      const password = document.getElementById("sign-in-password").value;
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error && authError) authError.textContent = error.message;
    });
  }

  let dataLoaded = false;
  async function loadAppData() {
    if (dataLoaded) return;
    dataLoaded = true;
    try {
      await loadData();
      render();
      toggleView(readViewPref());
    } catch (err) {
      console.error("[Days Out] loadAppData error:", err);
    } finally {
      // Reveal the app whether or not the load succeeded, so a failed DB call
      // does not leave the user stuck behind the overlay.
      revealApp();
    }
  }

  db.auth.onAuthStateChange((_event, session) => {
    if (session) {
      setAuthedUI(true);
      showUserInfo(session);
      // Deferred to avoid a Supabase internal lock in Safari.
      setTimeout(() => loadAppData(), 0);
    } else {
      setAuthedUI(false);
      showUserInfo(null);
    }
  });

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    setAuthedUI(true);
    showUserInfo(session);
    await loadAppData();
  } else {
    setAuthedUI(false);
  }
})();
