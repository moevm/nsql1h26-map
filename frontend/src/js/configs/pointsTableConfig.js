export const tableColumns = {
  pois: [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Имя' },
    { key: 'category', label: 'Категория' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
  ],
  walkpoints: [
    { key: 'order', label: 'Порядок' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
    { key: 'timestamp', label: 'Время' },
  ],
  mapnodes: [
    { key: 'id', label: 'ID' },
    { key: 'osmId', label: 'OSM ID' },
    { key: 'name', label: 'Имя' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
    { key: 'tileX', label: 'Tile X' },
    { key: 'tileY', label: 'Tile Y' },
  ],
  tiles: [
    { key: 'tileX', label: 'Tile X' },
    { key: 'tileY', label: 'Tile Y' },
  ],
};