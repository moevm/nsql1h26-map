import { getToken, relocateToLogin } from "../auth";
import { userManager } from "../localManagers/userManager";

const val = (id) => document.getElementById(id)?.value?.trim() ?? '';
const num = (id) => Number(document.getElementById(id)?.value) || undefined;

export const buildQuery = (params) => {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  });
  return q.toString() ? `?${q.toString()}` : '';
};

const handleUnauthorized = () => {
  document.cookie = 'token=; Path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
  userManager.delete();
  relocateToLogin();
};

const fetchWithAuth = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      ...options.headers,
    },
    credentials: 'include',
  }).catch(() => {
    Notify.error("Ошибка сервера");
    return null;
  });

  if (!response) return null;

  if (response.status === 401) {
    const data = await response.json().catch(() => ({}));
    if (data?.detail === "Invalid token") {
      handleUnauthorized();
      return null;
    }
  }

  return response;
};

export const getPOIbyCategory = async (category) => {
  const query = buildQuery({
    name: '',
    category: category,
    bbox: '',
    route_id: '',
    limit: 100,
    offset: '',
  });
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/pois/${query}`);
  if (!response) return null;
  return await response.json();
};

export const importDb = async (file) => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/data/db/import`, {
    method: 'POST',
    body: formData,
  });
  if (!response) return null;
  if (!response.ok) throw new Error("Не удалось импортировать бд");
  return await response.json();
};

export const getPois = async () => {
  const query = buildQuery({
    name: val('poi-name'),
    category: val('poi-category'),
    bbox: val('poi-bbox'),
    route_id: val('poi-route-id'),
    limit: num('poi-radius-slider'),
    offset: num('poi-offset-slider'),
  });
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/pois/${query}`);
  if (!response) return null;
  return await response.json();
};

export const getPoisCategories = async () => {
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/pois/categories`);
  if (!response) return null;
  return await response.json();
};

export const getWalkPoints = async () => {
  const query = buildQuery({
    walkId: val('wp-walkId'),
    latMin: val('wp-lat-min'),
    latMax: val('wp-lat-max'),
    lonMin: val('wp-lon-min'),
    lonMax: val('wp-lon-max'),
    timestampFrom: val('wp-timestamp-from'),
    timestampTo: val('wp-timestamp-to'),
    orderMin: val('wp-order-min'),
    orderMax: val('wp-order-max'),
    limit: num('wp-radius-slider'),
    offset: num('wp-offset-slider'),
  });
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/walkpoints/${query}`);
  if (!response) return null;
  return await response.json();
};

export const getAllTiles = async () => {
  const userId = userManager.get().id;
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/map/tiles/?userId=${userId}`);
  if (!response) return null;
  return await response.json();
};

export const getTiles = async () => {
  const userId = userManager.get().id;
  const query = buildQuery({
    userId: userId,
    walkId: val('tile-walkId'),
    tileXMin: val('tile-x-min'),
    tileXMax: val('tile-x-max'),
    tileYMin: val('tile-y-min'),
    tileYMax: val('tile-y-max'),
    coveredFrom: val('tile-covered-from'),
    coveredTo: val('tile-covered-to'),
    limit: num('tile-limit-slider'),
    offset: num('tile-offset-slider'),
  });
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/tiles/${query}`);
  if (!response) return null;
  return await response.json();
};

export const getMapNodes = async () => {
  const query = buildQuery({
    osmId: val('mn-osm-id'),
    tileX: val('mn-tile-x'),
    tileY: val('mn-tile-y'),
    bbox: val('mn-bbox'),
    limit: num('mn-radius-slider'),
    offset: num('mn-offset-slider'),
  });
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/mapnodes/${query}`);
  if (!response) return null;
  return await response.json();
};

export const fetchEntityData = async (entity) => {
  switch (entity) {
    case 'pois':
      return await getPois();
    case 'walkpoints':
      return await getWalkPoints();
    case 'mapnodes':
      return await getMapNodes();
    case 'tiles':
      return await getTiles();
    default:
      throw new Error('Выбранная сущность не поддерживается');
  }
};

export async function downloadFile(url, filename) {
  const response = await fetchWithAuth(url);
  if (!response) return null;
  if (!response.ok) throw new Error(`Ошибка загрузки ${filename}: ${response.status}`);

  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return `${filename} успешно скачан`;
}