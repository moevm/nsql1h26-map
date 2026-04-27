import { relocateToLogin } from "../auth.js";
import { initFilters, buildFilterParams, activeFilters } from "../filters/routesFilter.js";

const API_BASE = "http://127.0.0.1:10001/api";
const TEST_EMAIL = "testuser@example.com";
const TEST_PASSWORD = "test123";

let currentPage = 1;
let perPage = 5;
let routes = [];
let totalRoutes = 0;
let selectedIds = [];
let authToken = null;
let userId = null;

// для статистики
let allRoutes = [];

document.addEventListener('DOMContentLoaded', async () => {
  relocateToLogin();
  
  await login();

  initFilters();
  
  window.addEventListener('filters-updated', () => {
    currentPage = 1;
    loadRoutes();
  });

  await loadRoutes();
  await loadAllRoutesForStats();
  
  initPerPage();
  initSelectAll();
});

async function login() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD })
  });
  
  const data = await response.json();
  authToken = data.token;
  userId = data.user.id;
}

async function loadAllRoutesForStats() {
  const url = `${API_BASE}/routes/?userId=${userId}&offset=0&limit=100`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${authToken}` }
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
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  
  const data = await response.json();
  routes = data.items || [];
  totalRoutes = data.total || 0;
  
  renderTable();
  updatePaginationInfo();
}

function updateDashboardStats() {
  if (!allRoutes || allRoutes.length === 0) {
    document.querySelector('.dashboard__card--dist .dashboard__card-number').textContent = '0';
    document.querySelector('.dashboard__card--time .dashboard__card-number').textContent = '0';
    return;
  }
  
  const totalDistanceKm = allRoutes.reduce((sum, route) => {
    const distance = route.totalDistanceMeters ? route.totalDistanceMeters / 1000 : 0;
    return sum + distance;
  }, 0);
  
  const avgTimeMinutes = allRoutes.reduce((sum, route) => {
    return sum + (route.estimatedMinutes || 0);
  }, 0) / allRoutes.length;
  
  const formattedDistance = totalDistanceKm.toLocaleString('ru-RU', { 
    minimumFractionDigits: 1, 
    maximumFractionDigits: 1 
  });
  
  let formattedTime;
  if (avgTimeMinutes >= 60) {
    const hours = Math.floor(avgTimeMinutes / 60);
    const mins = Math.round(avgTimeMinutes % 60);
    formattedTime = `${hours}ч ${mins}м`;
  } else {
    formattedTime = `${Math.round(avgTimeMinutes)}м`;
  }
  

  const distanceElement = document.querySelector('.dashboard__card--dist .dashboard__card-number');
  const timeElement = document.querySelector('.dashboard__card--time .dashboard__card-number');
  
  if (distanceElement) distanceElement.textContent = formattedDistance;
  if (timeElement) timeElement.textContent = formattedTime;
}

function formatDuration(estimatedMinutes) {
  if (!estimatedMinutes && estimatedMinutes !== 0) return '—';
  if (estimatedMinutes >= 60) {
    const hours = Math.floor(estimatedMinutes / 60);
    const mins = estimatedMinutes % 60;
    return `${hours}ч ${mins}м`;
  }
  return `${estimatedMinutes}м`;
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
  const tbody = document.getElementById('routes-table-body');
  if (!tbody) return;

  if (routes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Маршрутов не найдено</td></tr>';
    updatePaginationInfo();
    return;
  }

  tbody.innerHTML = routes.map((route, idx) => {
    const rowNumber = (currentPage - 1) * perPage + idx + 1;
    const isSelected = selectedIds.includes(route.id);
    const selectedRowClass = isSelected ? 'routes-table__row--selected' : '';
    const durationText = formatDuration(route.estimatedMinutes);
    const formattedDate = formatDate(route.createdAt);
    const formattedTime = formatTime(route.createdAt);
    const distanceKm = route.totalDistanceMeters ? (route.totalDistanceMeters / 1000).toFixed(1) : '—';
    
    let coveragePercent = '—';
    if (route.newTilesCount !== undefined && route.allTilesCount && route.allTilesCount > 0) {
      coveragePercent = Math.round((route.newTilesCount / route.allTilesCount) * 100) + '%';
    }
    const poisCount = route.poiCount !== undefined ? route.poiCount : '-';

    return `
      <tr class="${selectedRowClass}" data-id="${route.id}">
        <td class="routes-table__td--checkbox">
          <input type="checkbox" class="route-checkbox" data-id="${route.id}" ${isSelected ? 'checked' : ''}>
        </td>
        <td class="route-num">${rowNumber}</td>
        <td>
          <div class="route-name">Маршрут ${route.id?.slice(0, 8)}</div>
          <div class="route-id">${route.id}</div>
        </td>
        <td class="route-date-time">${formattedDate} · ${formattedTime}</td>
        <td class="route-dist">${distanceKm}</td>
        <td class="route-duration">${durationText}</td>
        <td><span class="coverage-badge">${coveragePercent}</span></td>
        <td class="route-places">${poisCount}</td>
        <td>
          <button class="action-btn" data-action="view" data-id="${route.id}">
            <img src="/src/svg/routes/eye.svg" alt="просмотр">
          </button>
          <button class="action-btn" data-action="delete" data-id="${route.id}">
            <img src="/src/svg/routes/trash.svg" alt="удалить">
          </button>
        </td>
       </tr>
    `;
  }).join('');

  attachTableEvents();
  updateSelectAllCheckbox();
}

function attachTableEvents() {
  document.querySelectorAll('.route-checkbox').forEach(cb => {
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
    if (row) row.classList.add('routes-table__row--selected');
  } else {
    selectedIds = selectedIds.filter(i => i !== id);
    if (row) row.classList.remove('routes-table__row--selected');
  }
  updateSelectAllCheckbox();
}

async function handleDeleteClick(e) {
  const id = e.currentTarget.dataset.id;
  if (confirm(`Удалить маршрут ${id}?`)) {
    const response = await fetch(`${API_BASE}/routes/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (response.ok) {
      window.location.reload();
    }
  }
}

function updateSelectAllCheckbox() {
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) {
    const currentPageIds = routes.map(r => r.id);
    const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));
    selectAll.checked = allSelected;
  }
}

function updatePaginationInfo() {
  const total = totalRoutes;
  const start = total === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, total);
  const rangeSpan = document.getElementById('pagination-range');
  const routesCountSpan = document.querySelector('.page-header__count');
  
  if (rangeSpan) {
    rangeSpan.textContent = total > 0 
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
  const selectAll = document.getElementById('select-all-checkbox');
  if (selectAll) {
    selectAll.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedIds = routes.map(r => r.id);
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
      loadRoutes();
    }
  });
}