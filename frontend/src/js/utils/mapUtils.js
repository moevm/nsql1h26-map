function tileBounds(x, y) {
  const n = Math.pow(2, 19);
  const lon1 = x / n * 360 - 180;
  const lon2 = (x + 1) / n * 360 - 180;
  const lat1 = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  const lat2 = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;
  return [[lat1, lon1], [lat2, lon2]];
}

export const deleteTrashOnMap = () => {
  const trash = document.querySelector('.leaflet-bottom.leaflet-right');
  trash.innerHTML = '';
}

export const drawPOI = (layer, points, iconColor = "blue") => {
  layer.clearLayers();
  points.forEach(point => {
    L.circleMarker(point.coords, {
      radius: 7,
      fillColor: iconColor,
      color: iconColor,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    })
      .bindPopup(point.name)
      .addTo(layer);
  });
};

export const drawTiles = (layer, tiles) => {
  layer.clearLayers();
  (tiles || []).forEach(t => {
    L.rectangle(tileBounds(t.tileX, t.tileY), {
      color: '#00e6c3', weight: 0.5, opacity: 0.25,
      fillColor: '#00e6c3', fillOpacity: 0.25, interactive: false
    }).addTo(layer);
  });
}