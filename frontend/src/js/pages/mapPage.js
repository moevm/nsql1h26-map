import "leaflet/dist/leaflet.css";
import L from 'leaflet';

import { relocateToLogin, getToken } from "../auth";
import { Notify } from "../utils/notify";
import { userManager } from "../localManagers/userManager";
import { deleteTrashOnMap, drawPOI, drawTiles } from "../utils/mapUtils";
import { buildQuery, getAllTiles, downloadFile, getPOIbyCategory, importDb } from "../utils/api";
import { Loader, hideLoader, showLoader } from "../utils/loader";

const LABELS = [
  [0,   0.2,  'Новые тайлы'],
  [0.2, 0.4,  'Больше новых тайлов'],
  [0.4, 0.6,  'Баланс'],
  [0.6, 0.8,  'Больше мест'],
  [0.8, 1.01, 'Интересные места'],
];

const MIN_DIST = 1, MAX_DIST = 20, STEP_DIST = 0.5;
const MIN_PRI  = 0, MAX_PRI  = 1,  STEP_PRI  = 0.1;

function getPinBtn(pinName, pinId, pinText) {
  const btn = document.createElement("button");
  btn.className = `bbox-btn bbox-btn--${pinName}`;
  btn.id = pinId;
  btn.innerHTML = pinText;
  return btn;
}

function getPriorityLabel(val) {
  const entry = LABELS.find(([lo, hi]) => val >= lo && val < hi);
  return entry ? entry[2] : 'Баланс';
}

function renderStep1(ctx) {
  const { modalSubTitle, modalContent, modal, modalOverlay, loader, map, userManager, getToken } = ctx;

  modalSubTitle.textContent = 'Шаг 1';
  modalContent.innerHTML = `
    <section class="distance-control">
      <div class="modal__tabs">
        <h2 class="modal__tabs-title">Продолжительность маршрута</h2>
      </div>
      <div class="distance-control__input-group">
        <button class="distance-control__button">−</button>
        <div class="distance-control__value">5.0 км</div>
        <button class="distance-control__button">+</button>
      </div>
      <input type="range" class="distance-control__slider" min="1" max="20" value="5" step="0.5" />
      <div class="distance-control__range">
        <span class="distance-control__limit">1км</span>
        <span class="distance-control__limit">20км</span>
      </div>
    </section>

    <section class="priority-control">
      <div class="priority-control__input-group">
        <button class="priority-control__button">−</button>
        <div class="priority-control__value">Приоритет маршрута</div>
        <button class="priority-control__button">+</button>
      </div>
      <input type="range" class="priority-control__slider" min="0" max="1" value="0.5" step="0.1" />
      <div class="priority-control__range">
        <span class="priority-control__limit">Новые тайлы</span>
        <span class="priority-control__limit">Интересные места</span>
      </div>
    </section>

    <div class="button-group">
      <button class="modal__button modal__button--secondary">Отмена</button>
      <button class="modal__button modal__button--build modal__button--primary">Построить маршрут</button>
    </div>
  `;

  initStep1Controls(ctx);
}

