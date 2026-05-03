import { tableColumns } from "../configs/pointsTableConfig";

const renderTableHead = (tableState) => {
    const cols = tableColumns[tableState.entity] ?? [];
    const thead = document.querySelector('.routes-table thead tr');
    if (!thead) return;
    thead.innerHTML = `
      <th class="routes-table__th routes-table__th--checkbox">
        <input type="checkbox" id="select-all-checkbox" />
      </th>
      <th class="routes-table__th">#</th>
      ${cols.map(c => `<th class="routes-table__th">${c.label}</th>`).join('')}
    `;
  };

  const renderTableBody = (tableState) => {
    const { entity, items, page, perPage } = tableState;
    const cols = tableColumns[entity] ?? [];
    const tbody = document.getElementById('routes-table-body');

    if (!tbody) return;

    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);

    if (pageItems.length === 0) {
      tbody.innerHTML = `
      <tr>
        <td colspan="${cols.length + 3}" style="text-align:center;padding:24px;opacity:.5;">
          Нет данных
        </td>
      </tr>
    `;
      return;
    }

    tbody.innerHTML = pageItems.map((item, idx) => {
      const rowId =
        item.id ??
        `${item.walkId ?? 'walk'}-${item.order ?? idx}`;

      return `
      <tr data-id="${rowId}">
        <td class="routes-table__td--checkbox">
          <input
            type="checkbox"
            class="route-checkbox"
            data-id="${rowId}"
          />
        </td>
        <td class="route-num">${start + idx + 1}</td>
        ${cols.map(c => `
          <td class="routes-table__td">
            ${item[c.key] ?? '—'}
          </td>
        `).join('')}
      </tr>
    `;
    }).join('');
  };

  const renderPagination = (tableState) => {
    const { items, page, perPage } = tableState;
    const total = items.length;
    const totalPages = Math.ceil(total / perPage);
    const start = total === 0 ? 0 : (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, total);

    const rangeEl = document.getElementById('pagination-range');
    if (rangeEl) rangeEl.textContent = `Показано ${start}–${end} из ${total}`;

    const controls = document.querySelector('.pagination__controls');
    if (!controls) return;

    const makeBtn = (label, targetPage, disabled = false) =>
      `<button
        class="pagination__btn${targetPage === page ? ' pagination__btn--active' : ''}"
        data-page="${targetPage}"
        ${disabled ? 'disabled' : ''}
      >${label}</button>`;

    const pages = [];
    for (let p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || Math.abs(p - page) <= 2) pages.push(p);
    }

    let html = makeBtn('‹', page - 1, page === 1);
    let prev = null;
    for (const p of pages) {
      if (prev !== null && p - prev > 1) html += `<span class="pagination__ellipsis">…</span>`;
      html += makeBtn(p, p);
      prev = p;
    }
    html += makeBtn('›', page + 1, page === totalPages || totalPages === 0);
    controls.innerHTML = html;

    controls.querySelectorAll('.pagination__btn:not([disabled])').forEach(b => {
      b.addEventListener('click', () => {
        tableState.page = Number(b.dataset.page);
        renderTableBody(tableState);
        renderPagination(tableState);
      });
    });
  };

  export const renderTable = (tableState) => {
    if (!tableState.entity) {
      document.querySelector('.routes-table thead tr').innerHTML = '';
      document.getElementById('routes-table-body').innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center;padding:24px;opacity:.5;">
            Выберите сущность и нажмите «Применить»
          </td>
        </tr>
      `;
      return;
    }

    renderTableHead(tableState);
    renderTableBody(tableState);
    renderPagination(tableState);
  };