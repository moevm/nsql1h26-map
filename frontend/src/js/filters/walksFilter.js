export let activeFilters = {
  startedAtFrom: null,
  startedAtTo: null,
  distanceMin: null,
  distanceMax: null,
  durationMin: null,
  durationMax: null,
  userId: null
};

export function initFilters() {
  const dateFromInput = document.getElementById('date-from');
  const dateToInput = document.getElementById('date-to');
  const distanceFilter = document.getElementById('distance-filter');
  const durationFilter = document.getElementById('duration-filter');
  const userIdInput = document.getElementById('user-id-filter');
  const resetBtn = document.getElementById('reset-filters-btn');

  const applyFilters = () => {
    let startedAtFrom = dateFromInput?.value || null;
    let startedAtTo = dateToInput?.value || null;

    let distanceMin = null;
    let distanceMax = null;
    const distanceValue = distanceFilter?.value;
    if (distanceValue && distanceValue !== 'any') {
      const [min, max] = distanceValue.split('-');
      if (max) {
        distanceMin = parseFloat(min) * 1000;
        distanceMax = parseFloat(max) * 1000;
      } else if (distanceValue === '15+') {
        distanceMin = 15000;
        distanceMax = null;
      }
    }

    let durationMin = null;
    let durationMax = null;
    const durationValue = durationFilter?.value;
    if (durationValue && durationValue !== 'any') {
      const [min, max] = durationValue.split('-');
      if (max) {
        durationMin = parseInt(min) * 60;
        durationMax = parseInt(max) * 60;
      } else if (durationValue === '120+') {
        durationMin = 7200;
        durationMax = null;
      }
    }

    activeFilters = {
      startedAtFrom,
      startedAtTo,
      distanceMin,
      distanceMax,
      durationMin,
      durationMax,
      userId: userIdInput?.value || null
    };

    window.dispatchEvent(new CustomEvent('filters-updated'));
  };

  const resetFilters = () => {
    if (dateFromInput) dateFromInput.value = '';
    if (dateToInput) dateToInput.value = '';
    if (distanceFilter) distanceFilter.value = 'any';
    if (durationFilter) durationFilter.value = 'any';
    if (userIdInput) userIdInput.value = '';

    activeFilters = {
      startedAtFrom: null,
      startedAtTo: null,
      distanceMin: null,
      distanceMax: null,
      durationMin: null,
      durationMax: null,
      userId: null
    };

    window.dispatchEvent(new CustomEvent('filters-updated'));
  };

  if (dateFromInput) dateFromInput.addEventListener('change', applyFilters);
  if (dateToInput) dateToInput.addEventListener('change', applyFilters);
  if (distanceFilter) distanceFilter.addEventListener('change', applyFilters);
  if (durationFilter) durationFilter.addEventListener('change', applyFilters);
  if (userIdInput) userIdInput.addEventListener('input', applyFilters);
  if (resetBtn) resetBtn.addEventListener('click', resetFilters);
}

export function buildFilterParams() {
  const params = new URLSearchParams();
  
  if (activeFilters.userId) params.append('userId', activeFilters.userId);
  if (activeFilters.startedAtFrom) params.append('startedAtFrom', activeFilters.startedAtFrom);
  if (activeFilters.startedAtTo) params.append('startedAtTo', activeFilters.startedAtTo);
  if (activeFilters.distanceMin !== null) params.append('distanceMin', activeFilters.distanceMin);
  if (activeFilters.distanceMax !== null) params.append('distanceMax', activeFilters.distanceMax);
  if (activeFilters.durationMin !== null) params.append('durationMin', activeFilters.durationMin);
  if (activeFilters.durationMax !== null) params.append('durationMax', activeFilters.durationMax);
  
  return params.toString();
}