function initStep1Controls(ctx) {
  const { modalSubTitle, modalContent, modal, modalOverlay, loader, map, userManager, getToken } = ctx;

  const dSlider = modalContent.querySelector('.distance-control__slider');
  const dValue  = modalContent.querySelector('.distance-control__value');
  const dBtns   = modalContent.querySelectorAll('.distance-control__button');
  const pSlider = modalContent.querySelector('.priority-control__slider');
  const pValue  = modalContent.querySelector('.priority-control__value');
  const pBtns   = modalContent.querySelectorAll('.priority-control__button');

  const updateDist = (val) => {
    val = Math.min(MAX_DIST, Math.max(MIN_DIST, Math.round(val / STEP_DIST) * STEP_DIST));
    dSlider.value = val;
    dValue.textContent = val.toFixed(1) + ' км';
  };

  const updatePri = (val) => {
    val = parseFloat(Math.min(MAX_PRI, Math.max(MIN_PRI, Math.round(val / STEP_PRI) * STEP_PRI)).toFixed(1));
    pSlider.value = val;
    pValue.textContent = getPriorityLabel(val);
  };

  dBtns[0].addEventListener('click', () => updateDist(+dSlider.value - STEP_DIST));
  dBtns[1].addEventListener('click', () => updateDist(+dSlider.value + STEP_DIST));
  dSlider.addEventListener('input', () => updateDist(+dSlider.value));

  pBtns[0].addEventListener('click', () => updatePri(+pSlider.value - STEP_PRI));
  pBtns[1].addEventListener('click', () => updatePri(+pSlider.value + STEP_PRI));
  pSlider.addEventListener('input', () => updatePri(+pSlider.value));

  updateDist(+dSlider.value);
  updatePri(+pSlider.value);

  modalContent.querySelector('.modal__button--build').addEventListener('click', async () => {
    const distance = parseFloat(dSlider.value);
    const priority = parseFloat(pSlider.value);
    const userId   = userManager.get()?.id ?? 'unknown';

    const startPoint = ctx.startPoint;
    const finishPoint = ctx.finishPoint;
    const routeType = ctx.routeType;

    if (routeType === 'circle') {
      if (!startPoint) {
        Notify.error('Сначала укажите начальную точку маршрута');
        return;
      }

      showLoader(loader, 'Строим маршрут...');
      try {
        const response = await fetch('http://127.0.0.1:10001/api/routes/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({
            userId,
            startLat: startPoint.lat,
            startLon: startPoint.lng,
            targetDistance: Math.round(distance * 2000),
            priority,
          }),
        });

        if (!response.ok) throw new Error(`Ошибка ${response.status}`);
        const route = await response.json();
        renderStep2(route, distance, priority, ctx);
      } catch (error) {
        Notify.error('Не удалось построить маршрут: ' + error.message);
      } finally {
        hideLoader(loader);
      }

    } else {
      if (!startPoint || !finishPoint) {
        Notify.error('Сначала укажите начальную и конечную точки маршрута');
        return;
      }

      showLoader(loader, 'Строим маршрут...');
      try {
        const response = await fetch('http://127.0.0.1:10001/api/routes/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({
            userId,
            startLat: startPoint.lat,
            startLon: startPoint.lng,
            endLat: finishPoint.lat,
            endLon: finishPoint.lng,
            targetDistance: Math.round(distance * 2000),
            priority,
          }),
        });

        if (!response.ok) throw new Error(`Ошибка ${response.status}`);
        const route = await response.json();
        renderStep2(route, distance, priority, ctx);
      } catch (error) {
        Notify.error('Не удалось построить маршрут: ' + error.message);
      } finally {
        hideLoader(loader);
      }
    }
  });

  modalContent.querySelector('.modal__button--secondary').addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  });
}

