import { relocateToLogin } from "../auth.js";
import { getToken } from "../auth.js";
import { userManager } from "../localManagers/userManager.js";
import { initFilters, buildFilterParams, activeFilters } from "../filters/walksFilter.js";
import { exportSelectedWalks } from "../utils/walksExportUtils.js";

const API_BASE = "http://127.0.0.1:10001/api";

let currentPage = 1;
let perPage = 5;
let walks = [];
let totalWalks = 0;
let selectedIds = [];
const userId = userManager.get().id;
let currentHighlightedRow = null;
let mapWalksLoaded = false;

// для статистики
let allWalks = [];

document.addEventListener('DOMContentLoaded', async () => {
  relocateToLogin();
  initMap();

  initFilters();
  
  window.addEventListener('filters-updated', () => {
    currentPage = 1;
    loadWalks();
  });

  await loadWalks();
  await loadAllWalksForStats();
  
  initPerPage();
  initSelectAll();
  initExport();
});

async function loadAllWalksForStats() {
  const url = `${API_BASE}/walks/?userId=${userId}&offset=0&limit=100`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  
  const data = await response.json();
  allWalks = data.items || [];
  
  updateDashboardStats();
}

async function loadWalks() {
  const offset = (currentPage - 1) * perPage;
  let url = `${API_BASE}/walks/?userId=${userId}&offset=${offset}&limit=${perPage}`;

  const filterParams = buildFilterParams();
  if (filterParams) {
    url += `&${filterParams}`;
  }
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  
  const data = await response.json();
  walks = data.items || [];
  totalWalks = data.total || 0;
  
  renderTable();
  updatePaginationInfo();
  
  await loadAndDrawAllFilteredWalks();
}

function updateDashboardStats() {
  if (!allWalks || allWalks.length === 0) {
    document.querySelector('.dashboard__card--dist .dashboard__card-number').textContent = '0';
    document.querySelector('.dashboard__card--time .dashboard__card-number').textContent = '0';
    return;
  }
  
  const totalDistanceKm = allWalks.reduce((sum, walk) => {
    const distance = walk.distanceMeters ? walk.distanceMeters / 1000 : 0;
    return sum + distance;
  }, 0);
  
  const avgDurationMinutes = allWalks.reduce((sum, walk) => {
    return sum + (walk.durationSeconds ? walk.durationSeconds / 60 : 0);
  }, 0) / allWalks.length;
  
  const formattedDistance = totalDistanceKm.toLocaleString('ru-RU', { 
    minimumFractionDigits: 1, 
    maximumFractionDigits: 1 
  });
  
  let formattedTime;
  if (avgDurationMinutes >= 60) {
    const hours = Math.floor(avgDurationMinutes / 60);
    const mins = Math.round(avgDurationMinutes % 60);
    formattedTime = `${hours} ч ${mins}мин`;
  } else {
    formattedTime = `${Math.round(avgDurationMinutes)} мин`;
  }
  
  const distanceElement = document.querySelector('.dashboard__card--dist .dashboard__card-number');
  const timeElement = document.querySelector('.dashboard__card--time .dashboard__card-number');
  
  if (distanceElement) distanceElement.textContent = formattedDistance;
  if (timeElement) timeElement.textContent = formattedTime;
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '—';
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}ч ${mins}м`;
  }
  return `${minutes}м`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function renderTable() {
  const tbody = document.getElementById('walks-table-body');
  if (!tbody) return;

  if (walks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Прогулок не найдено</td></tr>';
    updatePaginationInfo();
    return;
  }

  tbody.innerHTML = walks.map((walk, idx) => {
    const rowNumber = (currentPage - 1) * perPage + idx + 1;
    const isSelected = selectedIds.includes(walk.id);
    const selectedRowClass = isSelected ? 'walks-table__row--selected' : '';
    const durationText = formatDuration(walk.durationSeconds);
    const formattedDate = formatDate(walk.startedAt);
    const formattedTime = formatTime(walk.startedAt);
    const distanceKm = walk.distanceMeters ? (walk.distanceMeters / 1000).toFixed(1) : '—';
    
    const newTiles = walk.newTilesCount !== undefined ? walk.newTilesCount : '—';
    const walkUserId = walk.userId || '—';

    return `
      <tr class="${selectedRowClass}" data-id="${walk.id}">
        <td class="walks-table__td--checkbox">
          <input type="checkbox" class="walk-checkbox" data-id="${walk.id}" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="walk-num">${rowNumber}</td>
        <td class="walk-id">${walk.id}</td>
        <td class="walk-user-id">${walkUserId}</td>
        <td class="walk-date-time">${formattedDate} · ${formattedTime}</td>
        <td class="walk-dist">${distanceKm}</td>
        <td class="walk-duration">${durationText}</td>
        <td class="walk-new-tiles">${newTiles}</td>
        <td>
          <button class="action-btn" data-action="delete" data-id="${walk.id}">
            <img src="/src/svg/routes/trash.svg" alt="удалить">
          </button>
        </td>
      </tr>
    `;
  }).join('');

  attachTableEvents();
  attachRowClickEvents();
  updateSelectAllCheckbox();
  tryHighlightFirstWalk();
}

function attachTableEvents() {
  document.querySelectorAll('.walk-checkbox').forEach(cb => {
    cb.removeEventListener('change', handleCheckboxChange);
    cb.addEventListener('change', handleCheckboxChange);
  });

  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.removeEventListener('click', handleDeleteClick);
    btn.addEventListener('click', handleDeleteClick);
  });
}

function handleCheckboxChange(e) {
  const id = e.target.dataset.id;
  const row = e.target.closest('tr');
  
  if (e.target.checked) {
    if (!selectedIds.includes(id)) selectedIds.push(id);
    if (row) row.classList.add('walks-table__row--selected');
  } else {
    selectedIds = selectedIds.filter(i => i !== id);
    if (row) row.classList.remove('walks-table__row--selected');
  }
  updateSelectAllCheckbox();
}

async function handleDeleteClick(e) {
  const id = e.currentTarget.dataset.id;
  if (confirm(`Удалить прогулку ${id}?`)) {
    const response = await fetch(`${API_BASE}/walks/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (response.ok) {
      window.location.reload();
    }
  }
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) {
    const currentPageIds = walks.map(w => w.id);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));
    selectAll.checked = allSelected;
  }
}

