import { getToken } from "../auth";
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

export const getPois = async () => {
  const query = buildQuery({
    name: val('poi-name'),
    category: val('poi-category'),
    bbox: val('poi-bbox'),
    route_id: val('poi-route-id'),
    limit: num('poi-radius-slider'),
    offset: num('poi-offset-slider'),
  });
  const response = await fetch(`http://127.0.0.1:10001/api/pois/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить POIs"); return false; });
  return await response.json();
}

export const getPoisCategories = async () => {
  const response = await fetch(`http://127.0.0.1:10001/api/pois/categories`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить категории POIs"); return false; });
  return await response.json();
}

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
  const response = await fetch(`http://127.0.0.1:10001/api/walkpoints/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить WalkPoints"); return false; });
  return await response.json();
}

export const getAllTiles = async () => {
  const userId = userManager.get().id;
  const response = await fetch(`http://127.0.0.1:10001/api/map/tiles/?userId=${userId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить Tiles"); return false; });
  return await response.json();
}

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
  const response = await fetch(`http://127.0.0.1:10001/api/tiles/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить Tiles"); return false; });
  return await response.json();
}

export const getMapNodes = async () => {
  const query = buildQuery({
    osmId: val('mn-osm-id'),
    tileX: val('mn-tile-x'),
    tileY: val('mn-tile-y'),
    bbox: val('mn-bbox'),
    limit: num('mn-radius-slider'),
    offset: num('mn-offset-slider'),
  });
  const response = await fetch(`http://127.0.0.1:10001/api/mapnodes/${query}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${getToken()}`},
    credentials: 'include',
  }).catch(() => { Notify.error("Ошибка сервера: не удалось получить MapNodes"); return false; });
  return await response.json();
}

export const fetchEntityData = async (entity) => {
  switch (entity) {
    case 'pois': {
      const result = await getPois();
      return result?.items ?? [];
    }
    case 'walkpoints': {
      const result = await getWalkPoints();
      return result?.items ?? [];
    }
    case 'mapnodes': {
      const result = await getMapNodes();
      return result?.items ?? [];
    }
    case 'tiles': {
      const result = await getTiles();
      return Array.isArray(result) ? result : (result?.items ?? []);
    }
    default:
      throw new Error('Выбранная сущность не поддерживается');
  }
};