import "leaflet/dist/leaflet.css";

import L from 'leaflet';

import { relocateToLogin} from "../auth";
import { getToken } from "../auth";
import { Notify } from "../utils/notify"
import { userManager } from "../localManagers/userManager";
import { deleteTrashOnMap } from "../utils/mapUtils"
import { drawPOI } from "../utils/mapUtils";
import { buildQuery } from "../utils/api"
import { getTiles } from "../utils/api";
import { drawTiles } from "../utils/mapUtils";
import { initMapSelectors } from "../utils/mapUtils";

const getPOI = async (category) => {
  const query = buildQuery({
    name: '',
    category: category,
    bbox: '',
    route_id: '',
    limit: 100,
    offset: '',
  });
  const response = await fetch(`http://127.0.0.1:10001/api/pois/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить POIs"); return false; });
  return await response.json();
}

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  const openModalBtn = document.getElementById('build-route-btn');
  const closeModalBtn = document.querySelector('.modal-close');
  const tileSwitch = document.querySelector('.map-layer__switch-input');
  const mapLayersBtns = Array.from(document.querySelectorAll('.map-layer-chip'));
  const modalOverlay = document.querySelector('.modal-overlay');
  const modal = document.querySelector('.modal');

  const map = L.map('map', { zoomControl: true }).setView([59.9676, 30.3129], 14);
  const coveredLayer  = L.layerGroup().addTo(map);
  const barsLayer     = L.layerGroup().addTo(map);
  const cafesLayer    = L.layerGroup().addTo(map);
  const restaurantsLayer = L.layerGroup().addTo(map);
  const hotelsLayer   = L.layerGroup().addTo(map);
  const fastfoodLayer = L.layerGroup().addTo(map);
  const librariesLayer = L.layerGroup().addTo(map);
  const pubsLayer     = L.layerGroup().addTo(map);
  const bakeriesLayer = L.layerGroup().addTo(map);
  const monumentsLayer = L.layerGroup().addTo(map);
  const museumsLayer  = L.layerGroup().addTo(map);

  const layersMap = {
    bar: {
      layer: barsLayer,
      color: "purple"
    },
    cafe: {
      layer: cafesLayer,
      color: "orange"
    },
    restaurant: {
      layer: restaurantsLayer,
      color: "red"
    },
    hotel: {
      layer: hotelsLayer,
      color: "blue"
    },
    fast_food: {
      layer: fastfoodLayer,
      color: "#4b9f0e"
    },
    library: {
      layer: librariesLayer,
      color: "teal"
    },
    pub: {
      layer: pubsLayer,
      color: "brown"
    },
    bakery: {
      layer: bakeriesLayer,
      color: "#ff11eb"
    },
    memorial: {
      layer: monumentsLayer,
      color: "gray"
    },
    museum: {
      layer: museumsLayer,
      color: "indigo"
    }
  };

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(map);

  initMapSelectors(map);

  openModalBtn.addEventListener('click', () => {
    modal.classList.add('modal--active');
    modalOverlay.classList.add('modal-overlay--active');
  })

  closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  })

  tileSwitch.addEventListener('change', () => {
    if (tileSwitch.checked) {
      getTiles()
        .then((res) => {
          drawTiles(coveredLayer, res);
          map.addLayer(coveredLayer);
        })
        .catch((error) => {
          Notify.error(error);
          map.removeLayer(coveredLayer);
        })
    } else {
        map.removeLayer(coveredLayer);
    }
  });

  for (const layerBtn of mapLayersBtns) {
    layerBtn.addEventListener('click', (evt) => {
      const btn = evt.currentTarget;
      const layerName = btn.dataset.layer;
      const layer = layersMap[layerName].layer;
      const poiColor = layersMap[layerName].color;

      btn.style.background = poiColor;
      btn.style.color = "#fff";

      btn.classList.toggle('map-layer-chip--active');

      if (btn.classList.contains('map-layer-chip--active')) {
        getPOI(layerName)
          .then((result) => {
            const points = result.items.map(item => ({
              coords: [item.lat, item.lon],
              name: item.name || 'Unnamed'
            }));
            drawPOI(layer, points, poiColor);
            map.addLayer(layer);
          })
          .catch((error) => {
            Notify.error(error);
            btn.classList.toggle('map-layer-chip--active');
            btn.style.color = "#00e6c3";
            btn.background = "transparent";
          });
      } else {
        map.removeLayer(layer);
        btn.style.color = "#00e6c3";
        btn.style.background = "transparent";
      }
    });
  }

  deleteTrashOnMap();
})