function updatePaginationInfo() {
  const total = totalWalks;
  const start = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);
  const rangeSpan = document.getElementById('pagination-range');
  const walksCountSpan = document.querySelector('.page-header__count');
  
  if (rangeSpan) {
    rangeSpan.textContent = total > 0 
      ? `Показано ${start}-${end} из ${total} прогулок`
      : `Нет прогулок`;
  }
  if (walksCountSpan) {
    walksCountSpan.textContent = `${total} прогулок`;
  }
  
  renderPaginationControls(total);
}

function renderPaginationControls(total) {
  const maxPage = Math.ceil(total / perPage);
  const controlsContainer = document.querySelector('.pagination__controls');
  if (!controlsContainer) return;

  if (maxPage <= 1) {
    controlsContainer.innerHTML = '';
    return;
  }

  let pages = [];
  if (maxPage <= 7) {
    pages = Array.from({ length: maxPage }, (_, i) => i + 1);
  } else {
    if (currentPage <= 4) {
      pages = [1, 2, 3, 4, 5, '...', maxPage];
    } else if (currentPage >= maxPage - 3) {
      pages = [1, '...', maxPage - 4, maxPage - 3, maxPage - 2, maxPage - 1, maxPage];
    } else {
      pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', maxPage];
    }
  }

  controlsContainer.innerHTML = `
    <button class="pagination__btn pagination__btn--prev" ${currentPage === 1 ? 'disabled' : ''}>
      <img src="/src/svg/routes/arrow-left.svg" alt="">
    </button>
    ${pages.map(page => {
      if (page === '...') {
        return '<span class="pagination__dots">...</span>';
      }
      return `<button class="pagination__btn pagination__btn--page ${currentPage === page ? 'pagination__btn--active' : ''}" data-page="${page}">${page}</button>`;
    }).join('')}
    <button class="pagination__btn pagination__btn--next" ${currentPage === maxPage ? 'disabled' : ''}>
      <img src="/src/svg/routes/arrow-right.svg" alt="">
    </button>
  `;

  document.querySelectorAll('.pagination__btn--page').forEach(btn => {
    btn.removeEventListener('click', handlePageClick);
    btn.addEventListener('click', handlePageClick);
  });

  const prevBtn = controlsContainer.querySelector('.pagination__btn--prev');
  const nextBtn = controlsContainer.querySelector('.pagination__btn--next');
  if (prevBtn) {
    prevBtn.removeEventListener('click', handlePrevClick);
    prevBtn.addEventListener('click', handlePrevClick);
  }
  if (nextBtn) {
    nextBtn.removeEventListener('click', handleNextClick);
    nextBtn.addEventListener('click', handleNextClick);
  }
}

function handlePageClick(e) {
  currentPage = parseInt(e.currentTarget.dataset.page);
  loadWalks();
}

function handlePrevClick() {
  if (currentPage > 1) {
    currentPage--;
    loadWalks();
  }
}

function handleNextClick() {
  const maxPage = Math.ceil(totalWalks / perPage);
  if (currentPage < maxPage) {
    currentPage++;
    loadWalks();
  }
}

function initSelectAll() {
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedIds = walks.map(w => w.id);
      } else {
        selectedIds = [];
      }
      renderTable();
    });
  }
}

