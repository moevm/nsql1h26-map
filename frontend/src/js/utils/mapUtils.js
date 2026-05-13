function tileBounds(x, y) {
  const n = Math.pow(2, 19);
  const lon1 = (x / n) * 360 - 180;
  const lon2 = ((x + 1) / n) * 360 - 180;
  const lat1 =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const lat2 =
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return [
    [lat1, lon1],
    [lat2, lon2],
  ];
}

export const deleteTrashOnMap = () => {
  const trash = document.querySelector(".leaflet-bottom.leaflet-right");
  trash.innerHTML = "";
};

export const drawPOI = (layer, points, iconColor = "blue") => {
  layer.clearLayers();
  points.forEach((point) => {
    L.circleMarker(point.coords, {
      radius: 7,
      fillColor: iconColor,
      color: iconColor,
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8,
    })
      .bindPopup(point.name)
      .addTo(layer);
  });
};

export const drawTiles = (layer, tiles, color = '#00e6c3', fillOpacity = 0.25) => {
  layer.clearLayers();
  (tiles || []).forEach((t) => {
    L.rectangle(tileBounds(t.tileX, t.tileY), {
      color,
      weight: 0.5,
      opacity: fillOpacity,
      fillColor: color,
      fillOpacity,
      interactive: false,
    }).addTo(layer);
  });
};

export const initMapSelectors = (map) => {
  let isDrawing = false;
  let startLatLng = null;
  let rect = null;
  let pinMarker = null;

  let awaitingPinClick = false;
  let awaitingBBox = false;

  const container = map.getContainer();

  const btn = document.createElement("button");
  btn.className = "bbox-btn";
  btn.innerHTML = `Область
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="2"
        stroke="currentColor" stroke-width="2" stroke-dasharray="4 2"/>
    </svg>`;
  container.appendChild(btn);

  const pinBtn = document.createElement("button");
  pinBtn.className = "bbox-btn";
  pinBtn.innerHTML = `Точка
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5
        c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5
        2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
        fill="currentColor"/>
    </svg>`;
  container.appendChild(pinBtn);

  L.DomEvent.disableClickPropagation(btn);
  L.DomEvent.disableClickPropagation(pinBtn);

  const reset = () => {
    if (rect) {
      map.removeLayer(rect);
      rect = null;
    }
    map.closePopup();
    container.style.cursor = "";
    isDrawing = false;
    awaitingBBox = false;
    map.dragging.enable();
  };

  const resetPin = () => {
    if (pinMarker) {
      map.removeLayer(pinMarker);
      pinMarker = null;
    }
    map.closePopup();
    container.style.cursor = "";
    awaitingPinClick = false;
  };

  btn.addEventListener("click", () => {
    resetPin();
    reset();

    awaitingBBox = true;
    container.style.cursor = "url(/src/img/crosshair.png), crosshair";
  });

  pinBtn.addEventListener("click", () => {
    reset();
    resetPin();

    awaitingPinClick = true;
    container.style.cursor = "url(/src/img/pin.png), crosshair";
  });

  map.on("click", (e) => {
    if (!awaitingPinClick) return;

    awaitingPinClick = false;
    container.style.cursor = "";

    if (pinMarker) map.removeLayer(pinMarker);
    map.closePopup();

    pinMarker = L.circleMarker(e.latlng, {
      radius: 6,
      color: "#00E6C3",
      fillColor: "#00E6C3",
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);

    const lat = e.latlng.lat.toFixed(6);
    const lng = e.latlng.lng.toFixed(6);
    const coords = `${lat},${lng}`;

    const content = document.createElement("div");
    content.className = "bbox-popup-inner";
    content.innerHTML = `
      <code>${coords}</code>
      <div class="bbox-popup-actions">
        <button class="bbox-copy">Копировать</button>
        <button class="bbox-cancel">Отмена</button>
      </div>
    `;

    content.querySelector(".bbox-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(coords).then(() => {
        content.querySelector(".bbox-copy").textContent = "✓ Скопировано";
        setTimeout(resetPin, 800);
      });
    });

    content.querySelector(".bbox-cancel").addEventListener("click", resetPin);

    L.popup({
      closeButton: false,
      className: "bbox-popup",
      autoClose: false,
      closeOnClick: false,
    })
      .setLatLng(e.latlng)
      .setContent(content)
      .openOn(map);
  });

  map.on("mousedown", (e) => {
    if (!awaitingBBox) return;

    isDrawing = true;
    startLatLng = e.latlng;

    if (rect) map.removeLayer(rect);
    map.closePopup();

    rect = L.rectangle([startLatLng, startLatLng], {
      color: "#00E6C3",
      weight: 1.5,
      fillOpacity: 0.1,
      dashArray: "4 4",
      interactive: false,
    }).addTo(map);

    map.dragging.disable();
  });

  map.on("mousemove", (e) => {
    if (!isDrawing || !rect) return;
    rect.setBounds([startLatLng, e.latlng]);
  });

  map.on("mouseup", () => {
    if (!isDrawing) return;

    isDrawing = false;
    awaitingBBox = false;

    container.style.cursor = "";
    map.dragging.enable();

    const bounds = rect.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    const bbox = `${sw.lat.toFixed(6)},${sw.lng.toFixed(6)},${ne.lat.toFixed(6)},${ne.lng.toFixed(6)}`;

    const content = document.createElement("div");
    content.className = "bbox-popup-inner";
    content.innerHTML = `
      <code>${bbox}</code>
      <div class="bbox-popup-actions">
        <button class="bbox-copy">Копировать</button>
        <button class="bbox-cancel">Отмена</button>
      </div>
    `;

    content.querySelector(".bbox-copy").addEventListener("click", () => {
      navigator.clipboard.writeText(bbox).then(() => {
        content.querySelector(".bbox-copy").textContent = "✓ Скопировано";
        setTimeout(reset, 800);
      });
    });

    content.querySelector(".bbox-cancel").addEventListener("click", reset);

    L.popup({
      closeButton: false,
      className: "bbox-popup",
      autoClose: false,
      closeOnClick: false,
    })
      .setLatLng(bounds.getCenter())
      .setContent(content)
      .openOn(map);
  });
};

const showBBoxPopup = (map, center, bbox, onClose) => {
  const popup = L.popup({ closeButton: false, className: "bbox-popup" })
    .setLatLng(center)
    .setContent(
      `
      <div class="bbox-popup-inner">
        <code>${bbox}</code>
        <div class="bbox-popup-actions">
          <button id="bbox-copy">Копировать</button>
          <button id="bbox-cancel">Отмена</button>
        </div>
      </div>
    `,
    )
    .openOn(map);

  setTimeout(() => {
    document.getElementById("bbox-copy")?.addEventListener("click", () => {
      navigator.clipboard.writeText(bbox).then(() => {
        document.getElementById("bbox-copy").textContent = "✓ Скопировано";
        setTimeout(() => {
          map.closePopup();
          onClose();
        }, 800);
      });
    });
    document.getElementById("bbox-cancel")?.addEventListener("click", () => {
      map.closePopup();
      onClose();
    });
  }, 0);
};
