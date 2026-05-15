export let activeFilters = {
  dateFrom:      null,
  dateTo:        null,
  updatedAtFrom: null,
  updatedAtTo:   null,
  routeId:       null,
  distanceMin:   null,
  distanceMax:   null,
  durationMin:   null,
  durationMax:   null,
  tilesMin:      null,
  tilesMax:      null,
  poiMin:        null,
  poiMax:        null,
};

export function initFilters() {
  const dateFromInput    = document.getElementById('date-from');
  const dateToInput      = document.getElementById('date-to');
  const dateUpdatedFromInput = document.getElementById('date-updated-from');
  const dateUpdatedToInput   = document.getElementById('date-updated-to');
  const routeIdInput     = document.getElementById('id-filter');
  const distanceMinInput = document.getElementById('distance-from-filter');
  const distanceMaxInput = document.getElementById('distance-to-filter');
  const durationMinInput = document.getElementById('duration-from-filter');
  const durationMaxInput = document.getElementById('duration-to-filter');
  const tilesMinInput    = document.getElementById('new-tiles-from-filter');
  const tilesMaxInput    = document.getElementById('new-tiles-to-filter');
  const poiMinInput      = document.getElementById('interes-place-from-filter');
  const poiMaxInput      = document.getElementById('interes-place-to-filter');
  const resetBtn         = document.getElementById('reset-filters-btn');

  const parseFloat_ = (el) => {
    const v = parseFloat(el?.value);
    return isNaN(v) ? null : v;
  };

  const parseInt_ = (el) => {
    const v = parseInt(el?.value);
    return isNaN(v) ? null : v;
  };

  const parseDate = (el) => {
    const v = el?.value;
    if (!v) return null;
    return new Date(v).toISOString();
  };

  const applyFilters = () => {
    activeFilters = {
      dateFrom:    parseDate(dateFromInput),
      dateTo:      parseDate(dateToInput),
      updatedAtFrom: parseDate(dateUpdatedFromInput),
      updatedAtTo:   parseDate(dateUpdatedToInput),
      routeId:     routeIdInput?.value.trim()  || null,
      distanceMin: parseFloat_(distanceMinInput),
      distanceMax: parseFloat_(distanceMaxInput),
      durationMin: parseInt_(durationMinInput),
      durationMax: parseInt_(durationMaxInput),
      tilesMin:    parseInt_(tilesMinInput),
      tilesMax:    parseInt_(tilesMaxInput),
      poiMin:      parseInt_(poiMinInput),
      poiMax:      parseInt_(poiMaxInput),
    };

    window.dispatchEvent(new CustomEvent('filters-updated'));
  };

  const resetFilters = () => {
    [
      dateFromInput, dateToInput, routeIdInput,
      distanceMinInput, distanceMaxInput,
      durationMinInput, durationMaxInput,
      tilesMinInput, tilesMaxInput,
      poiMinInput, poiMaxInput, 
      dateUpdatedFromInput, dateUpdatedToInput
    ].forEach((el) => { if (el) el.value = ''; });

    activeFilters = {
      dateFrom:    null,
      dateTo:      null,
      routeId:     null,
      distanceMin: null,
      distanceMax: null,
      durationMin: null,
      durationMax: null,
      tilesMin:    null,
      tilesMax:    null,
      poiMin:      null,
      poiMax:      null,
      updatedAtFrom: null,
      updatedAtTo:   null,
    };

    window.dispatchEvent(new CustomEvent('filters-updated'));
  };

  dateFromInput   ?.addEventListener('change', applyFilters);
  dateToInput     ?.addEventListener('change', applyFilters);
  dateUpdatedFromInput?.addEventListener('change', applyFilters);
  dateUpdatedToInput  ?.addEventListener('change', applyFilters);
  routeIdInput    ?.addEventListener('input',  applyFilters);
  distanceMinInput?.addEventListener('input',  applyFilters);
  distanceMaxInput?.addEventListener('input',  applyFilters);
  durationMinInput?.addEventListener('input',  applyFilters);
  durationMaxInput?.addEventListener('input',  applyFilters);
  tilesMinInput   ?.addEventListener('input',  applyFilters);
  tilesMaxInput   ?.addEventListener('input',  applyFilters);
  poiMinInput     ?.addEventListener('input',  applyFilters);
  poiMaxInput     ?.addEventListener('input',  applyFilters);
  resetBtn        ?.addEventListener('click',  resetFilters);
}

export function buildFilterParams() {
  const params = new URLSearchParams();

  if (activeFilters.dateFrom)              params.append('createdFrom',  activeFilters.dateFrom);
  if (activeFilters.dateTo)                params.append('createdTo',    activeFilters.dateTo);
  if (activeFilters.routeId)               params.append('routeId',      activeFilters.routeId);
  if (activeFilters.distanceMin !== null)  params.append('distanceMin',  activeFilters.distanceMin);
  if (activeFilters.distanceMax !== null)  params.append('distanceMax',  activeFilters.distanceMax);
  if (activeFilters.durationMin !== null)  params.append('durationMin',  activeFilters.durationMin);
  if (activeFilters.durationMax !== null)  params.append('durationMax',  activeFilters.durationMax);
  if (activeFilters.tilesMin    !== null)  params.append('tilesMin',     activeFilters.tilesMin);
  if (activeFilters.tilesMax    !== null)  params.append('tilesMax',     activeFilters.tilesMax);
  if (activeFilters.poiMin      !== null)  params.append('poiMin',       activeFilters.poiMin);
  if (activeFilters.poiMax      !== null)  params.append('poiMax',       activeFilters.poiMax);
  if (activeFilters.updatedAtFrom) params.append('updatedAtFrom', activeFilters.updatedAtFrom);
  if (activeFilters.updatedAtTo)   params.append('updatedAtTo',   activeFilters.updatedAtTo);

  return params.toString();
}