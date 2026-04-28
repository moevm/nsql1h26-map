import "leaflet/dist/leaflet.css";

import { relocateToLogin } from "../auth";
import { getToken } from "../auth";
import { userManager } from "../localManagers/userManager";
import { Notify } from "../utils/notify"

import L from 'leaflet';

const val = (id) => document.getElementById(id)?.value?.trim() ?? '';
const num = (id) => Number(document.getElementById(id)?.value) || undefined;

const buildQuery = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  });
  return q.toString() ? `?${q.toString()}` : '';
};

const deleteTrashOnMap = () => {
  const trash = document.querySelector('.leaflet-bottom.leaflet-right');
  trash.innerHTML = '';
}

function tileBounds(x, y) {
  const n = Math.pow(2, 19);
  const lon1 = x / n * 360 - 180;
  const lon2 = (x + 1) / n * 360 - 180;
  const lat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const lat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
  return [[lat1, lon1], [lat2, lon2]];
}

const drawTiles = (layer, tiles) => {
  layer.clearLayers();
  (tiles || []).forEach(t => {
    L.rectangle(tileBounds(t.tileX, t.tileY), {
      color: '#00e6c3', weight: 0.5, opacity: 0.25,
      fillColor: '#00e6c3', fillOpacity: 0.25, interactive: false
    }).addTo(layer);
  });
}

const drawPOI = (layer, points, iconColor = "blue") => {
  layer.clearLayers();
  points.forEach(point => {
    L.circleMarker(point.coords, {
      radius: 7,
      fillColor: iconColor,
      color: iconColor,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    })
      .bindPopup(point.name)
      .addTo(layer);
  });
};

const getPois = async () => {
  const query = buildQuery({
    name:     val('poi-name'),
    category: val('poi-category'),
    bbox:     val('poi-bbox'),
    route_id: val('poi-route-id'),
    limit:    num('poi-radius-slider'),
    offset:   num('poi-offset-slider'),
  });
  const response = await fetch(`http://127.0.0.1:10001/api/pois/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`, 'credentials': true },
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить POIs"); return false; });
  return await response.json();
}

const getWalks = async () => {
  const userId = userManager.get().id;
  const response = await fetch(`http://127.0.0.1:10001/api/walks/?userId=${userId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`, 'credentials': true },
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить Walks"); return false; });
  return await response.json();
}

const getWalkPoints = async (walkId) => {
  const query = buildQuery({
    walkId,
    latMin:         val('wp-lat-min'),
    latMax:         val('wp-lat-max'),
    lonMin:         val('wp-lon-min'),
    lonMax:         val('wp-lon-max'),
    timestampFrom:  val('wp-timestamp-from'),
    timestampTo:    val('wp-timestamp-to'),
    orderMin:       val('wp-order-min'),
    orderMax:       val('wp-order-max'),
    limit:          num('wp-radius-slider'),
    offset:         num('wp-offset-slider'),
  });
  const response = await fetch(`http://127.0.0.1:10001/api/walkpoints/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`, 'credentials': true },
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить WalkPoints"); return false; });
  return await response.json();
}

const getTiles = async () => {
  const userId = userManager.get().id;
  const response = await fetch(`http://127.0.0.1:10001/api/map/tiles/?userId=${userId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`, 'credentials': true },
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить Tiles"); return false; });
  return await response.json();
}

const getMapNodes = async () => {
  const query = buildQuery({
    osmId: val('mn-osm-id'),
    tileX: val('mn-tile-x'),
    tileY: val('mn-tile-y'),
    bbox:  val('mn-bbox'),
    limit:  num('mn-radius-slider'),
    offset: num('mn-offset-slider'),
  });
  const response = await fetch(`http://127.0.0.1:10001/api/mapnodes/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`, 'credentials': true },
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить MapNodes"); return false; });
  return await response.json();
}

