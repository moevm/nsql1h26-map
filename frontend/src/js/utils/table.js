import { tableColumns } from "../configs/pointsTableConfig";

const EDITABLE_ENTITIES = ['pois', 'mapnodes'];

const openModal = (item, entity) => {
  const overlay = document.querySelector('.modal-overlay');
  const modal = document.querySelector('.modal');
  const title = modal.querySelector('.modal__title');
  const content = modal.querySelector('.modal__content');

  title.textContent = item.osmId ? `${entity.toUpperCase()} #${item.osmId}` : `${entity.toUpperCase()}`;

  const isEditable = EDITABLE_ENTITIES.includes(entity);

  content.innerHTML = `
    <div class="modal__fields">
      ${Object.entries(item).map(([key, val]) => {
        if (key === 'osmId') return '';
        
        return `
          <div class="modal__row">
            <span class="modal__key">${key}</span>
            ${isEditable
              ? `<input class="modal__input" data-field="${key}" value="${val ?? ''}" />`
              : `<span class="modal__val">${val ?? '—'}</span>`
            }
          </div>
        `;
      }).join('')}
    </div>
    ${isEditable ? `
      <div class="modal__actions">
        <button class="modal__btn modal__btn--save">Сохранить изменения</button>
        <button class="modal__btn modal__btn--delete">Удалить</button>
      </div>
    ` : ''}
  `;

  if (isEditable) {
    modal.querySelector('.modal__btn--save').addEventListener('click', () => {
      const updated = { ...item };
      modal.querySelectorAll('.modal__input').forEach(input => {
        updated[input.dataset.field] = input.value;
      });
      console.log('Save:', updated);
      // TODO: вызов API
    });

    modal.querySelector('.modal__btn--delete').addEventListener('click', () => {
      console.log('Delete:', item);
      // TODO: вызов API
    });
  }

  overlay.classList.add('modal-overlay--active');
  modal.classList.add('modal--active');
};

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
    const rowId = `${'trow'}-${start + idx + 1}`;
    return `
      <tr data-id="${rowId}" data-index="${start + idx}" class="routes-table__row">
        <td class="routes-table__td--checkbox">
          <input type="checkbox" class="route-checkbox" data-id="${rowId}" />
        </td>
        <td class="route-num">${start + idx + 1}</td>
        ${cols.map(c => `
          <td class="routes-table__td">${item[c.key] ?? '—'}</td>
        `).join('')}
      </tr>
    `;
  }).join('');
  tbody.querySelectorAll('tr[data-index]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('input[type="checkbox"]')) return;
      const index = Number(row.dataset.index);
      openModal(tableState.items[index], tableState.entity);
    });
  });
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