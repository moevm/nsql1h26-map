import { relocateToLogin } from "../auth.js";
import {
  initFilters,
  buildFilterParams,
  activeFilters,
} from "../filters/routesFilter.js";
import { getToken } from "../auth.js";
import { userManager } from "../localManagers/userManager.js";
import { Notify } from "../utils/notify.js";

const API_BASE = "http://127.0.0.1:10001/api";

let currentPage = 1;
let perPage = 5;
let routes = [];
let totalRoutes = 0;
let selectedIds = [];
const userId = userManager.get().id;
let currentHighlightedRow = null;
let mapRoutesLoaded = false;

let routeModalMap = null;
let routeModalLayer = null;
let editableMarkers = [];
let currentModalRoute = null;

let allRoutes = [];

document.addEventListener("DOMContentLoaded", async () => {
  relocateToLogin();
  initMap();

  initFilters();

  window.addEventListener("filters-updated", () => {
    currentPage = 1;
    loadRoutes();
  });

  await loadRoutes();
  await loadAllRoutesForStats();

  initPerPage();
  initSelectAll();
});

async function loadAllRoutesForStats() {
  const url = `${API_BASE}/routes/?userId=${userId}&offset=0&limit=100`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  const data = await response.json();
  allRoutes = data.items || [];

  updateDashboardStats();
}

