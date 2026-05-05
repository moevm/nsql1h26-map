export const tableColumns = {
  pois: [
    { key: 'osmId', label: 'ID' },
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
    { key: 'osmId', label: 'ID' },
    { key: 'lat', label: 'Широта' },
    { key: 'lon', label: 'Долгота' },
    { key: 'tileX', label: 'Tile X' },
    { key: 'tileY', label: 'Tile Y' },
  ],
  tiles: [
    { key: 'walkId', label: 'walkId'},
    { key: 'tileX', label: 'Tile X' },
    { key: 'tileY', label: 'Tile Y' },
    { key: 'firstCoveredAt', label: 'firstCoveredAt'}
  ],
};