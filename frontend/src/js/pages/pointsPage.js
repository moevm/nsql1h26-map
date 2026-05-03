import "leaflet/dist/leaflet.css";
import L from 'leaflet';

import { relocateToLogin } from "../auth";

import { userManager } from "../localManagers/userManager";

import { Notify } from "../utils/notify"

import { renderTable } from "../utils/table";
import { initSlider } from "../utils/slider";

import { drawPOI } from "../utils/mapUtils";
import { drawTiles } from "../utils/mapUtils";
import { deleteTrashOnMap } from "../utils/mapUtils";

import { getPois } from "../utils/api";
import { getTiles } from "../utils/api";
import { getWalks } from "../utils/api";
import { getWalkPoints } from "../utils/api";
import { getMapNodes } from "../utils/api";
import { fetchEntityData } from "../utils/api";

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  const map = L.map('map', { zoomControl: true }).setView([59.9676, 30.3129], 14);
  const walkpointsLayer = L.layerGroup().addTo(map);
  const poisLayer = L.layerGroup().addTo(map);
  const mapnodesLayer = L.layerGroup().addTo(map);
  const tilesLayer = L.layerGroup().addTo(map);

  const applyBtn = document.getElementById('build-route-btn');
  const entitySelect = document.getElementById('entity-select');
  const perPageSel = document.getElementById('per-page-select');

  const filterTabs = document.querySelectorAll('.filter-tab');
  const filterPanels = document.querySelectorAll('.filter-panel');

  const mapLayersBtns = Array.from(document.querySelectorAll('.map-layer-chip'));

  const tableState = {
    entity: null,
    items: [],
    page: 1,
    perPage: 5,
  };

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

  deleteTrashOnMap();

  for (const layerBtn of mapLayersBtns) {
    layerBtn.addEventListener('click', (evt) => {
      const btn = evt.currentTarget;
      const layerName = btn.dataset.layer;
      const layer = layersMap[layerName].layer;

      btn.classList.toggle('map-layer-chip--active');

      if (!(btn.classList.contains('map-layer-chip--active'))) {
        map.removeLayer(layer);
        return;
      };

      if (layerName === "tiles") {
        getTiles()
          .then((tiles) => drawTiles(layer, tiles));
        map.addLayer(layer);
      }

      if (layerName === "pois") {
        getPois()
          .then((result) => {
            const points = result.items.map(item => ({
              coords: [item.lat, item.lon],
              name: item.name || 'Unnamed'
            }));
            drawPOI(layer, points, "red");
          })
          .catch(() => { btn.classList.toggle('map-layer-chip--active'); });
        map.addLayer(layer);
      }

      if (layerName === "walkpoints") {
        getWalks()
          .then(async (result) => {
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
          })
          .catch(error => { console.error('Failed to load walk points:', error); });
        map.addLayer(layer);
      }

      if (layerName === "mapnodes") {
        getMapNodes()
          .then((result) => {
            const points = result.items.map(item => ({
              coords: [item.lat, item.lon],
              name: item.name || 'Unnamed'
            }));
            drawPOI(layer, points, "green");
          })
          .catch(() => { btn.classList.toggle('map-layer-chip--active'); });
        map.addLayer(layer);
      }
    });
  };

  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filterName = tab.dataset.filter;
      const activePanel = document.querySelector(`.filter-panel[data-filter="${filterName}"]`);

      filterTabs.forEach(t => t.classList.remove('filter-tab--active'));
      filterPanels.forEach(p => p.classList.remove('filter-panel--active'));

      tab.classList.add('filter-tab--active');
      activePanel.classList.add('filter-panel--active');
    });
  });

  initSlider('content-track', 'content-prev', 'content-next', (slideIndex) => {
    if (slideIndex === 1) {
      setTimeout(() => map.invalidateSize(), 100);
    }
  });

  perPageSel.addEventListener('change', (e) => {
    tableState.perPage = Number(e.target.value);
    tableState.page = 1;
    if (tableState.entity) renderTable(tableState);
  });

  entitySelect.addEventListener('change', () => {
    tableState.entity = null;
    tableState.items = [];
    tableState.page = 1;
  });

  applyBtn.addEventListener('click', () => {
    const entity = entitySelect.value;

    applyBtn.disabled = true;
    applyBtn.querySelector('span').textContent = 'Загрузка...';

    fetchEntityData(entity)
      .then((items) => {
        tableState.entity = entity;
        tableState.items = items;
        tableState.page = 1;
        renderTable(tableState);
      })
      .catch((error) => {
        Notify.error(`Error ${error}`);
      })
      .finally(() => {
        applyBtn.disabled = false;
        applyBtn.querySelector('span').textContent = 'Применить';
      })
  });

  fetchEntityData('pois')
    .then((result) => {
      entitySelect.value = 'pois';

      tableState.items = result;
      tableState.entity = 'pois';
      tableState.page = 1;
      renderTable(tableState);
    })
    .catch((error) => {
      Notify.error(`${error}`);
  })

});