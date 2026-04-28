import "leaflet/dist/leaflet.css";

import L from 'leaflet';

import { relocateToLogin, getToken } from "../auth";
import { Notify } from "../utils/notify"
import { userManager } from "../localManagers/userManager";

const deleteTrashOnMap = () => {
  const trash = document.querySelector('.leaflet-bottom.leaflet-right');
  trash.innerHTML = '';
}

const getTiles = async () => {
  const userId = userManager.get().id;
  const response = await fetch(`http://127.0.0.1:10001/api/map/tiles/?userId=${userId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'credentials': true
    },
    credentials: 'include',
  }).catch((error) => {
    Notify.error("Ошибка сервера: не удалось получить Tiles");
    return false;
  });
  const data = await response.json();
  return data;
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

const getPOI = async (type) => {
  const lat = 59.9676;
  const lon = 30.3129;
  const radius = 3000;


  const tags = {
    parks: 'leisure=park',
    museums: 'tourism=museum',
    cafes: 'amenity=cafe',
    monuments: 'historic=memorial'
  };

  const query = `
    [out:json];
    (
      node[${tags[type]}](around:${radius},${lat},${lon});
      way[${tags[type]}](around:${radius},${lat},${lon});
      relation[${tags[type]}](around:${radius},${lat},${lon});
    );
    out center;
  `;

  try {
    const response = await fetch(
      "https://overpass-api.de/api/interpreter",
      {
        method: "POST",
        body: query
      }
    );

    const data = await response.json();

    return data.elements.map(item => ({
      name: item.tags?.name || "Без названия",
      coords: item.lat
        ? [item.lat, item.lon]
        : [item.center.lat, item.center.lon]
    }));
  } catch (error) {
    Notify.error(`Ошибка загрузки ${type}`);
    throw (error);
  }
};

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

const downloadBlob = async (url, filename) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getToken()}`
    },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error("Ошибка экспорта");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  a.remove();
  window.URL.revokeObjectURL(objectUrl);
};

const exportData = async () => {
  const userId = userManager.get().id;

  try {
    await Promise.all([
      downloadBlob(`http://127.0.0.1:10001/api/data/export/walks/?userId=${userId}`, "walks.csv"),
      downloadBlob(`http://127.0.0.1:10001/api/data/export/walkpoints/?userId=${userId}`, "walkpoints.csv"),
      downloadBlob(`http://127.0.0.1:10001/api/data/export/tiles/?userId=${userId}`, "tiles.csv"),
    ]);

    Notify.success("Файлы успешно экспортированы");
  } catch (error) {
    Notify.error("Ошибка сервера: не удалось экспортировать данные");
    console.error(error);
  }
};

const importData = async (walksFile, walkpointsFile) => {
  const userId = userManager.get().id;

  try {
    const formData = new FormData();
    formData.append("walks_file", walksFile);
    formData.append("walkpoints_file", walkpointsFile);

    const response = await fetch(
      `http://127.0.0.1:10001/api/data/import/walks/?userId=${userId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`
        },
        credentials: "include",
        body: formData
      }
    );

    if (!response.ok) {
      throw new Error("Ошибка импорта");
    }

    Notify.success("Файл успешно импортирован");
  } catch (error) {
    Notify.error("Ошибка сервера: не удалось импортировать данные");
    console.error(error);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  const radiusSlider = document.getElementById('radius-slider');
  const poiInput = document.getElementById('poi-toggle');
  const openModalBtn = document.getElementById('build-route-btn');
  const closeModalBtn = document.querySelector('.modal-close');
  const mapLayersBtns = Array.from(document.querySelectorAll('.map-layer-chip'));
  const modalOverlay = document.querySelector('.modal-overlay');
  const modal = document.querySelector('.modal');
  const importBtn = document.getElementById('import-btn');
  const exportBtn = document.getElementById('export-btn');


  const map = L.map('map', { zoomControl: true }).setView([59.9676, 30.3129], 14);
  const coveredLayer = L.layerGroup().addTo(map);
  const parksLayer = L.layerGroup().addTo(map);
  const museumsLayer = L.layerGroup().addTo(map);
  const cafesLayer = L.layerGroup().addTo(map);
  const monumentsLayer = L.layerGroup().addTo(map);

  const layersMap = {
    parks: {
      layer: parksLayer,
      color: "green"
    },
    museums: {
      layer: museumsLayer,
      color: "blue"
    },
    cafes: {
      layer: cafesLayer,
      color: "orange"
    },
    monuments: {
      layer: monumentsLayer,
      color: "gray"
    }
  };

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  importBtn.addEventListener('click', () => {
    const walksInput = document.createElement('input');
    walksInput.type = 'file';
    walksInput.accept = '.csv';

    walksInput.addEventListener('change', () => {
      const walkpointsInput = document.createElement('input');
      walkpointsInput.type = 'file';
      walkpointsInput.accept = '.csv';

      walkpointsInput.addEventListener('change', () => {
        importData(walksInput.files[0], walkpointsInput.files[0]);
      });

      walkpointsInput.click();
    });

    walksInput.click();
  });

  exportBtn.addEventListener('click', () => {
    console.log('export');
    exportData()
      .then((result) => {
        console.log(result);
      });
  })

  radiusSlider.addEventListener('change', (evt) => {
    const value = evt.target.value;
    const radiusText = document.getElementById('radius-value');
    radiusText.textContent = `${value}m`;
    Notify.success(`Значение радиуса охвата изменено на ${evt.target.value}м`);
  });

  poiInput.addEventListener('change', (evt) => {
    const isChecked = evt.target.checked;
    Notify.warning(`Точки интереса ${isChecked ? 'включены' : 'выключены'}`);
  });

  openModalBtn.addEventListener('click', () => {
    modal.classList.add('modal--active');
    modalOverlay.classList.add('modal-overlay--active');
  })

  closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  })

  for (const layerBtn of mapLayersBtns) {
    layerBtn.addEventListener('click', (evt) => {
      const btn = evt.currentTarget;
      const layerName = btn.dataset.layer;
      const layer = layersMap[layerName].layer;
      const poiColor = layersMap[layerName].color;

      btn.classList.toggle('map-layer-chip--active');

      if (btn.classList.contains('map-layer-chip--active')) {
        getPOI(layerName).then((result) => drawPOI(layer, result, poiColor))
          .catch((error) => {
            btn.classList.toggle('map-layer-chip--active');
          });
      } else {
        map.removeLayer(layer);
      }
    });
  }

  map.on('moveend', () => {
    const center = map.getCenter();
    const bounds = map.getBounds();

    const north = bounds.getNorth();

    const radius = map.distance(
      center,
      L.latLng(north, center.lng)
    );
    console.log(radius);
  })

  // getTiles().then((tiles) => drawTiles(coveredLayer, tiles));

  deleteTrashOnMap();
})