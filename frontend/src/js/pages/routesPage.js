import { relocateToLogin } from "../auth";
import { mockRoutes } from "../develop/mockdata.js";

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();
  
  let currentPage = 1;
  let perPage = 5;
  let routes = [...mockRoutes];
  let totalRoutes = routes.length;
  let selectedIds = [];

  function formatDuration(duration) {
    if (duration.minutes >= 60) {
      const hours = Math.floor(duration.minutes / 60);
      const mins = duration.minutes % 60;
      return `${hours}ч ${mins}м`;
    }
    return `${duration.minutes}м ${duration.seconds}с`;
  }

  function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    return `${months[parseInt(month) - 1]} ${parseInt(day)}, ${year}`;
  }

  function getCoverageClass(coverage) {
    if (coverage < 25) return 'coverage-badge coverage-badge--low';
    if (coverage > 75) return 'coverage-badge coverage-badge--high';
    return 'coverage-badge';
  }

  function renderTable() {
    const start = (currentPage - 1) * perPage;
    const paginatedRoutes = routes.slice(start, start + perPage);
    const tbody = document.getElementById('routes-table-body');
    if (!tbody) return;

    if (paginatedRoutes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Маршрутов не найдено</td></tr>';
      return;
    }

    tbody.innerHTML = paginatedRoutes.map((route, idx) => {
      const rowNumber = start + idx + 1;
      const isSelected = selectedIds.includes(route.id);
      const durationText = formatDuration(route.duration);
      const formattedDate = formatDate(route.date);
      const coverageClass = getCoverageClass(route.coverage);
      const selectedRowClass = isSelected ? 'routes-table__row--selected' : '';

      return `
        <tr class="${selectedRowClass}" data-id="${route.id}">
          <td>
            <input type="checkbox" class="route-checkbox" data-id="${route.id}" ${isSelected ? 'checked' : ''}>
          </td>
          <td class="route-num">${rowNumber}</td>
          <td>
            <div class="route-name">${route.name}</div>
            <div class="route-id">${route.id}</div>
          </td>
          <td class="route-date-time">${formattedDate} · ${route.time}</td>
          <td class="route-dist">${route.distance}</td>
          <td class="route-duration">${durationText}</td>
          <td><span class="${coverageClass}">${route.coverage}%</span></td>
          <td class="route-places">${route.pois}</td>
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

  function handleDeleteClick(e) {
    const id = e.currentTarget.dataset.id;
    if (confirm(`Удалить маршрут ${id}?`)) {
      routes = routes.filter(r => r.id !== id);
      totalRoutes = routes.length;
      selectedIds = selectedIds.filter(i => i !== id);
      
      if (routes.length === 0) currentPage = 1;
      if (currentPage > Math.ceil(routes.length / perPage)) {
        currentPage = Math.max(1, Math.ceil(routes.length / perPage));
      }
      
      renderTable();
    }
  }

  function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('select-all-checkbox');
    if (selectAll) {
      const currentPageIds = routes.slice((currentPage - 1) * perPage, currentPage * perPage).map(r => r.id);
      const allSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.includes(id));
      selectAll.checked = allSelected;
    }
  }

  function initSelectAll() {
    const selectAll = document.getElementById('select-all-checkbox');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const currentPageIds = routes.slice((currentPage - 1) * perPage, currentPage * perPage).map(r => r.id);
        if (e.target.checked) {
          currentPageIds.forEach(id => {
            if (!selectedIds.includes(id)) selectedIds.push(id);
          });
        } else {
          selectedIds = selectedIds.filter(id => !currentPageIds.includes(id));
        }
        renderTable();
      });
    }
  }

  initSelectAll();
  renderTable();
});