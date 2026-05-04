import "leaflet/dist/leaflet.css";
import L from "leaflet";

import { relocateToLogin } from "../auth";

import { userManager } from "../localManagers/userManager";

import { Notify } from "../utils/notify";

import { renderTable } from "../utils/table";
import { initSlider } from "../utils/slider";

import { initMapSelectors } from "../utils/mapUtils";
import { drawPOI } from "../utils/mapUtils";
import { drawTiles } from "../utils/mapUtils";
import { deleteTrashOnMap } from "../utils/mapUtils";

import { getPois } from "../utils/api";
import { getTiles } from "../utils/api";
import { getWalkPoints } from "../utils/api";
import { getMapNodes } from "../utils/api";
import { fetchEntityData } from "../utils/api";
import { getPoisCategories } from "../utils/api";

const closeModal = () => {
  document.querySelector('.modal-overlay').classList.remove('modal-overlay--active');
  document.querySelector('.modal').classList.remove('modal--active');
};

const initModalListeners = () => {
  document.querySelector('.modal-close')?.addEventListener('click', closeModal);
  document.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
};

document.addEventListener("DOMContentLoaded", () => {
  relocateToLogin();

  const map = L.map(
    "map",
    {
      zoomControl: true
    }
  ).setView(
    [59.9676, 30.3129],
    14,
  );

  initMapSelectors(map);

  const walkpointsLayer = L.layerGroup().addTo(map);
  const poisLayer = L.layerGroup().addTo(map);
  const mapnodesLayer = L.layerGroup().addTo(map);
  const tilesLayer = L.layerGroup().addTo(map);

  const applyBtn = document.getElementById("build-route-btn");
  const entitySelect = document.getElementById("entity-select");
  const perPageSel = document.getElementById("per-page-select");

  const filterTabs = document.querySelectorAll(".filter-tab");
  const filterPanels = document.querySelectorAll(".filter-panel");

  const tileLimitInput = document.getElementById('tile-limit-slider');
  const mnLimitInput = document.getElementById('mn-radius-slider');
  const wpLimitInput = document.getElementById('wp-radius-slider');
  const poiLimitInput = document.getElementById('poi-radius-slider');

  const tileOffsetInput = document.getElementById('tile-offset-slider');
  const mnOffsetInput = document.getElementById('mn-offset-slider');
  const wpOffsetInput = document.getElementById('wp-offset-slider');
  const poiOffsetInput = document.getElementById('poi-offset-slider');

  tileLimitInput.addEventListener('change', (evt) => {
    const limit = document
                  .querySelector(`label[for="tile-limit-slider"]`)
                  .querySelector('.limit-value');
    limit.textContent = evt.target.value;
  })

  mnLimitInput.addEventListener('change', (evt) => {
    const limit = document
                  .querySelector(`label[for="mn-radius-slider"]`)
                  .querySelector('.limit-value');
    limit.textContent = evt.target.value;
  })

  wpLimitInput.addEventListener('change', (evt) => {
    const limit = document
                  .querySelector(`label[for="wp-radius-slider"]`)
                  .querySelector('.limit-value');
    limit.textContent = evt.target.value;
  })

  poiLimitInput.addEventListener('change', (evt) => {
    const limit = document
                  .querySelector(`label[for="poi-radius-slider"]`)
                  .querySelector('.limit-value');
    limit.textContent = evt.target.value;
  })

  tileOffsetInput.addEventListener('change', (evt) => {
    const offset = document
                  .querySelector(`label[for="tile-offset-slider"]`)
                  .querySelector('.offset-value');
    offset.textContent = evt.target.value;
  })

  mnOffsetInput.addEventListener('change', (evt) => {
    const offset = document
                  .querySelector(`label[for="mn-offset-slider"]`)
                  .querySelector('.offset-value');
    offset.textContent = evt.target.value;
  })

  wpOffsetInput.addEventListener('change', (evt) => {
    const offset = document
                  .querySelector(`label[for="wp-offset-slider"]`)
                  .querySelector('.offset-value');
    offset.textContent = evt.target.value;
  })

  poiOffsetInput.addEventListener('change', (evt) => {
    const offset = document
                  .querySelector(`label[for="poi-offset-slider"]`)
                  .querySelector('.offset-value');
    offset.textContent = evt.target.value;
  })

  const mapLayersBtns = Array.from(
    document.querySelectorAll(".map-layer-chip"),
  );

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

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "© OpenStreetMap, © CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  deleteTrashOnMap();

  for (const layerBtn of mapLayersBtns) {
    layerBtn.addEventListener("click", (evt) => {
      const btn = evt.currentTarget;
      const layerName = btn.dataset.layer;
      const layer = layersMap[layerName].layer;

      btn.classList.toggle("map-layer-chip--active");

      if (!btn.classList.contains("map-layer-chip--active")) {
        map.removeLayer(layer);
        btn.style.background = "transparent";
        btn.style.color = "#00e6c3";
        return;
      }

      if (layerName === "tiles") {
        getTiles().
          then((tiles) => {
            drawTiles(layer, tiles.items);
            btn.style.background = "rgba(0, 230, 195, 0.5)";
            btn.style.color = "#fff";
          });
        map.addLayer(layer);
      }

      if (layerName === "pois") {
        getPois()
          .then((result) => {
            const points = result.items.map((item) => ({
              coords: [item.lat, item.lon],
              name: item.name || "Unnamed",
            }));
            drawPOI(layer, points, "red");
            btn.style.background = "red";
            btn.style.color = "#fff";
          })
          .catch(() => {
            btn.classList.toggle("map-layer-chip--active");
            btn.style.background = "transparent";
            btn.style.color = "#00e6c3";
          });
        map.addLayer(layer);
      }

      if (layerName === "walkpoints") {
        getWalkPoints()
          .then((result) => {
            const points = result.items.map((item) => ({
              coords: [item.lat, item.lon],
              name: item.name || "Unnamed",
            }));
            drawPOI(layer, points, "blue");
            btn.style.background = "blue";
            btn.style.color = "#fff";
          })
          .catch(() => {
            btn.classList.toggle("map-layer-chip--active");
            btn.style.background = "transparent";
            btn.style.color = "#00e6c3";
          });
        map.addLayer(layer);
      }

      if (layerName === "mapnodes") {
        getMapNodes()
          .then((result) => {
            const points = result.items.map((item) => ({
              coords: [item.lat, item.lon],
              name: item.name || "Unnamed",
            }));
            drawPOI(layer, points, "green");
            btn.style.background = "green";
            btn.style.color = "#fff";
          })
          .catch(() => {
            btn.classList.toggle("map-layer-chip--active");
            btn.style.background = "transparent";
            btn.style.color = "#00e6c3";
          });
        map.addLayer(layer);
      }
    });
  }

  filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const filterName = tab.dataset.filter;
      const activePanel = document.querySelector(
        `.filter-panel[data-filter="${filterName}"]`,
      );

      filterTabs.forEach((t) => t.classList.remove("filter-tab--active"));
      filterPanels.forEach((p) => p.classList.remove("filter-panel--active"));

      tab.classList.add("filter-tab--active");
      activePanel.classList.add("filter-panel--active");
    });
  });

  initSlider("content-track", "btn-table", "btn-map", (slideIndex) => {
    if (slideIndex === 1) {
      setTimeout(() => map.invalidateSize(), 100);
    }
  });

  const btnTable = document.getElementById("btn-table");
  const btnMap = document.getElementById("btn-map");

  btnTable.addEventListener("click", () => {
    btnTable.classList.add("active");
    btnMap.classList.remove("active");
  });

  btnMap.addEventListener("click", () => {
    btnMap.classList.add("active");
    btnTable.classList.remove("active");
  });

  perPageSel.addEventListener("change", (e) => {
    tableState.perPage = Number(e.target.value);
    tableState.page = 1;
    if (tableState.entity) renderTable(tableState);
  });

  entitySelect.addEventListener("change", () => {
    tableState.entity = null;
    tableState.items = [];
    tableState.page = 1;
  });

  applyBtn.addEventListener("click", () => {
    const entity = entitySelect.value;

    applyBtn.disabled = true;
    applyBtn.querySelector("span").textContent = "Загрузка...";

    fetchEntityData(entity)
      .then((items) => {
        console.log(items);
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
        applyBtn.querySelector("span").textContent = "Применить";
      });
  });

  fetchEntityData("pois")
    .then((result) => {
      entitySelect.value = "pois";

      tableState.items = result;
      tableState.entity = "pois";
      tableState.page = 1;
      renderTable(tableState);
    })
    .catch((error) => {
      Notify.error(`${error}`);
    });
  
    getPoisCategories()
      .then((res) => {
        const select = document.querySelector('.map-control__input--select-category');
        for (const item of res.categories) {
          const option = document.createElement("option");
          option.setAttribute("value", item);
          option.textContent = item;
          option.classList.add('map-control__input-option');
          select.appendChild(option);
        }
    });

  initModalListeners();
});
