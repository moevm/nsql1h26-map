export let activeFilters = {
  dateFrom: null,
  dateTo: null,
  distanceMin: null,
  distanceMax: null,
  estimatedMin: null,
  estimatedMax: null,
  search: null,
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
    let dateFrom = dateFromInput?.value || null;
    let dateTo = dateToInput?.value || null;

    if (dateFrom) {
      const date = new Date(dateFrom);
      dateFrom = date.toISOString();
    }
    
    if (dateTo) {
      const date = new Date(dateTo);
      dateTo = date.toISOString();
    }

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

    let estimatedMin = null;
    let estimatedMax = null;
    const durationValue = durationFilter?.value;
    if (durationValue && durationValue !== 'any') {
      const [min, max] = durationValue.split('-');
      if (max) {
        estimatedMin = parseInt(min);
        estimatedMax = parseInt(max);
      } else if (durationValue === '120+') {
        estimatedMin = 120;
        estimatedMax = null;
      }
    }

    activeFilters = {
      dateFrom,
      dateTo,
      distanceMin,
      distanceMax,
      estimatedMin,
      estimatedMax,
      search: null,
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
      dateFrom: null,
      dateTo: null,
      distanceMin: null,
      distanceMax: null,
      estimatedMin: null,
      estimatedMax: null,
      search: null,
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
  if (activeFilters.dateFrom) params.append('createdFrom', activeFilters.dateFrom);
  if (activeFilters.dateTo) params.append('createdTo', activeFilters.dateTo);
  if (activeFilters.distanceMin !== null) params.append('distanceMin', activeFilters.distanceMin);
  if (activeFilters.distanceMax !== null) params.append('distanceMax', activeFilters.distanceMax);
  if (activeFilters.estimatedMin !== null) params.append('estimatedMin', activeFilters.estimatedMin);
  if (activeFilters.estimatedMax !== null) params.append('estimatedMax', activeFilters.estimatedMax);
  if (activeFilters.search) params.append('search', activeFilters.search);
  
  return params.toString();
}