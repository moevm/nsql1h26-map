export let activeFilters = {
  startedAtFrom:  null,
  startedAtTo:    null,
  updatedAtFrom:  null,  // +
  updatedAtTo:    null,  // +
  walkId:         null,
  distanceMin:    null,
  distanceMax:    null,
  durationMin:    null,
  durationMax:    null,
  tilesMin:       null,
  tilesMax:       null,
};

export function initFilters() {
  const dateFromInput        = document.getElementById('date-from');
  const dateToInput          = document.getElementById('date-to');
  const dateUpdatedFromInput = document.getElementById('date-updated-from');  // +
  const dateUpdatedToInput   = document.getElementById('date-updated-to');    // +
  const walkIdInput          = document.getElementById('id-filter');
  const distanceMinInput     = document.getElementById('distance-from-filter');
  const distanceMaxInput     = document.getElementById('distance-to-filter');
  const durationMinInput     = document.getElementById('duration-from-filter');
  const durationMaxInput     = document.getElementById('duration-to-filter');
  const tilesMinInput        = document.getElementById('new-tiles-from-filter');
  const tilesMaxInput        = document.getElementById('new-tiles-to-filter');
  const resetBtn             = document.getElementById('reset-filters-btn');

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
    const durationMinVal = parseInt_(durationMinInput);
    const durationMaxVal = parseInt_(durationMaxInput);

    activeFilters = {
      startedAtFrom:  parseDate(dateFromInput),
      startedAtTo:    parseDate(dateToInput),
      updatedAtFrom:  parseDate(dateUpdatedFromInput),  // +
      updatedAtTo:    parseDate(dateUpdatedToInput),    // +
      walkId:         walkIdInput?.value.trim() || null,
      distanceMin:    parseFloat_(distanceMinInput),
      distanceMax:    parseFloat_(distanceMaxInput),
      durationMin:    durationMinVal !== null ? durationMinVal * 60 : null,
      durationMax:    durationMaxVal !== null ? durationMaxVal * 60 : null,
      tilesMin:       parseInt_(tilesMinInput),
      tilesMax:       parseInt_(tilesMaxInput),
    };

    window.dispatchEvent(new CustomEvent('filters-updated'));
  };

  const resetFilters = () => {
    [
      dateFromInput, dateToInput,
      dateUpdatedFromInput, dateUpdatedToInput,  // +
      walkIdInput,
      distanceMinInput, distanceMaxInput,
      durationMinInput, durationMaxInput,
      tilesMinInput, tilesMaxInput,
    ].forEach((el) => { if (el) el.value = ''; });

    activeFilters = {
      startedAtFrom:  null,
      startedAtTo:    null,
      updatedAtFrom:  null,  // +
      updatedAtTo:    null,  // +
      walkId:         null,
      distanceMin:    null,
      distanceMax:    null,
      durationMin:    null,
      durationMax:    null,
      tilesMin:       null,
      tilesMax:       null,
    };

    window.dispatchEvent(new CustomEvent('filters-updated'));
  };

  dateFromInput       ?.addEventListener('change', applyFilters);
  dateToInput         ?.addEventListener('change', applyFilters);
  dateUpdatedFromInput?.addEventListener('change', applyFilters);  // +
  dateUpdatedToInput  ?.addEventListener('change', applyFilters);  // +
  walkIdInput         ?.addEventListener('input',  applyFilters);
  distanceMinInput    ?.addEventListener('input',  applyFilters);
  distanceMaxInput    ?.addEventListener('input',  applyFilters);
  durationMinInput    ?.addEventListener('input',  applyFilters);
  durationMaxInput    ?.addEventListener('input',  applyFilters);
  tilesMinInput       ?.addEventListener('input',  applyFilters);
  tilesMaxInput       ?.addEventListener('input',  applyFilters);
  resetBtn            ?.addEventListener('click',  resetFilters);
}

export function buildFilterParams() {
  const params = new URLSearchParams();

  if (activeFilters.startedAtFrom)        params.append('startedAtFrom', activeFilters.startedAtFrom);
  if (activeFilters.startedAtTo)          params.append('startedAtTo',   activeFilters.startedAtTo);
  if (activeFilters.updatedAtFrom)        params.append('updatedAtFrom', activeFilters.updatedAtFrom);  // +
  if (activeFilters.updatedAtTo)          params.append('updatedAtTo',   activeFilters.updatedAtTo);    // +
  if (activeFilters.walkId)               params.append('walkId',        activeFilters.walkId);
  if (activeFilters.distanceMin !== null) params.append('distanceMin',   activeFilters.distanceMin);
  if (activeFilters.distanceMax !== null) params.append('distanceMax',   activeFilters.distanceMax);
  if (activeFilters.durationMin !== null) params.append('durationMin',   activeFilters.durationMin);
  if (activeFilters.durationMax !== null) params.append('durationMax',   activeFilters.durationMax);
  if (activeFilters.tilesMin    !== null) params.append('tilesMin',      activeFilters.tilesMin);
  if (activeFilters.tilesMax    !== null) params.append('tilesMax',      activeFilters.tilesMax);

  return params.toString();
}