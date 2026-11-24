/* MapPin — app.js (skeleton)
   UI plumbing is wired (theme, sidebar, modal, map + tiles).
   Everything marked TODO is a hook point for the next step. */
'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ==========================================================================
   1. State & Storage
   ========================================================================== */
const STORAGE_KEY = 'mappin:pins:v1';
const THEME_KEY   = 'mappin:theme';

const CATEGORIES = {
  'want-to-visit': { label: 'Want to Visit' },
  'favorite-spot': { label: 'Favorite Spot' },
  'food-coffee':   { label: 'Food & Coffee' },
  'memory':        { label: 'Memory' },
};

/* Pin shape: { id, title, category, note, lat, lng, createdAt (ISO string) } */
const state = {
  pins: [],
  filter: 'all',
  activePinId: null,
};

function loadPins() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    state.pins = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to load pins:', error);
    state.pins = [];
  }
}

function savePins() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.pins));
}

function createPin({ title, category, note, lat, lng }) {
  state.pins.push({id: crypto.randomUUID() ,title: title, category: category, note: note, lat: lat, lng: lng, createdAt: new Date().toISOString()})
  savePins()
  renderAll()
}

function deletePin(id) {
  state.pins = state.pins.filter((v) => v.id != id)
  savePins()
  renderAll()
}

function getVisiblePins() {
  return state.filter === 'all'
    ? state.pins
    : state.pins.filter((p) => p.category === state.filter);
}

/* ==========================================================================
   2. Map & Tiles (and theme, since tiles follow it)
   ========================================================================== */
const TILE_URLS = {
  light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark:  'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
};
const TILE_OPTIONS = {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

let map;
let tileLayer;

const currentTheme = () => document.documentElement.dataset.theme || 'light';

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([25, 10], 2);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  setTileTheme(currentTheme());
  map.on('click', onMapClick);
}

function setTileTheme(theme) {
  // Simple swap. For a softer change, add the new layer, then remove the old one on its 'load' event.
  if (tileLayer) map.removeLayer(tileLayer);
  tileLayer = L.tileLayer(TILE_URLS[theme], TILE_OPTIONS).addTo(map);
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  root.dataset.theme = theme;
  setTileTheme(theme);
  setTimeout(() => root.classList.remove('theme-transition'), 300);
  localStorage.setItem(THEME_KEY, theme)
}

function onMapClick(e) {
  openPinModal({ lat: e.latlng.lat, lng: e.latlng.lng });
}

function flyToPin(id) {
  let pin = state.pins.find(pin => pin.id == id)
  map.flyTo([pin.lat, pin.lng], Math.max(map.getZoom(), 14))
}
/* ==========================================================================
   3. Markers & Rendering
   ========================================================================== */
const markerLayer = L.layerGroup();
const markers = new Map(); // pin id -> L.Marker

