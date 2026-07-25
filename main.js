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
  { name: "National Trust", varName: "--inst-nt" },
  { name: "National Trust for Scotland", varName: "--inst-nts" },
  { name: "English Heritage", varName: "--inst-eh" },
  { name: "Historic Environment Scotland", varName: "--inst-hes" },
  { name: "Cadw", varName: "--inst-cadw" },
  { name: "RHS Garden", varName: "--inst-rhs" },
  { name: "RHS Partner Garden", varName: "--inst-rhsp" },
  { name: "Historic Houses", varName: "--inst-hh" },
];

const INSTITUTION_BY_NAME = new Map(INSTITUTIONS.map((i) => [i.name, i]));

// Several of these bodies have reciprocal entry arrangements, so the filters and
// the progress cards group them by the membership that actually gets you in.
// This is presentation only: each property keeps its exact association in the
// database and still displays it in full on its own row.
const INSTITUTION_GROUPS = [
  {
    key: "National Trust",
    label: "National Trust",
    varName: "--inst-nt",
    members: ["National Trust", "National Trust for Scotland"],
  },
  {
    key: "English Heritage",
    label: "English Heritage",
    varName: "--inst-eh",
    members: ["English Heritage", "Cadw", "Historic Environment Scotland"],
  },
  {
    key: "RHS",
    label: "RHS",
    varName: "--inst-rhs",
    members: ["RHS Garden", "RHS Partner Garden"],
  },
  {
    key: "Historic Houses",
    label: "Historic Houses",
    varName: "--inst-hh",
    members: ["Historic Houses"],
  },
];

const GROUPED_INSTITUTION_NAMES = new Set(INSTITUTION_GROUPS.flatMap((g) => g.members));

function cssColour(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#6b7280";
}

function institutionColour(name) {
  return cssColour(INSTITUTION_BY_NAME.get(name)?.varName || "--muted");
}

// The built-in groups, plus a one-member group for any institution typed in by
// hand so it still gets its own filter chip and progress card.
function institutionGroups() {
  const custom = new Set();
  for (const property of state.properties) {
    for (const name of property.institutions) {
      if (!GROUPED_INSTITUTION_NAMES.has(name)) custom.add(name);
    }
  }

  const all = [
    ...INSTITUTION_GROUPS,
    ...[...custom]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ key: name, label: name, varName: "--muted", members: [name] })),
  ];

  return all.map((group) => {
    const rows = state.properties.filter((p) => p.institutions.some((i) => group.members.includes(i)));
    return { ...group, rows, count: rows.length };
  });
}

const GROUP_MEMBERS_BY_KEY = new Map(INSTITUTION_GROUPS.map((g) => [g.key, g.members]));

// Expands the selected group keys into the institution names actually stored on
// properties. An unrecognised key is treated as a literal institution name, so
// hand-typed institutions and filters saved before grouping existed both work.
function selectedInstitutionNames() {
  return state.filters.institutions.flatMap((key) => GROUP_MEMBERS_BY_KEY.get(key) || [key]);
}

const state = {
  properties: [],
  visitsByProperty: new Map(),
  filters: {
    search: "",
    visited: "all",
    sort: "name",
    institutions: [],
  },
  view: "list",
  mapFeatures: null,
  mapDefaultCenter: null,
  // Ordered by distance to the last tap (closest first); more than one entry
  // means a cluster of nearby markers, browsed via selectedCardIndex.
  selectedPropertyIds: [],
  selectedCardIndex: 0,
  // Held in memory only — the browser re-asks (or reuses its own permission
  // grant) each session rather than us persisting anyone's whereabouts.
  userLocation: null,
  locationPending: false,
};

