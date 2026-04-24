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
  }

  renderTable();
});