function createMarkerIcon(category) {
  // Teardrop tip sits ~31px below the top of the 26px body once rotated.
  return L.divIcon({
    className: 'pin-marker',
    html: `<span class="pin-marker__body" data-category="${category}"></span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 31],
    popupAnchor: [0, -30],
  });
}

function renderMarkers() {
  // TODO: clear markerLayer + markers, then for each getVisiblePins():
  //       L.marker([lat, lng], { icon: createMarkerIcon(category) }).bindPopup(...), add to layer + map.
  markerLayer.clearLayers();
  markers.clear();

  getVisiblePins().forEach((pin) => {
    const marker = L.marker([pin.lat, pin.lng], {
      icon: createMarkerIcon(pin.category),
    })
      .bindPopup(`<strong>${pin.title}</strong>`)
      .addTo(markerLayer);

    markers.set(pin.id, marker);
  });
}

function renderPinList() {
  // TODO: empty #pin-list (this also removes the [data-sample] cards), then for each visible pin
  //       build a card matching the static markup in index.html (data-id, data-category,
  //       data-action="focus" / "delete"). Toggle #empty-state when there are none.
  let pinsModel = ``;
  const visiblePins = getVisiblePins();
  const pinList = document.getElementById("pin-list");
  pinList.innerHTML = "";

  visiblePins.forEach((pin) => {
    pinsModel += `<li class="pin-card" data-id="${pin.id}" data-category="${pin.category.toLowerCase().replace(" ", "-")}">
          <div class="pin-card__top">
            <h3 class="pin-card__title"><button type="button" data-action="focus">${pin.title}</button></h3>
            <button class="icon-btn icon-btn--quiet" type="button" data-action="delete" aria-label="Delete pin: ${pin.title}"><i data-lucide="trash-2" aria-hidden="true"></i></button>
          </div>
          <span class="tag"><span class="dot"></span>${pin.category}</span>
          <p class="pin-card__meta"><span class="coords">${pin.lat}, ${pin.lng}</span><time datetime="2026-10-14">${pin.createdAt}</time></p>
          <p class="pin-card__note">${pin.note}</p>
        </li>`;
  });

  $('#empty-state').hidden = visiblePins.length > 0;
  pinList.innerHTML = pinsModel;
  lucide.createIcons();
}

function updatePinCount() {
    $('#pin-count').textContent = state.pins.length;
}

function renderAll() {
  renderMarkers();
  renderPinList();
  updatePinCount();
}

/* ==========================================================================
   4. Search & Filters
   ========================================================================== */
async function searchLocations(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Response status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}

function renderSearchResults(results) {
  const searchList = $("#search-results");
  searchList.innerHTML = "";
  let list = "";

  if (!results.length) {
    list = `<li>No places found</li>`;
  } else {
    results.forEach((res) => {
      list += `<li><button type="button" data-lat="${res.lat}" data-lng="${res.lon}">${res.display_name}</button></li>`;
    });
  }

  searchList.innerHTML = list;
  searchList.removeAttribute("hidden");
}

function clearSearchResults() {
  const list = $('#search-results');
  list.innerHTML = '';
  list.hidden = true;
}

function setFilter(category) {
  state.filter = category;
  $$('#filter-bar .chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.category === category));
  });
  renderAll();
}

/* ==========================================================================
   5. Import/Export & Events
   ========================================================================== */
function exportPins() {
  // TODO: Blob([JSON.stringify(state.pins, null, 2)], { type: 'application/json' }),
  //       temporary <a download="mappin-export.json">, click, revokeObjectURL.
}

async function importPins(file) {
  // TODO: file.text() -> JSON.parse -> validate (array, required fields, known categories),
  //       merge or replace state.pins, savePins(), renderAll(), showToast(...).
}

function openPinModal({ lat, lng, pin = null } = {}) {
  const modal = $('#pin-modal');
  $('#pin-modal-title').textContent = pin ? 'Edit pin' : 'New pin';
  $('#pin-id').value       = pin ? pin.id : '';
  $('#pin-title').value    = pin ? pin.title : '';
  $('#pin-category').value = pin ? pin.category : 'want-to-visit';
  $('#pin-note').value     = pin ? pin.note : '';
  $('#pin-lat').value      = Number(lat).toFixed(5);
  $('#pin-lng').value      = Number(lng).toFixed(5);
  modal.hidden = false;
  $('#pin-title').focus();
}

function closePinModal() {
  $('#pin-modal').hidden = true;
  $('#pin-form').reset();
}

function showToast(message, ms = 3000) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, ms);
}

function onPinSubmit(e) {
  e.preventDefault()
  
  // TODO: read fields, validate title, createPin({...}) (or update when #pin-id is set), then:
  const title = $("#pin-title").value
  const category = $("#pin-category").value
  const note = $("#pin-note").value
  const lat = Number($("#pin-lat").value)
  const lng = Number($("#pin-lng").value)
  createPin({ title, category, note, lat, lng })
  closePinModal();
}

function onPinListClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.closest('.pin-card')?.dataset.id;
  if (btn.dataset.action === 'focus')  flyToPin(id);
  if (btn.dataset.action === 'delete') deletePin(id); 
  // TODO: confirm first if you want an undo step
}

function onSearchSubmit(e) {
  e.preventDefault();
  const query = $('#search-input').value.trim();
  if (!query) return clearSearchResults();
  searchLocations(query).then(renderSearchResults)
}

function onSearchResultClick(e) {
  const btn = e.target.closest('button[data-lat]');
  if (!btn) return;
   map.flyTo([btn.dataset.lat, btn.dataset.lng], 15), 
   openPinModal({ lat, lng }), 
   clearSearchResults()
}

function toggleSidebar() {
  const sidebar = $('#sidebar');
  const collapsed = sidebar.dataset.collapsed !== 'true';
  sidebar.dataset.collapsed = String(collapsed);
  const toggle = $('#sidebar-toggle');
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
}

function bindEvents() {
  $('#theme-toggle').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  $('#sidebar-toggle').addEventListener('click', toggleSidebar);

  $('#search-form').addEventListener('submit', onSearchSubmit);
  $('#search-results').addEventListener('click', onSearchResultClick);
  $('#filter-bar').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) setFilter(chip.dataset.category);
  });

  $('#new-pin-btn').addEventListener('click', () => {
    const c = map.getCenter();
    openPinModal({ lat: c.lat, lng: c.lng });
  });
  $('#pin-list').addEventListener('click', onPinListClick);

  $('#pin-form').addEventListener('submit', onPinSubmit);
  $('#cancel-pin-btn').addEventListener('click', closePinModal);
  $('#pin-modal').addEventListener('click', (e) => { if (e.target.matches('[data-close]')) closePinModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#pin-modal').hidden) closePinModal(); });

  $('#export-btn').addEventListener('click', exportPins);
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importPins(file);
    e.target.value = ''; // allow re-importing the same file
  });
}

function init() {
  lucide.createIcons();
  loadPins();
  initMap();
  markerLayer.addTo(map);
  bindEvents();
  renderAll();
}

init();