const COLUMNS = {
  pois: [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Имя' },
    { key: 'category', label: 'Категория' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
  ],
  walkpoints: [
    { key: 'order', label: 'Порядок' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
    { key: 'timestamp', label: 'Время' },
  ],
  mapnodes: [
    { key: 'id', label: 'ID' },
    { key: 'osmId', label: 'OSM ID' },
    { key: 'name', label: 'Имя' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
    { key: 'tileX', label: 'Tile X' },
    { key: 'tileY', label: 'Tile Y' },
  ],
  tiles: [
    { key: 'tileX', label: 'Tile X' },
    { key: 'tileY', label: 'Tile Y' },
  ],
};

const fetchEntityData = async (entity) => {
  switch (entity) {
    case 'pois': {
      const result = await getPois();
      return result?.items ?? [];
    }
    case 'walkpoints': {
      const walksResult = await getWalks();
      const walks = walksResult?.items ?? [];

      console.log(walks);

      const results = await Promise.all(
        walks.map(walk => getWalkPoints(walk.id))
      );

      return results
        .map(result => result?.items ?? [])
        .flat();
    }
    case 'mapnodes': {
      const result = await getMapNodes();
      return result?.items ?? [];
    }
    case 'tiles': {
      const result = await getTiles();
      return Array.isArray(result) ? result : (result?.items ?? []);
    }
    default:
      return [];
  }
};

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  const mapLayersBtns = Array.from(document.querySelectorAll('.map-layer-chip'));

  const map = L.map('map', { zoomControl: true }).setView([59.9676, 30.3129], 14);
  const walkpointsLayer = L.layerGroup().addTo(map);
  const poisLayer = L.layerGroup().addTo(map);
  const mapnodesLayer = L.layerGroup().addTo(map);
  const tilesLayer = L.layerGroup().addTo(map);

  const layersMap = {
    walkpoints: { layer: walkpointsLayer, color: "green" },
    pois: { layer: poisLayer, color: "blue" },
    mapnodes: { layer: mapnodesLayer, color: "orange" },
    tiles: { layer: tilesLayer, color: "gray" },
  };

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  for (const layerBtn of mapLayersBtns) {
    layerBtn.addEventListener('click', (evt) => {
      const btn = evt.currentTarget;
      const layerName = btn.dataset.layer;
      const layer = layersMap[layerName].layer;

      btn.classList.toggle('map-layer-chip--active');

      if (btn.classList.contains('map-layer-chip--active')) {
        if (layerName === "tiles") {
          getTiles().then((tiles) => { drawTiles(layer, tiles); });
          map.addLayer(layer);
        }
        if (layerName === "pois") {
          getPois().then((result) => {
            const points = result.items.map(item => ({
              coords: [item.lat, item.lon],
              name: item.name || 'Unnamed'
            }));
            drawPOI(layer, points, "red");
          }).catch(() => { btn.classList.toggle('map-layer-chip--active'); });
          map.addLayer(layer);
        }
        if (layerName === "walkpoints") {
          getWalks().then(async (result) => {
            const allPointPromises = result.items.map(item =>
              getWalkPoints(item.id).then(res => res.items)
            );
            const allPointsArrays = await Promise.all(allPointPromises);
            const totalPoints = allPointsArrays.flat();
            const formattedPoints = totalPoints.map(point => ({
              coords: [point.lat, point.lon],
              name: point.name || 'Unnamed'
            }));
            drawPOI(layer, formattedPoints, "blue");
          }).catch(error => { console.error('Failed to load walk points:', error); });
          map.addLayer(layer);
        }
        if (layerName === "mapnodes") {
          getMapNodes().then((result) => {
            const points = result.items.map(item => ({
              coords: [item.lat, item.lon],
              name: item.name || 'Unnamed'
            }));
            drawPOI(layer, points, "green");
          }).catch(() => { btn.classList.toggle('map-layer-chip--active'); });
          map.addLayer(layer);
        }
      } else {
        map.removeLayer(layer);
      }
    });
  }

  deleteTrashOnMap();

  const tableState = {
    entity: null,
    items: [],
    page: 1,
    perPage: 5,
  };

  const renderTableHead = (entity) => {
    const cols = COLUMNS[entity] ?? [];
    const thead = document.querySelector('.routes-table thead tr');
    if (!thead) return;
    thead.innerHTML = `
      <th class="routes-table__th routes-table__th--checkbox">
        <input type="checkbox" id="select-all-checkbox" />
      </th>
      <th class="routes-table__th">#</th>
      ${cols.map(c => `<th class="routes-table__th">${c.label}</th>`).join('')}
    `;
  };

  const renderTableBody = () => {
    const { entity, items, page, perPage } = tableState;
    const cols = COLUMNS[entity] ?? [];
    const tbody = document.getElementById('routes-table-body');

    if (!tbody) return;

    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
      <tr>
        <td colspan="${cols.length + 3}" style="text-align:center;padding:24px;opacity:.5;">
          Нет данных
        </td>
      </tr>
    `;
      return;
    }

    tbody.innerHTML = pageItems.map((item, idx) => {
      const rowId =
        item.id ??
        `${item.walkId ?? 'walk'}-${item.order ?? idx}`;

      return `
      <tr data-id="${rowId}">
        <td class="routes-table__td--checkbox">
          <input
            type="checkbox"
            class="route-checkbox"
            data-id="${rowId}"
          />
        </td>
        <td class="route-num">${start + idx + 1}</td>
        ${cols.map(c => `
          <td class="routes-table__td">
            ${item[c.key] ?? '—'}
          </td>
        `).join('')}
      </tr>
    `;
    }).join('');
  };

  const renderPagination = () => {
    const { items, page, perPage } = tableState;
    const total = items.length;
    const totalPages = Math.ceil(total / perPage);
    const start = total === 0 ? 0 : (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, total);

    const rangeEl = document.getElementById('pagination-range');
    if (rangeEl) rangeEl.textContent = `Показано ${start}–${end} из ${total}`;

    const controls = document.querySelector('.pagination__controls');
    if (!controls) return;

    const makeBtn = (label, targetPage, disabled = false) =>
      `<button
        class="pagination__btn${targetPage === page ? ' pagination__btn--active' : ''}"
        data-page="${targetPage}"
        ${disabled ? 'disabled' : ''}
      >${label}</button>`;

    const pages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) pages.push(p);
    }

    let html = makeBtn('‹', page - 1, page === 1);
    let prev = null;
    for (const p of pages) {
      if (prev !== null && p - prev > 1) html += `<span class="pagination__ellipsis">…</span>`;
      html += makeBtn(p, p);
      prev = p;
    }
    html += makeBtn('›', page + 1, page === totalPages || totalPages === 0);
    controls.innerHTML = html;

    controls.querySelectorAll('.pagination__btn:not([disabled])').forEach(b => {
      b.addEventListener('click', () => {
        tableState.page = Number(b.dataset.page);
        renderTableBody();
        renderPagination();
      });
    });
  };

  const renderTable = () => {
    if (!tableState.entity) {
      document.querySelector('.routes-table thead tr').innerHTML = '';
      document.getElementById('routes-table-body').innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center;padding:24px;opacity:.5;">
            Выберите сущность и нажмите «Применить»
          </td>
        </tr>
      `;
      return;
    }

    renderTableHead(tableState.entity);
    renderTableBody();
    renderPagination();
  };


  const applyBtn = document.getElementById('build-route-btn');
  const entitySelect = document.getElementById('entity-select');
  const perPageSel = document.getElementById('per-page-select');

  perPageSel?.addEventListener('change', (e) => {
    tableState.perPage = Number(e.target.value);
    tableState.page = 1;
    if (tableState.entity) renderTable();
  });

  entitySelect?.addEventListener('change', () => {
    tableState.entity = null;
    tableState.items = [];
    tableState.page = 1;
  });

  applyBtn?.addEventListener('click', async () => {
    const entity = entitySelect?.value;
    if (!entity) {
      Notify.error('Выберите сущность в таблице');
      return;
    }

    applyBtn.disabled = true;
    applyBtn.querySelector('span').textContent = 'Загрузка…';

    try {
      const items = await fetchEntityData(entity);
      tableState.entity = entity;
      tableState.items = items;
      tableState.page = 1;
      renderTable();
    } catch (err) {
      console.error(err);
      Notify.error('Ошибка загрузки данных');
    } finally {
      applyBtn.disabled = false;
      applyBtn.querySelector('span').textContent = 'Применить';
    }
  });

  renderTable();
});