async function loadRoutes() {
  const offset = (currentPage - 1) * perPage;
  let url = `${API_BASE}/routes/?userId=${userId}&offset=${offset}&limit=${perPage}`;

  const filterParams = buildFilterParams();
  if (filterParams) {
    url += `&${filterParams}`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  const data = await response.json();
  routes = data.items || [];
  totalRoutes = data.total || 0;

  renderTable();
  updatePaginationInfo();

  await loadAndDrawAllFilteredRoutes();
}

function updateDashboardStats() {
  if (!allRoutes || allRoutes.length === 0) {
    document.querySelector(
      ".dashboard__card--dist .dashboard__card-number",
    ).textContent = "0";
    document.querySelector(
      ".dashboard__card--time .dashboard__card-number",
    ).textContent = "0";
    return;
  }

  const totalDistanceKm = allRoutes.reduce((sum, route) => {
    const distance = route.totalDistanceMeters
      ? route.totalDistanceMeters / 1000
      : 0;
    return sum + distance;
  }, 0);

  const avgTimeMinutes =
    allRoutes.reduce((sum, route) => {
      return sum + (route.estimatedMinutes || 0);
    }, 0) / allRoutes.length;

  const formattedDistance = totalDistanceKm.toLocaleString("ru-RU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  let formattedTime;
  if (avgTimeMinutes >= 60) {
    const hours = Math.floor(avgTimeMinutes / 60);
    const mins = Math.round(avgTimeMinutes % 60);
    formattedTime = `${hours} ч ${mins}мин`;
  } else {
    formattedTime = `${Math.round(avgTimeMinutes)} мин`;
  }

  const distanceElement = document.querySelector(
    ".dashboard__card--dist .dashboard__card-number",
  );
  const timeElement = document.querySelector(
    ".dashboard__card--time .dashboard__card-number",
  );

  if (distanceElement) distanceElement.textContent = formattedDistance;
  if (timeElement) timeElement.textContent = formattedTime;
}

function formatDuration(estimatedMinutes) {
  if (!estimatedMinutes && estimatedMinutes !== 0) return "—";
  if (estimatedMinutes >= 60) {
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    return `${hours}ч ${mins}м`;
  }
  return `${estimatedMinutes}м`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const months = [
    "Янв",
    "Фев",
    "Мар",
    "Апр",
    "Май",
    "Июн",
    "Июл",
    "Авг",
    "Сен",
    "Окт",
    "Ноя",
    "Дек",
  ];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatTime(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function renderTable() {
  const tbody = document.getElementById("routes-table-body");
  if (!tbody) return;

  if (routes.length === 0) {
    tbody.innerHTML =
      '<tr class="trow"><td colspan="9" style="text-align: center; padding: 20px;">Маршрутов не найдено</td></tr>';
    updatePaginationInfo();
    return;
  }

  tbody.innerHTML = routes
    .map((route, idx) => {
      const rowNumber = (currentPage - 1) * perPage + idx + 1;
      const isSelected = selectedIds.includes(route.id);
      const selectedRowClass = isSelected ? "routes-table__row--selected" : "";
      const durationText = formatDuration(route.estimatedMinutes);
      const formattedDate = formatDate(route.createdAt);
      const formattedTime = formatTime(route.createdAt);
      const distanceKm = route.totalDistanceMeters
        ? (route.totalDistanceMeters / 1000).toFixed(1)
        : "—";

      const newTiles =
        route.newTilesCount !== undefined ? route.newTilesCount : "—";
      const poisCount = route.poiCount !== undefined ? route.poiCount : "-";
      const routeUserId = route.userId || "—";

      return `
      <tr class="${selectedRowClass} trow" data-id="${route.id}">
        <td class="route-num">${rowNumber}</td>
        <td class="route-id">${route.id}</td>
        <td class="route-user-id">${routeUserId}</td>
        <td class="route-date-time">${formattedDate} · ${formattedTime}</td>
        <td class="route-dist">${distanceKm}</td>
        <td class="route-duration">${durationText}</td>
        <td class="route-new-tiles">${newTiles}</td>
        <td class="route-places">${poisCount}</td>
        <td>
          <button class="action-btn" data-action="delete" data-id="${route.id}">
            <img src="/src/svg/routes/trash.svg" alt="удалить">
          </button>
        </td>
       </tr>
    `;
    })
    .join("");

  attachTableEvents();
  attachRowClickEvents();
  updateSelectAllCheckbox();
  tryHighlightFirstRoute();
}

function attachTableEvents() {
  document.querySelectorAll(".route-checkbox").forEach((cb) => {
    cb.removeEventListener("change", handleCheckboxChange);
    cb.addEventListener("change", handleCheckboxChange);
  });

  document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.removeEventListener("click", handleDeleteClick);
    btn.addEventListener("click", handleDeleteClick);
  });
}

function handleCheckboxChange(e) {
  const id = e.target.dataset.id;
  const row = e.target.closest("tr");

  if (e.target.checked) {
    if (!selectedIds.includes(id)) selectedIds.push(id);
    if (row) row.classList.add("routes-table__row--selected");
  } else {
    selectedIds = selectedIds.filter((i) => i !== id);
    if (row) row.classList.remove("routes-table__row--selected");
  }
  updateSelectAllCheckbox();
}

async function handleDeleteClick(e) {
  const id = e.currentTarget.dataset.id;
  if (confirm(`Удалить маршрут ${id}?`)) {
    const response = await fetch(`${API_BASE}/routes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (response.ok) {
      window.location.reload();
    }
  }
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById("select-all-checkbox");
  if (selectAll) {
    const currentPageIds = routes.map((r) => r.id);
    const allSelected =
      currentPageIds.length > 0 &&
      currentPageIds.every((id) => selectedIds.includes(id));
    selectAll.checked = allSelected;
  }
}

function updatePaginationInfo() {
  const total = totalRoutes;
  const start = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);
  const rangeSpan = document.getElementById("pagination-range");
  const routesCountSpan = document.querySelector(".page-header__count");

  if (rangeSpan) {
    rangeSpan.textContent =
      total > 0
        ? `Показано ${start}-${end} из ${total} маршрутов`
        : `Нет маршрутов`;
  }
  if (routesCountSpan) {
    routesCountSpan.textContent = `${total} маршрутов`;
  }

  renderPaginationControls(total);
}

function renderPaginationControls(total) {
  const maxPage = Math.ceil(total / perPage);
  const controlsContainer = document.querySelector(".pagination__controls");
  if (!controlsContainer) return;

  if (maxPage <= 1) {
    controlsContainer.innerHTML = "";
    return;
  }

  let pages = [];
  if (maxPage <= 7) {
    pages = Array.from({ length: maxPage }, (_, i) => i + 1);
  } else {
    if (currentPage <= 4) {
      pages = [1, 2, 3, 4, 5, "...", maxPage];
    } else if (currentPage >= maxPage - 3) {
      pages = [
        1,
        "...",
        maxPage - 4,
        maxPage - 3,
        maxPage - 2,
        maxPage - 1,
        maxPage,
      ];
    } else {
      pages = [
        1,
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        maxPage,
      ];
    }
  }

  controlsContainer.innerHTML = `
    <button class="pagination__btn pagination__btn--prev" ${currentPage === 1 ? "disabled" : ""}>
      <img src="/src/svg/routes/arrow-left.svg" alt="">
    </button>
    ${pages
      .map((page) => {
        if (page === "...") {
          return '<span class="pagination__dots">...</span>';
        }
        return `<button class="pagination__btn pagination__btn--page ${currentPage === page ? "pagination__btn--active" : ""}" data-page="${page}">${page}</button>`;
      })
      .join("")}
    <button class="pagination__btn pagination__btn--next" ${currentPage === maxPage ? "disabled" : ""}>
      <img src="/src/svg/routes/arrow-right.svg" alt="">
    </button>
  `;

  document.querySelectorAll(".pagination__btn--page").forEach((btn) => {
    btn.removeEventListener("click", handlePageClick);
    btn.addEventListener("click", handlePageClick);
  });

  const prevBtn = controlsContainer.querySelector(".pagination__btn--prev");
  const nextBtn = controlsContainer.querySelector(".pagination__btn--next");
  if (prevBtn) {
    prevBtn.removeEventListener("click", handlePrevClick);
    prevBtn.addEventListener("click", handlePrevClick);
  }
  if (nextBtn) {
    nextBtn.removeEventListener("click", handleNextClick);
    nextBtn.addEventListener("click", handleNextClick);
  }
}

function handlePageClick(e) {
  currentPage = parseInt(e.currentTarget.dataset.page);
  loadRoutes();
}

function handlePrevClick() {
  if (currentPage > 1) {
    currentPage--;
    loadRoutes();
  }
}

function handleNextClick() {
  const maxPage = Math.ceil(totalRoutes / perPage);
  if (currentPage < maxPage) {
    currentPage++;
    loadRoutes();
  }
}

function initSelectAll() {
  const selectAll = document.getElementById("select-all-checkbox");
  if (selectAll) {
    selectAll.addEventListener("change", (e) => {
      if (e.target.checked) {
        selectedIds = routes.map((r) => r.id);
      } else {
        selectedIds = [];
      }
      renderTable();
    });
  }
}

function initPerPage() {
  const perPageSelect = document.getElementById("per-page-select");
  if (!perPageSelect) return;

  perPageSelect.value = perPage.toString();

  perPageSelect.addEventListener("change", (e) => {
    const newValue = parseInt(e.target.value);
    if (!isNaN(newValue) && newValue !== perPage) {
      perPage = newValue;
      currentPage = 1;
      loadRoutes();
    }
  });
}

// Инициализация карты
let map;
let allRouteLayers = [];
let currentHighlightedLayer = null;

function initMap() {
  const mapContainer = document.getElementById("routes-map");
  if (!mapContainer) return;

  map = L.map("routes-map").setView([59.9676, 30.3129], 13);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);
}

function clearAllRoutesFromMap() {
  allRouteLayers.forEach((layer) => {
    if (map) map.removeLayer(layer);
  });
  allRouteLayers = [];
  currentHighlightedLayer = null;
}

function drawAllRoutesOnMap(routesData) {
  if (!map) return;
  clearAllRoutesFromMap();

  routesData.forEach((route) => {
    if (route.nodes && route.nodes.length > 0) {
      const latlngs = route.nodes.map((n) => [n.lat, n.lon]);
      const polyline = L.polyline(latlngs, {
        color: "#00e5a0",
        weight: 2,
        opacity: 0.6,
        originalColor: "#00e5a0",
      }).addTo(map);
      polyline.routeId = route.id;
      allRouteLayers.push(polyline);
    }
  });

  if (allRouteLayers.length > 0 && map) {
    const group = L.featureGroup(allRouteLayers);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  }

  mapRoutesLoaded = true;
  tryHighlightFirstRoute();
}

async function loadAndDrawAllFilteredRoutes() {
  let url = `${API_BASE}/routes/?userId=${userId}&offset=0&limit=100`;

  const filterParams = buildFilterParams();
  if (filterParams) {
    url += `&${filterParams}`;
  }

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (response.ok) {
      const data = await response.json();
      const allFilteredRoutes = data.items || [];

      const routesWithNodes = [];
      for (const route of allFilteredRoutes) {
        try {
          const routeDetailResponse = await fetch(
            `${API_BASE}/routes/${route.id}`,
            {
              headers: { Authorization: `Bearer ${getToken()}` },
            },
          );
          if (routeDetailResponse.ok) {
            const routeDetail = await routeDetailResponse.json();
            if (routeDetail.nodes && routeDetail.nodes.length > 0) {
              routesWithNodes.push(routeDetail);
            }
          }
        } catch (e) {
          Notify.error("Ошибка загрузки деталей маршрута:", route.id);
        }
      }

      drawAllRoutesOnMap(routesWithNodes);
    }
  } catch (error) {
    Notify.error("Ошибка загрузки отфильтрованных маршрутов:", error);
  }
}

function highlightRouteOnMap(routeId) {
  if (currentHighlightedLayer) {
    currentHighlightedLayer.setStyle({
      color: "#00e5a0",
      weight: 2,
      opacity: 0.6,
    });
    currentHighlightedLayer = null;
  }

  for (const layer of allRouteLayers) {
    if (layer.routeId === routeId) {
      layer.setStyle({
        color: "#ff4d6d",
        weight: 4,
        opacity: 0.9,
      });
      currentHighlightedLayer = layer;

      map.fitBounds(layer.getBounds(), { padding: [50, 50] });
      break;
    }
  }
}

function highlightRow(rowElement) {
  if (currentHighlightedRow) {
    currentHighlightedRow.classList.remove("routes-table__row--highlighted");
  }

  if (rowElement) {
    rowElement.classList.add("routes-table__row--highlighted");
    currentHighlightedRow = rowElement;
  } else {
    currentHighlightedRow = null;
  }
}

function tryHighlightFirstRoute() {
  if (mapRoutesLoaded && routes.length > 0) {
    const firstRow = document.querySelector(".routes-table tbody tr");
    if (firstRow) {
      const routeId = firstRow.dataset.id;
      if (routeId) {
        highlightRow(firstRow);
        highlightRouteOnMap(routeId);
      }
    }
  }
}

function handleRowClick(e) {
  if (e.target.type === "checkbox" || e.target.closest(".action-btn")) {
    return;
  }

  const row = e.currentTarget;
  const routeId = row.dataset.id;
  if (routeId) {
    highlightRow(row);
    highlightRouteOnMap(routeId);
    openRouteModal(routeId);
  }
}

function attachRowClickEvents() {
  document.querySelectorAll(".routes-table tbody tr").forEach((row) => {
    row.removeEventListener("click", handleRowClick);
    row.addEventListener("click", handleRowClick);
  });
}

async function openRouteModal(routeId) {
  const modal = document.getElementById("route-modal");

  modal.classList.remove("hidden");

  try {
    const response = await fetch(`${API_BASE}/routes/${routeId}`, {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    });

    const route = await response.json();

    currentModalRoute = structuredClone(route);

    fillModal(route);

    setTimeout(() => {
      initRoutePreviewMap(route);
    }, 0);
  } catch (e) {
    Notify.error(e);
  }
}

function fillModal(route) {
  document.getElementById("route-modal-title").textContent =
    `Маршрут #${route.id}`;

  document.getElementById("route-priority").value = route.priority || "medium";

  document.getElementById("route-target-distance").value =
    route.targetDistance || 0;
}

function initRoutePreviewMap(route) {
  if (routeModalMap) {
    routeModalMap.remove();
  }

  editableMarkers = [];

  routeModalMap = L.map("route-preview-map");

  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(routeModalMap);

  const latlngs = route.nodes.map((n) => [n.lat, n.lon]);

  routeModalLayer = L.polyline(latlngs, {
    color: "#00e5a0",
    weight: 4,
  }).addTo(routeModalMap);

  route.nodes.forEach((node, index) => {
    const marker = L.marker([node.lat, node.lon], {
      draggable: true,
    }).addTo(routeModalMap);

    marker.on("drag", (e) => {
      const latlng = e.target.getLatLng();

      currentModalRoute.nodes[index].lat = latlng.lat;
      currentModalRoute.nodes[index].lon = latlng.lng;

      currentModalRoute.nodes[index].osmId = null;

      updatePreviewPolyline();
    });

    editableMarkers.push(marker);
  });

  routeModalMap.fitBounds(routeModalLayer.getBounds(), {
    padding: [30, 30],
  });
}

function updatePreviewPolyline() {
  if (!routeModalLayer) return;

  const latlngs = currentModalRoute.nodes.map((n) => [n.lat, n.lon]);

  routeModalLayer.setLatLngs(latlngs);
}

document
  .getElementById("route-save-btn")
  .addEventListener("click", async () => {
    try {
      currentModalRoute.priority = Number(
        document.getElementById("route-priority").value,
      );

      currentModalRoute.targetDistance = Number(
        document.getElementById("route-target-distance").value,
      );

      const nodes = currentModalRoute.nodes.map((node, index) => ({
        osmId: node.osmId,
        lat: node.lat,
        lon: node.lon,
        order: index,
      }));

      const response = await fetch(
        `${API_BASE}/routes/${currentModalRoute.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            priority: currentModalRoute.priority,
            targetDistance: currentModalRoute.targetDistance,
            nodes,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to update route");
      }

      const updatedRoute = await response.json();

      Notify.success("Маршрут успешно обновлён");

      closeRouteModal();

      await loadRoutes();
      await loadAllRoutesForStats();
    } catch (e) {
      Notify.error("Не удалось обновить маршрут");
    }
  });

document
  .getElementById("route-delete-btn")
  .addEventListener("click", async () => {
    if (!confirm("Удалить маршрут?")) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE}/routes/${currentModalRoute.id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${getToken()}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to delete route");
      }

      Notify.success("Маршрут удалён");

      closeRouteModal();

      await loadRoutes();
      await loadAllRoutesForStats();

      clearAllRoutesFromMap();

      await loadAndDrawAllFilteredRoutes();
    } catch (e) {
      Notify.error("Удалить маршрут не удалось");
    }
  });

function closeRouteModal() {
  document.getElementById("route-modal").classList.add("hidden");

  if (routeModalMap) {
    routeModalMap.remove();
    routeModalMap = null;
  }
}

document
  .getElementById("route-modal-close")
  .addEventListener("click", closeRouteModal);

document
  .querySelector(".route-modal__overlay")
  .addEventListener("click", closeRouteModal);