function renderStep2(route, distance, priority, ctx) {
  const { modalSubTitle, modalContent, modal, modalOverlay, loader, map, userManager, getToken } = ctx;

  modalSubTitle.textContent = 'Шаг 2: предварительный просмотр и подтверждение';

  const distanceKm      = (route.totalDistanceMeters / 1000).toFixed(1);
  const highlightsCount = route.highlights?.length ?? 0;
  const priorityLabel   = getPriorityLabel(priority);
  const newTilesCount   = route.newTiles?.length ?? 0;
  const allTilesCount   = route.allTilesCount ?? 0;

  modalContent.innerHTML = `
    <div class="route-preview">
      <div class="route-preview__params">
        <p class="route-preview__section-label">Выбранные параметры</p>
        <p class="route-preview__param-name">Выбранное расстояние: ${distance.toFixed(1)} km</p>
        <p class="route-preview__param-name">Приоритет маршрута: ${priorityLabel}</p>
      </div>
      <div class="route-preview__map-wrap">
        <div id="route-preview-map"></div>
      </div>
    </div>

    <div class="route-preview__stats">
      <p class="route-preview__section-label">Информация о построенном маршруте</p>
      <div class="route-preview__stat">
        <span>Расстояние: ${distanceKm} км</span>
      </div>
      <div class="route-preview__stat">
        <span>Примерная длительность: ${route.estimatedMinutes} мин</span>
      </div>
      <div class="route-preview__stat">
        <span>Количество интересных мест: ${highlightsCount}</span>
      </div>
      <div class="route-preview__stat">
        <span>Новых тайлов: ${newTilesCount}</span>
      </div>
      <div class="route-preview__stat">
        <span>Всего тайлов по маршруту: ${allTilesCount}</span>
      </div>
    </div>

    <div class="button-group">
      <button class="modal__button modal__button--secondary modal__button--back">← Назад</button>
      <button class="modal__button modal__button--secondary modal__button--rebuild">↺ Перестроить</button>
      <button class="modal__button modal__button--primary modal__button--start">▶ Начать маршрут</button>
    </div>
  `;

  let previewMap = L.map('route-preview-map', { zoomControl: false, attributionControl: false });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(previewMap);

  setTimeout(async () => {
    previewMap.invalidateSize();

    if (route.nodes?.length) {
      const coords = route.nodes
        .sort((a, b) => a.order - b.order)
        .map(n => [n.lat, n.lon]);

      const polyline = L.polyline(coords, { color: '#00e6c3', weight: 3, opacity: 0.9, smoothFactor: 0 }).addTo(previewMap);
      previewMap.fitBounds(polyline.getBounds(), { padding: [16, 16] });
      L.circleMarker(coords[0], { radius: 7, color: '#00e6c3', fillColor: '#00e6c3', fillOpacity: 1 }).addTo(previewMap);

      // Уже исследованные тайлы — зелёный фон
      const coveredLayer = L.layerGroup().addTo(previewMap);
      try {
        const userId = userManager.get()?.id;
        const resp = await fetch(
          `http://127.0.0.1:10001/api/tiles/?userId=${userId}&limit=10000`,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        );
        if (resp.ok) {
          const data = await resp.json();
          drawTiles(coveredLayer, data.items || []);
        }
      } catch (_) { /* некритично — тайлы не загрузились */ }

      // Новые тайлы — оранжевый, все без исключения
      if (route.newTiles?.length) {
        const newTilesLayer = L.layerGroup().addTo(previewMap);
        drawTiles(newTilesLayer, route.newTiles, '#ff9f1c', 0.45);
      }
    }
  }, 0);

  const destroyPreviewMap = () => {
    if (previewMap) { previewMap.remove(); previewMap = null; }
  };

  const routeType = ctx.routeType;
  if (routeType === "line") {
    modalContent.querySelector('.modal__button--rebuild').style.display = "none";
  }else {
    modalContent.querySelector('.modal__button--rebuild').style.display = "flex";

    modalContent.querySelector('.modal__button--rebuild').addEventListener('click', async () => {
      showLoader(loader, 'Строим альтернативный маршрут...');
      try {
        const response = await fetch(`http://127.0.0.1:10001/api/routes/${route.routeId}/alternative`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
        });

        if (!response.ok) throw new Error(`Ошибка ${response.status}`);
        const altRoute = await response.json();
        destroyPreviewMap();
        renderStep2(altRoute, distance, priority, ctx);
      } catch (error) {
        Notify.error('Не удалось перестроить маршрут: ' + error.message);
      } finally {
        hideLoader(loader);
      }
    });
  }

  modalContent.querySelector('.modal__button--start').addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
    destroyPreviewMap();

    if (route.nodes?.length) {
      const coords = route.nodes
        .sort((a, b) => a.order - b.order)
        .map(n => [n.lat, n.lon]);

      L.polyline(coords, { color: '#00e6c3', weight: 4, opacity: 0.9, smoothFactor: 0 }).addTo(map);
      map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
    }
  });

  modalContent.querySelector('.modal__button--back').addEventListener('click', () => {
    destroyPreviewMap();
    renderStep1(ctx);
  });
}