const el = {
  progressCards: document.getElementById("progress-cards"),
  propertyList: document.getElementById("property-list"),
  resultCount: document.getElementById("result-count"),
  filterSearch: document.getElementById("filter-search"),
  filterVisited: document.getElementById("filter-visited"),
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
      sort: ["name", "distance"].includes(saved.sort) ? saved.sort : "name",
      // At most one — a stale multi-selection from before filters became
      // mutually exclusive shouldn't linger and silently narrow the list.
      institutions: Array.isArray(saved.institutions) ? saved.institutions.slice(0, 1) : [],
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

/* ── Location and distance ─────────── */

const EARTH_RADIUS_KM = 6371;
const KM_PER_MILE = 1.609344;

function haversineKm(from, to) {
  const dLat = (to.latitude - from.latitude) * D2R;
  const dLon = (to.longitude - from.longitude) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.latitude * D2R) * Math.cos(to.latitude * D2R) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Straight-line distance, so it under-reads against a road route — fine for
// ordering a list, which is all it is used for.
function distanceToProperty(property) {
  if (!state.userLocation) return null;
  if (typeof property.latitude !== "number" || typeof property.longitude !== "number") return null;
  return haversineKm(state.userLocation, property);
}

function formatDistance(km) {
  const miles = km / KM_PER_MILE;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser cannot report your location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function requestLocation({ silent = false, force = false } = {}) {
  if (state.locationPending) return state.userLocation;
  state.locationPending = true;
  try {
    const position = await getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 15000,
      // An explicit refresh must not be answered from the browser's cache.
      maximumAge: force ? 0 : 300000,
    });
    state.userLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      at: Date.now(),
    };
    return state.userLocation;
  } catch (err) {
    if (!silent) {
      const message =
        err?.code === 1
          ? "Location permission was denied, so places cannot be sorted by distance."
          : err?.code === 3
            ? "Timed out while getting your location. Try again."
            : `Could not get your location: ${err?.message || "Unknown error"}`;
      showToast(message, true);
    }
    return null;
  } finally {
    state.locationPending = false;
  }
}