function initPerPage() {
  const perPageSelect = document.getElementById('per-page-select');
  if (!perPageSelect) return;

  perPageSelect.value = perPage.toString();

  perPageSelect.addEventListener('change', (e) => {
    const newValue = parseInt(e.target.value);
    if (!isNaN(newValue) && newValue !== perPage) {
      perPage = newValue;
      currentPage = 1;
      loadWalks();
    }
  });
}

// Инициализация карты
let map;
let allWalkLayers = [];
let currentHighlightedLayer = null;

function initMap() {
  const mapContainer = document.getElementById('walks-map');
  if (!mapContainer) return;
  
  map = L.map('walks-map').setView([59.9676, 30.3129], 13);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);
}

function clearAllWalksFromMap() {
  allWalkLayers.forEach(layer => {
    if (map) map.removeLayer(layer);
  });
  allWalkLayers = [];
  currentHighlightedLayer = null;
}

function drawAllWalksOnMap(walksData) {
  if (!map) return;
  clearAllWalksFromMap();
  
  walksData.forEach(walk => {
    if (walk.points && walk.points.length > 0) {
      const latlngs = walk.points.map(p => [p.lat, p.lon]);
      const polyline = L.polyline(latlngs, {
        color: '#00e5a0',
        weight: 2,
        opacity: 0.6
      }).addTo(map);
      polyline.walkId = walk.id;
      allWalkLayers.push(polyline);
    }
  });
  
  if (allWalkLayers.length > 0 && map) {
    const group = L.featureGroup(allWalkLayers);
    map.fitBounds(group.getBounds(), { padding: [50, 50] });
  }

  mapWalksLoaded = true;
  tryHighlightFirstWalk();
}

async function loadAndDrawAllFilteredWalks() {
  let url = `${API_BASE}/walks/?userId=${userId}&offset=0&limit=100`;
  
  const filterParams = buildFilterParams();
  if (filterParams) {
    url += `&${filterParams}`;
  }
  
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      const allFilteredWalks = data.items || [];
      
      const walksWithPoints = [];
      for (const walk of allFilteredWalks) {
        try {
          const walkDetailResponse = await fetch(`${API_BASE}/walks/${walk.id}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          if (walkDetailResponse.ok) {
            const walkDetail = await walkDetailResponse.json();
            if (walkDetail.points && walkDetail.points.length > 0) {
              walksWithPoints.push(walkDetail);
            }
          }
        } catch (e) {
          console.error('Ошибка загрузки деталей прогулки:', walk.id);
        }
      }
      
      drawAllWalksOnMap(walksWithPoints);
    }
  } catch (error) {
    console.error('Ошибка загрузки отфильтрованных прогулок:', error);
  }
}

function highlightWalkOnMap(walkId) {
  if (currentHighlightedLayer) {
    currentHighlightedLayer.setStyle({
      color: '#00e5a0',
      weight: 2,
      opacity: 0.6
    });
    currentHighlightedLayer = null;
  }
  
  for (const layer of allWalkLayers) {
    if (layer.walkId === walkId) {
      layer.setStyle({
        color: '#ff4d6d',
        weight: 4,
        opacity: 0.9
      });
      currentHighlightedLayer = layer;
      
      map.fitBounds(layer.getBounds(), { padding: [50, 50] });
      break;
    }
  }
}

function highlightRow(rowElement) {
  if (currentHighlightedRow) {
    currentHighlightedRow.classList.remove('walks-table__row--highlighted');
  }
  
  if (rowElement) {
    rowElement.classList.add('walks-table__row--highlighted');
    currentHighlightedRow = rowElement;
  } else {
    currentHighlightedRow = null;
  }
}

function tryHighlightFirstWalk() {
  if (mapWalksLoaded && walks.length > 0) {
    const firstRow = document.querySelector('.walks-table tbody tr');
    if (firstRow) {
      const walkId = firstRow.dataset.id;
      if (walkId) {
        highlightRow(firstRow);
        highlightWalkOnMap(walkId);
      }
    }
  }
}

function handleRowClick(e) {
  if (e.target.type === 'checkbox' || e.target.closest('.action-btn')) {
    return;
  }
  
  const row = e.currentTarget;
  const walkId = row.dataset.id;
  if (walkId) {
    highlightRow(row);
    highlightWalkOnMap(walkId);
  }
}

function attachRowClickEvents() {
  document.querySelectorAll('.walks-table tbody tr').forEach(row => {
    row.removeEventListener('click', handleRowClick);
    row.addEventListener('click', handleRowClick);
  });
}

function initExport() {
  const exportBtn = document.getElementById('export-selected-btn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async () => {
    await exportSelectedWalks(userId, selectedIds, getToken());
  });
}