document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  let startPoint  = null;
  let startMarker = null;
  let isSettingStart = false;

  let finishPoint  = null;
  let finishMarker = null;
  let isSettingFinish = false;

  let routeType = 'circle';

  const loader        = new Loader();
  const modal         = document.querySelector('.modal');
  const modalOverlay  = document.querySelector('.modal-overlay');
  const modalSubTitle = document.querySelector('.modal__sub-title');
  const modalContent  = document.querySelector('.modal__content');

  const openModalBtn  = document.getElementById('build-route-btn');
  const closeModalBtn = document.querySelector('.modal-close');
  const buildBtn      = document.querySelector('.modal__button--build');

  const tileSwitch  = document.querySelector('.map-layer__switch-input--tile');
  const routeSwitch = document.querySelector('.map-layer__switch-input--route');

  const mapLayersBtns = Array.from(document.querySelectorAll('.map-layer-chip'));

  const importBtn = document.getElementById('import-btn');
  const exportBtn = document.getElementById('export-btn');

  const prioritySlider = document.querySelector('.priority-control__slider');
  const priorityValue  = document.querySelector('.priority-control__value');
  const priorityBtns   = document.querySelectorAll('.priority-control__button');
  const distanceSlider = document.querySelector('.distance-control__slider');
  const distanceValue  = document.querySelector('.distance-control__value');
  const distanceBtns   = document.querySelectorAll('.distance-control__button');

  const map          = L.map('map', { zoomControl: true }).setView([59.9676, 30.3129], 14);
  const mapContainer = map.getContainer();

  const setStartBtn  = getPinBtn("set-start",  "set-start-btn",  "📍 Начальная точка");
  const setFinishBtn = getPinBtn("set-finish", "set-finish-btn", "📍 Конечная точка");
  setFinishBtn.classList.add("bbox-btn-hide");

  const coveredLayer     = L.layerGroup().addTo(map);
  const barsLayer        = L.layerGroup().addTo(map);
  const cafesLayer       = L.layerGroup().addTo(map);
  const restaurantsLayer = L.layerGroup().addTo(map);
  const hotelsLayer      = L.layerGroup().addTo(map);
  const fastfoodLayer    = L.layerGroup().addTo(map);
  const librariesLayer   = L.layerGroup().addTo(map);
  const pubsLayer        = L.layerGroup().addTo(map);
  const bakeriesLayer    = L.layerGroup().addTo(map);
  const monumentsLayer   = L.layerGroup().addTo(map);
  const museumsLayer     = L.layerGroup().addTo(map);

  const layersMap = {
    bar:        { layer: barsLayer,        color: "purple"   },
    cafe:       { layer: cafesLayer,       color: "orange"   },
    restaurant: { layer: restaurantsLayer, color: "red"      },
    hotel:      { layer: hotelsLayer,      color: "blue"     },
    fast_food:  { layer: fastfoodLayer,    color: "#4b9f0e"  },
    library:    { layer: librariesLayer,   color: "teal"     },
    pub:        { layer: pubsLayer,        color: "brown"    },
    bakery:     { layer: bakeriesLayer,    color: "#ff11eb"  },
    memorial:   { layer: monumentsLayer,   color: "gray"     },
    museum:     { layer: museumsLayer,     color: "indigo"   },
  };

  const ctx = {
    modalSubTitle,
    modalContent,
    modal,
    modalOverlay,
    loader,
    get startPoint()  { return startPoint;  },
    get finishPoint() { return finishPoint; },
    get routeType()   { return routeType;   },
    map,
    userManager,
    getToken,
  };

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19,
  }).addTo(map);

  mapContainer.appendChild(setStartBtn);
  mapContainer.appendChild(setFinishBtn);

  L.DomEvent.disableClickPropagation(setStartBtn);
  L.DomEvent.disableClickPropagation(setFinishBtn);

  document.body.appendChild(loader);

  deleteTrashOnMap();

  const updateDistance = (val) => {
    val = Math.min(MAX_DIST, Math.max(MIN_DIST, Math.round(val / STEP_DIST) * STEP_DIST));
    distanceSlider.value = val;
    distanceValue.textContent = val.toFixed(1) + ' км';
  };

  const updatePriority = (val) => {
    val = Math.min(MAX_PRI, Math.max(MIN_PRI, Math.round(val / STEP_PRI) * STEP_PRI));
    val = parseFloat(val.toFixed(1));
    prioritySlider.value = val;
    priorityValue.textContent = getPriorityLabel(val);
  };

  updateDistance(+distanceSlider.value);
  updatePriority(+prioritySlider.value);

  setStartBtn.addEventListener('click', () => {
    isSettingStart = !isSettingStart;
    if (isSettingStart) isSettingFinish = false;
    setStartBtn.classList.toggle('map-control-btn--active', isSettingStart);
    setFinishBtn.classList.toggle('map-control-btn--active', false);
    mapContainer.style.cursor = isSettingStart ? 'url(/src/img/pin.png), crosshair' : '';
  });

  setFinishBtn.addEventListener('click', () => {
    isSettingFinish = !isSettingFinish;
    if (isSettingFinish) isSettingStart = false;
    setFinishBtn.classList.toggle('map-control-btn--active', isSettingFinish);
    setStartBtn.classList.toggle('map-control-btn--active', false);
    mapContainer.style.cursor = isSettingFinish ? 'url(/src/img/pin.png), crosshair' : '';
  });

  map.on('click', (e) => {
    if (isSettingStart) {
      startPoint = e.latlng;
      if (startMarker) startMarker.remove();
      startMarker = L.marker(startPoint, {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;background:url(/src/img/pin.png);background-size:cover;"></div>`,
          iconAnchor: [7, 7],
        }),
      }).addTo(map).bindPopup(`Начальная точка`).openPopup();
      isSettingStart = false;
      setStartBtn.classList.remove('map-control-btn--active');
      mapContainer.style.cursor = '';

    } else if (isSettingFinish) {
      finishPoint = e.latlng;
      if (finishMarker) finishMarker.remove();
      finishMarker = L.marker(finishPoint, {
        icon: L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;background:url(/src/img/pin.png);background-size:cover;"></div>`,
          iconAnchor: [7, 7],
        }),
      }).addTo(map).bindPopup(`Конечная точка`).openPopup();
      isSettingFinish = false;
      setFinishBtn.classList.remove('map-control-btn--active');
      mapContainer.style.cursor = '';
    }
  });

  distanceBtns[0].addEventListener('click', () => updateDistance(+distanceSlider.value - STEP_DIST));
  distanceBtns[1].addEventListener('click', () => updateDistance(+distanceSlider.value + STEP_DIST));
  distanceSlider.addEventListener('input', () => updateDistance(+distanceSlider.value));

  priorityBtns[0].addEventListener('click', () => updatePriority(+prioritySlider.value - STEP_PRI));
  priorityBtns[1].addEventListener('click', () => updatePriority(+prioritySlider.value + STEP_PRI));
  prioritySlider.addEventListener('input', () => updatePriority(+prioritySlider.value));

  openModalBtn.addEventListener('click', () => {
    if (routeType === 'circle' && !startPoint) {
      Notify.error('Сначала укажите начальную точку маршрута');
      return;
    }
    if (routeType === 'line' && (!startPoint || !finishPoint)) {
      Notify.error('Сначала укажите начальную и конечную точки маршрута');
      return;
    }
    modal.classList.add('modal--active');
    modalOverlay.classList.add('modal-overlay--active');
    renderStep1(ctx);
  });

  closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  });

  routeSwitch.addEventListener('change', () => {
    if (routeSwitch.checked) {
      routeType = "line";
      setFinishBtn.classList.remove("bbox-btn-hide");
    } else {
      routeType = "circle";
      setFinishBtn.classList.add("bbox-btn-hide");

      if (finishMarker) {
        finishMarker.remove();
        finishMarker = null;
      }
      finishPoint = null;
    }
  });

  tileSwitch.addEventListener('change', () => {
    if (tileSwitch.checked) {
      getAllTiles()
        .then((res) => { drawTiles(coveredLayer, res); map.addLayer(coveredLayer); })
        .catch((error) => { Notify.error(error); map.removeLayer(coveredLayer); });
    } else {
      map.removeLayer(coveredLayer);
    }
  });

  for (const layerBtn of mapLayersBtns) {
    layerBtn.addEventListener('click', (evt) => {
      const btn       = evt.currentTarget;
      const layerName = btn.dataset.layer;
      const { layer, color: poiColor } = layersMap[layerName];

      btn.classList.toggle('map-layer-chip--active');

      if (btn.classList.contains('map-layer-chip--active')) {
        btn.style.background = poiColor;
        btn.style.color = "#fff";
        getPOIbyCategory(layerName)
          .then((result) => {
            const points = result.items.map(item => ({ coords: [item.lat, item.lon], name: item.name || 'Unnamed' }));
            drawPOI(layer, points, poiColor);
            map.addLayer(layer);
          })
          .catch((error) => {
            Notify.error(error);
            btn.classList.toggle('map-layer-chip--active');
            btn.style.color = "#00e6c3";
            btn.style.background = "transparent";
          });
      } else {
        map.removeLayer(layer);
        btn.style.color = "#00e6c3";
        btn.style.background = "transparent";
      }
    });
  }

  importBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) { Notify.error("Файл не выбран"); return; }
      showLoader(loader, 'Идёт импорт бд');
      importDb(file)
        .then(({ nodesRestored, relationshipsRestored }) => {
          Notify.success(`База данных импортирована! узлы:${nodesRestored} связи:${relationshipsRestored}`);
        })
        .catch((error) => Notify.error(error))
        .finally(() => hideLoader(loader));
    };
    fileInput.click();
  });

  exportBtn.addEventListener('click', () => {
    showLoader(loader, 'Идёт экспорт бд');
    downloadFile('http://127.0.0.1:10001/api/data/db/export', 'bd_dump.json')
      .then((result) => Notify.success(result))
      .catch((error) => Notify.error(error))
      .finally(() => hideLoader(loader));
  });
});