// Restoring a saved "nearest to me" sort must not fire a permission prompt out
// of nowhere on load, so only re-request when permission was already granted.
async function maybeAutoRequestLocation() {
  if (state.filters.sort !== "distance" || state.userLocation) return;
  try {
    const permission = await navigator.permissions?.query({ name: "geolocation" });
    if (permission?.state !== "granted") return;
  } catch (_) {
    return;
  }
  await requestLocation({ silent: true });
  applyFilterChange();
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
  const { search, visited, sort, institutions } = state.filters;
  const needle = search.trim().toLowerCase();

  let rows = state.properties.filter((p) => {
    if (needle) {
      const haystack = `${p.name} ${p.location} ${p.institutions.join(" ")}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (visited === "visited" && !isVisited(p)) return false;
    if (visited === "unvisited" && isVisited(p)) return false;
    // An empty institution filter means "no institution filter", and a property
    // matches if it belongs to any institution in any of the selected groups.
    if (institutions.length) {
      const selected = selectedInstitutionNames();
      if (!p.institutions.some((i) => selected.includes(i))) return false;
    }
    return true;
  });

  const collator = new Intl.Collator("en-GB", { sensitivity: "base" });
  rows = rows.slice().sort((a, b) => {
    if (sort === "distance") {
      const aDistance = distanceToProperty(a);
      const bDistance = distanceToProperty(b);
      // Places with no coordinates (or no fix yet) fall to the bottom rather
      // than pretending to be at zero distance.
      if (aDistance !== bDistance) {
        if (aDistance === null) return 1;
        if (bDistance === null) return -1;
        return aDistance - bDistance;
      }
    }
    return collator.compare(a.name, b.name);
  });

  return rows;
}

/* ── Rendering ─────────────────────── */

// The cards double as the institution filter for the list below: each is a
// radio-style button (data-institution="" for "All places"), so there is one
// control for both "how many have I done" and "show me just these" rather
// than a separate chip row repeating the same institutions.
function renderProgressCards() {
  if (!el.progressCards) return;
  const total = state.properties.length;
  const visited = state.properties.filter(isVisited).length;
  const activeInstitution = state.filters.institutions[0] ?? null;

  const card = (key, label, swatch, done, count) => `
    <button type="button" class="progress-card${key === null ? " total" : ""}" data-institution="${escapeHtml(key ?? "")}" role="radio" aria-checked="${activeInstitution === key}">
      <div class="progress-card-name">
        ${swatch ? `<span class="progress-card-swatch" style="background:${escapeHtml(swatch)}"></span>` : ""}
        ${escapeHtml(label)}
      </div>
      <div class="progress-card-value">${done} <span>/ ${count}</span></div>
      <div class="progress-bar"><div class="progress-bar-fill" style="width:${count ? (done / count) * 100 : 0}%"></div></div>
    </button>`;

  const cards = [card(null, "All places", null, visited, total)];

  // Only show a card when the list actually contains places for that group, so
  // a pared-back list does not render a row of empty cards.
  for (const group of institutionGroups()) {
    if (!group.count) continue;
    const done = group.rows.filter(isVisited).length;
    cards.push(card(group.key, group.label, cssColour(group.varName), done, group.count));
  }

  el.progressCards.innerHTML = cards.join("");
}

// Plain-text institution list for contexts (map tooltip) that can't render
// the coloured tag markup institutionTags() produces.
function propertyTypeLabel(property) {
  return property.institutions.length ? property.institutions.join(", ") : "Unaffiliated";
}

function institutionTags(property) {
  if (!property.institutions.length) return `<span class="tag tag-institution">Unaffiliated</span>`;
  // Always the exact association in full, never the group it filters under, so
  // an NTS castle stays distinguishable from a National Trust one.
  return property.institutions
    .map(
      (name) => `<span class="tag tag-institution">
        <span class="chip-swatch" style="background:${escapeHtml(institutionColour(name))}"></span>
        ${escapeHtml(name)}
      </span>`
    )
    .join("");
}

function distanceTag(property) {
  const km = distanceToProperty(property);
  if (km === null) return "";
  return `<span class="tag tag-distance">${escapeHtml(formatDistance(km))}</span>`;
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
            ${distanceTag(p)}
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
  renderProgressCards();
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
const MAP_MARKER_RADIUS = 10;
// On-screen pixels within which a tap counts multiple markers as one cluster.
const MAP_CLUSTER_RADIUS_PX = 24;
let mapTransform = null;
let currentMapZoom = 1;

// Where the map opens by default: a radius around the user's location, or
// around London if location isn't already known. This only sets the starting
// view — the full UK is still reachable via the zoom-out control.
const LONDON = { latitude: 51.5074, longitude: -0.1278 };
const DEFAULT_MAP_RADIUS_MILES = 50;

// Approximates a circle of the given radius as a lat/lon box, good enough for
// framing a map view (not used for distance sorting, which uses haversineKm).
function boundingBoxForRadius(center, radiusKm) {
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos(center.latitude * D2R));
  return {
    north: center.latitude + dLat,
    south: center.latitude - dLat,
    east: center.longitude + dLon,
    west: center.longitude - dLon,
  };
}

// The map never waits on a location fix before opening — it uses whatever is
// already known immediately (state.userLocation from an earlier "Nearest to
// me" use, or London), so opening the tab is never held up behind an
// unanswered permission prompt. See the fire-and-forget requestLocation call
// in ensureUkMapLoaded() for how it can still end up centred on you.
function resolveMapDefaultCenter() {
  return state.userLocation ? { ...state.userLocation, source: "location" } : { ...LONDON, source: "london" };
}

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

// The initial viewBox rectangle for state.mapDefaultCenter, in the same
// map-pixel space as projectToMap. Null until the default centre is resolved.
function defaultMapView() {
  if (!state.mapDefaultCenter) return null;
  const box = boundingBoxForRadius(state.mapDefaultCenter, DEFAULT_MAP_RADIUS_MILES * KM_PER_MILE);
  const corners = [
    projectToMap(box.west, box.north),
    projectToMap(box.east, box.north),
    projectToMap(box.west, box.south),
    projectToMap(box.east, box.south),
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
        state.mapDefaultCenter = resolveMapDefaultCenter();
        mapTransform = computeMapTransform(features);
        renderMap();
        // The map already opened using whatever location was known (or
        // London) rather than waiting on this — fetch in the background
        // purely so later uses (e.g. "Nearest to me", or reopening the map
        // tab) can land on a resolved location without asking again.
        if (!state.userLocation) requestLocation({ silent: true });
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
      <div class="uk-map-svg-wrap" style="--map-aspect:${(mapTransform.width / mapTransform.height).toFixed(4)}">
        <div class="map-zoom-controls">
          <button type="button" data-map-zoom="in" aria-label="Zoom in">+</button>
          <button type="button" data-map-zoom="out" aria-label="Zoom out">−</button>
          <button type="button" data-map-zoom="reset" aria-label="Reset zoom">⤢</button>
        </div>
        <div class="map-pan-hint" aria-hidden="true" title="Drag to pan, scroll or pinch to zoom">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
            <polygon points="12,2 8,7 16,7"></polygon>
            <polygon points="12,22 8,17 16,17"></polygon>
            <polygon points="2,12 7,8 7,16"></polygon>
            <polygon points="22,12 17,8 17,16"></polygon>
            <rect x="10" y="7" width="4" height="10"></rect>
            <rect x="7" y="10" width="10" height="4"></rect>
          </svg>
        </div>
        <svg class="uk-map-svg" viewBox="0 0 ${mapTransform.width} ${mapTransform.height.toFixed(1)}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of visited properties across the UK">
          <g class="map-nations">${nations}</g>
          <g class="map-markers"></g>
        </svg>
        <div class="uk-map-tooltip" hidden></div>
        <div class="map-selected"></div>
      </div>
      <div class="map-legend-bar">
        <span class="map-legend-item"><span class="map-legend-dot" style="background:var(--map-visited)"></span> Visited</span>
        <span class="map-legend-item"><span class="map-legend-dot" style="background:var(--map-unvisited)"></span> Not visited</span>
        <span class="map-center-note"></span>
      </div>
      <div class="map-no-coords hidden"></div>`;

    svg = el.ukMap.querySelector(".uk-map-svg");
    wireMapInteractions(svg);

    const centerNote = el.ukMap.querySelector(".map-center-note");
    if (centerNote) {
      centerNote.textContent = state.mapDefaultCenter?.source === "location"
        ? `Opened zoomed to the ${DEFAULT_MAP_RADIUS_MILES} miles around your location`
        : `Opened zoomed to the ${DEFAULT_MAP_RADIUS_MILES} miles around London — allow location access to centre on you instead`;
    }
  }

  const markersGroup = svg.querySelector(".map-markers");
  markersGroup.innerHTML = plotted
    .map((p) => {
      const [x, y] = projectToMap(p.longitude, p.latitude);
      const visited = isVisited(p);
      const active = state.selectedPropertyIds[state.selectedCardIndex] === p.id;
      return `<circle class="map-marker ${visited ? "visited" : "unvisited"}${active ? " active" : ""}"
        cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(MAP_MARKER_RADIUS / currentMapZoom).toFixed(2)}"
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
  const ids = state.selectedPropertyIds;
  const property = state.properties.find((p) => p.id === ids[state.selectedCardIndex]);
  if (!property) {
    // Left empty rather than a placeholder message — .map-selected:empty
    // collapses to nothing so it doesn't sit over the map when unused.
    box.innerHTML = "";
    return;
  }
  const location = [property.location, property.country].filter(Boolean).join(", ");
  // Several markers can sit close enough together that a tap can't cleanly
  // hit just one — the card becomes a small carousel over all of them.
  const clusterNav = ids.length > 1
    ? `<div class="map-cluster-nav">
        <button type="button" class="ghost" data-cluster-nav="prev" aria-label="Previous property here">‹</button>
        <span class="map-cluster-count">${state.selectedCardIndex + 1} of ${ids.length} here</span>
        <button type="button" class="ghost" data-cluster-nav="next" aria-label="Next property here">›</button>
      </div>`
    : "";
  box.innerHTML = `
    <button type="button" class="map-selected-close" data-action="close-map-selection" aria-label="Close">×</button>
    ${clusterNav}
    <div class="property-title"><span class="property-name">${escapeHtml(property.name)}</span></div>
    ${location ? `<div class="property-location">${escapeHtml(location)}</div>` : ""}
    <div class="property-meta">${visitedTag(property)}${distanceTag(property)}${institutionTags(property)}</div>
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
  let view = defaultMapView() || { ...baseView };
  let dragState = null;

  function applyView() {
    svg.setAttribute("viewBox", `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`);
    // Keep markers a constant on-screen size as the map zooms. currentMapZoom
    // is also read by renderMap() so markers inserted later (after a filter
    // change) come in at the right size instead of momentarily full-size.
    currentMapZoom = baseView.w / view.w;
    svg.querySelectorAll(".map-marker").forEach((node) => node.setAttribute("r", (MAP_MARKER_RADIUS / currentMapZoom).toFixed(2)));
    // The wrapper's own box shape tracks whatever's currently in view rather
    // than staying fixed to the full UK's tall/narrow silhouette — the default
    // local view is roughly square, and sizing the wrapper for the *country's*
    // proportions would letterbox it down to a fraction of the available
    // width. Panning/zooming back out to the whole UK reshapes it back.
    wrap.style.setProperty("--map-aspect", (view.w / view.h).toFixed(4));
  }

  function clampView() {
    view.w = Math.min(baseView.w, Math.max(baseView.w / 12, view.w));
    view.h = Math.min(baseView.h, Math.max(baseView.h / 12, view.h));
    view.x = Math.min(baseView.w - view.w, Math.max(0, view.x));
    view.y = Math.min(baseView.h - view.h, Math.max(0, view.y));
  }
  clampView();
  applyView();

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

  function toSvgPointXY(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return [view.x + ((clientX - rect.left) / rect.width) * view.w, view.y + ((clientY - rect.top) / rect.height) * view.h];
  }
  function toSvgPoint(evt) {
    return toSvgPointXY(evt.clientX, evt.clientY);
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

  // pointerId -> {x, y} in client space, tracking every finger/pointer
  // currently down so a second finger landing can be recognised as a pinch.
  const activePointers = new Map();
  let pinchState = null; // { lastDist } while two pointers are down
  let tapCandidate = null; // a single-pointer press that might turn into a tap
  let lastTap = null; // the most recent qualifying single tap, for double-tap

  const TAP_MAX_DURATION_MS = 400;
  const TAP_MAX_MOVEMENT_PX = 12;
  const DOUBLE_TAP_MAX_GAP_MS = 350;
  const DOUBLE_TAP_MAX_DISTANCE_PX = 32;
  const DOUBLE_TAP_ZOOM_FACTOR = 1.9;

  function pinchMetrics() {
    const [a, b] = [...activePointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
  }

  svg.addEventListener("pointerdown", (e) => {
    // Without this, dragging the mouse to pan (or double-clicking to zoom)
    // is indistinguishable from a text-selection drag/word-select to the
    // browser, which highlights whatever the cursor passes over — especially
    // noticeable on a trackpad once the pointer strays outside the map.
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A capture failure must not abort the rest of this handler — the pinch/tap
    // tracking set up below still needs to run either way.
    try {
      svg.setPointerCapture(e.pointerId);
    } catch (_) {
      // Capture isn't available for every pointer (e.g. certain synthetic or
      // already-released ones); panning/pinching still work without it.
    }

    if (activePointers.size === 2) {
      // A second finger landing turns this into a pinch: drop any
      // single-finger pan/tap tracking so they don't fight over the gesture.
      dragState = null;
      tapCandidate = null;
      pinchState = { lastDist: pinchMetrics().dist };
      return;
    }
    if (activePointers.size > 2) return;

    // Capturing the pointer (above) retargets the subsequent native "click"
    // event's target to this svg element rather than the marker actually
    // pressed, so marker selection can't rely on that click event — the
    // property id is captured here instead, at the one point e.target is
    // still trustworthy, and resolved on pointerup below.
    const isMarker = e.target.classList.contains("map-marker");
    tapCandidate = { x: e.clientX, y: e.clientY, t: performance.now(), propertyId: isMarker ? Number(e.target.dataset.propertyId) : null };
    if (isMarker) return;
    dragState = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
  });

  svg.addEventListener("pointermove", (e) => {
    if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2 && pinchState) {
      const { dist, midX, midY } = pinchMetrics();
      if (pinchState.lastDist) {
        const [originX, originY] = toSvgPointXY(midX, midY);
        zoomAt(dist / pinchState.lastDist, originX, originY);
      }
      pinchState.lastDist = dist;
      return;
    }

    if (dragState) {
      const rect = svg.getBoundingClientRect();
      view.x = dragState.viewX - ((e.clientX - dragState.startX) / rect.width) * view.w;
      view.y = dragState.viewY - ((e.clientY - dragState.startY) / rect.height) * view.h;
      clampView();
      applyView();
      if (tapCandidate && Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y) > TAP_MAX_MOVEMENT_PX) {
        tapCandidate = null;
      }
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
    const locationLine = [location, propertyTypeLabel(property)].filter(Boolean).join(" · ");
    tip.innerHTML = `${escapeHtml(property.name)}<span class="tooltip-sub">${escapeHtml(locationLine)}</span><span class="tooltip-sub">${escapeHtml(sub)}</span>`;
    tip.style.left = `${e.clientX - wrapRect.left}px`;
    tip.style.top = `${e.clientY - wrapRect.top}px`;
    tip.hidden = false;
  });

  function endPointer(e) {
    const wasTracked = activePointers.has(e.pointerId);
    activePointers.delete(e.pointerId);
    if (e.pointerId !== undefined && svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId);

    if (pinchState) {
      // Ending a pinch always stops the gesture rather than letting the
      // remaining finger snap into a pan using stale start coordinates; lifting
      // and pressing again resumes panning cleanly.
      pinchState = null;
      dragState = null;
      tapCandidate = null;
      return;
    }
    if (!wasTracked) return;

    if (tapCandidate && activePointers.size === 0) {
      const now = performance.now();
      const moved = Math.hypot(e.clientX - tapCandidate.x, e.clientY - tapCandidate.y);
      if (moved <= TAP_MAX_MOVEMENT_PX) {
        if (tapCandidate.propertyId !== null) {
          // No duration limit here — a slow, deliberate press on a marker
          // should still select it, unlike the double-tap-zoom gesture below.
          const [svgX, svgY] = toSvgPointXY(tapCandidate.x, tapCandidate.y);
          selectMarkerCluster(svgX, svgY);
        } else if (now - tapCandidate.t <= TAP_MAX_DURATION_MS) {
          const isDoubleTap =
            lastTap &&
            now - lastTap.t <= DOUBLE_TAP_MAX_GAP_MS &&
            Math.hypot(tapCandidate.x - lastTap.x, tapCandidate.y - lastTap.y) <= DOUBLE_TAP_MAX_DISTANCE_PX;
          if (isDoubleTap) {
            const [originX, originY] = toSvgPointXY(tapCandidate.x, tapCandidate.y);
            zoomAt(DOUBLE_TAP_ZOOM_FACTOR, originX, originY);
            lastTap = null;
          } else {
            lastTap = tapCandidate;
          }
        }
      }
    }
    dragState = null;
    tapCandidate = null;
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });

  // Several markers can sit close enough on screen that a tap can't cleanly
  // land on just one, especially once zoomed out — gathers every marker
  // within a fixed on-screen radius of the tap (converted to the current
  // viewBox's units so "close" means close on screen at any zoom level),
  // closest first, so the selection card can page through all of them.
  function selectMarkerCluster(svgX, svgY) {
    const rect = svg.getBoundingClientRect();
    const radiusSvgUnits = MAP_CLUSTER_RADIUS_PX * (view.w / rect.width);
    const nearby = mappableProperties(filteredProperties())
      .map((p) => {
        const [x, y] = projectToMap(p.longitude, p.latitude);
        return { id: p.id, dist: Math.hypot(x - svgX, y - svgY) };
      })
      .filter((m) => m.dist <= radiusSvgUnits)
      .sort((a, b) => a.dist - b.dist)
      .map((m) => m.id);

    state.selectedPropertyIds = nearby;
    state.selectedCardIndex = 0;
    svg.querySelectorAll(".map-marker.active").forEach((n) => n.classList.remove("active"));
    if (nearby[0] !== undefined) svg.querySelector(`.map-marker[data-property-id="${nearby[0]}"]`)?.classList.add("active");
    renderMapSelection();
  }
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
    (i) => `<label><input type="checkbox" name="institution" value="${escapeHtml(i.name)}"${selected.includes(i.name) ? " checked" : ""} /> ${escapeHtml(i.name)}</label>`
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
    const removedIndex = state.selectedPropertyIds.indexOf(id);
    if (removedIndex !== -1) {
      state.selectedPropertyIds = state.selectedPropertyIds.filter((pid) => pid !== id);
      if (state.selectedCardIndex >= state.selectedPropertyIds.length) state.selectedCardIndex = 0;
    }
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

function applyFilterChange() {
  renderPropertyList();
  if (state.view === "map") renderMap();
}

el.filterSearch?.addEventListener("input", (e) => {
  state.filters.search = e.target.value;
  writeFilterPrefs();
  applyFilterChange();
});

// Wires a single <button data-value="..."> that cycles through a fixed list
// of values on each click, showing the current one — one joint control per
// filter instead of a row of separate option buttons.
function wireCycleToggle(button, values, labels, onChange) {
  function paint(value) {
    if (!button) return;
    button.dataset.value = value;
    const valueEl = button.querySelector(".cycle-toggle-value");
    if (valueEl) valueEl.textContent = labels[value];
  }
  button?.addEventListener("click", () => {
    const next = values[(values.indexOf(button.dataset.value) + 1) % values.length];
    paint(next);
    onChange(next);
  });
  return { setValue: paint };
}

const VISITED_VALUES = ["all", "visited", "unvisited"];
const VISITED_LABELS = { all: "All", visited: "Visited", unvisited: "Not visited" };
const visitedToggle = wireCycleToggle(el.filterVisited, VISITED_VALUES, VISITED_LABELS, (value) => {
  state.filters.visited = value;
  writeFilterPrefs();
  applyFilterChange();
});

const SORT_VALUES = ["name", "distance"];
const SORT_LABELS = { name: "A–Z", distance: "Nearest to me" };
const sortToggle = wireCycleToggle(el.filterSort, SORT_VALUES, SORT_LABELS, async (value) => {
  state.filters.sort = value;
  writeFilterPrefs();

  if (value === "distance" && !state.userLocation) {
    applyFilterChange();
    const position = await requestLocation();
    if (!position) {
      // Without a fix, "nearest to me" would just be alphabetical order wearing
      // a misleading label, so drop back to the default sort.
      state.filters.sort = "name";
      sortToggle.setValue("name");
      writeFilterPrefs();
    }
  }

  applyFilterChange();
});

el.progressCards?.addEventListener("click", (e) => {
  const card = e.target.closest("[data-institution]");
  if (!card) return;
  const key = card.dataset.institution; // "" means the "All places" card
  // Mutually exclusive: picking one clears any other, and picking the one
  // that's already active clears back to "All places" — previously the
  // separate chip row appended, so a chip picked earlier and forgotten about
  // silently kept narrowing the list alongside whatever was clicked next.
  const isOnlySelected = state.filters.institutions.length === 1 && state.filters.institutions[0] === key;
  state.filters.institutions = key === "" || isOnlySelected ? [] : [key];
  writeFilterPrefs();
  renderProgressCards();
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

  if (action === "close-map-selection") {
    state.selectedPropertyIds = [];
    state.selectedCardIndex = 0;
    document.querySelectorAll(".map-marker.active").forEach((n) => n.classList.remove("active"));
    renderMapSelection();
    return;
  }

  const property = state.properties.find((p) => p.id === Number(button.dataset.propertyId));
  if (!property) return;
  if (action === "visit") openVisitModal(property);
  if (action === "edit") openPropertyModal(property);
});

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-cluster-nav]");
  if (!nav) return;
  const count = state.selectedPropertyIds.length;
  if (!count) return;
  const delta = nav.dataset.clusterNav === "next" ? 1 : -1;
  state.selectedCardIndex = (state.selectedCardIndex + delta + count) % count;
  renderMapSelection();
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
  visitedToggle.setValue(state.filters.visited);
  sortToggle.setValue(state.filters.sort);
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
      maybeAutoRequestLocation();
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
