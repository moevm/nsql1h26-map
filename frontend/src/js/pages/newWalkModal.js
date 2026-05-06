// Модальное окно для создания новой прогулки

let map = null;
let points = [];
let polyline = null;
let mapInitialized = false;

const MAX_DISTANCE_BETWEEN_POINTS = 50; // метров
const EARTH_RADIUS = 6371000; // метров

function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => deg * Math.PI / 180;
  
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  
  const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS * c;
}

function interpolatePoint(lat1, lon1, lat2, lon2, t) {
  return {
    lat: lat1 + (lat2 - lat1) * t,
    lon: lon1 + (lon2 - lon1) * t
  };
}

function addIntermediatePoints(points, newPoint) {
  if (points.length === 0) {
    return [newPoint];
  }
  
  const lastPoint = points[points.length - 1];
  const distance = calculateDistance(
    lastPoint.lat, lastPoint.lon,
    newPoint.lat, newPoint.lon
  );
  
  if (distance <= MAX_DISTANCE_BETWEEN_POINTS) {
    return [...points, newPoint];
  }
  
  const numSegments = Math.ceil(distance / MAX_DISTANCE_BETWEEN_POINTS);
  const step = 1 / numSegments;
  
  const newPoints = [];
  for (let i = 1; i <= numSegments; i++) {
    const t = i * step;
    const interpPoint = interpolatePoint(
      lastPoint.lat, lastPoint.lon,
      newPoint.lat, newPoint.lon,
      t
    );
    newPoints.push(interpPoint);
  }
  
  return [...points, ...newPoints];
}

function updatePolyline() {
  if (polyline) {
    map.removeLayer(polyline);
  }
  
  if (points.length >= 2) {
    const latlngs = points.map(p => [p.lat, p.lon]);
    polyline = L.polyline(latlngs, {
      color: '#00e5a0',
      weight: 3,
      opacity: 0.8
    }).addTo(map);
  }
  
  const pointsCountSpan = document.getElementById('walk-points-count');
  if (pointsCountSpan) {
    pointsCountSpan.textContent = points.length;
  }
  updateDistanceInfo();
}

function updateDistanceInfo() {
  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += calculateDistance(
      points[i-1].lat, points[i-1].lon,
      points[i].lat, points[i].lon
    );
  }
  
  const distanceSpan = document.getElementById('walk-total-distance');
  if (distanceSpan) {
    distanceSpan.textContent = totalDistance.toFixed(0);
  }
}

function initMapInModal(containerId) {
  if (mapInitialized) return;
  
  map = L.map(containerId).setView([59.9676, 30.3129], 14);
  
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    attribution: ''
  }).addTo(map);
  
  map.on('click', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    const newPoint = { lat, lon: lng };
    const updatedPoints = addIntermediatePoints(points, newPoint);
    points = updatedPoints;
    updatePolyline();
  });
  mapInitialized = true;
}

function clearPoints() {
  points = [];
  updatePolyline();
}

export function showNewWalkModal(userId, tokenGetter, onSuccess) {
  const modalHtml = `
    <div id="new-walk-modal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h2 class="modal-title">Новая прогулка</h2>
          <button class="modal-close" id="close-modal-btn">&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="modal-field">
            <label class="modal-field__label">Дата и время начала</label>
            <input type="datetime-local" class="modal-field__input" id="walk-started-at">
          </div>
          
          <div class="modal-field">
            <label class="modal-field__label">Точки маршрута (кликайте по карте)</label>
            <div class="points-info">
              <span>Добавлено точек: <span id="walk-points-count">0</span></span>
              <span>Общее расстояние: <span id="walk-total-distance">0</span> м</span>
              <button type="button" class="clear-points-btn" id="clear-points-btn">Очистить точки</button>
            </div>
            <div id="walk-map-container" class="modal-map-container"></div>
            <div class="points-hint">Кликните по карте, чтобы добавить точки маршрута. Расстояние между точками не должно превышать 50 м (промежуточные точки добавляются автоматически)</div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="modal-btn modal-btn--secondary" id="cancel-modal-btn">Отмена</button>
          <button class="modal-btn modal-btn--primary" id="save-walk-btn">Сохранить</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  setTimeout(() => {
    initMapInModal('walk-map-container');

    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 100);
    
    const closeModal = () => {
      if (map) {
        map.remove();
        map = null;
        mapInitialized = false;
      }
      document.getElementById('new-walk-modal')?.remove();
    };
    
    document.getElementById('close-modal-btn')?.addEventListener('click', closeModal);
    document.getElementById('cancel-modal-btn')?.addEventListener('click', closeModal);
    document.getElementById('clear-points-btn')?.addEventListener('click', () => {
      clearPoints();
    });

    document.getElementById('save-walk-btn')?.addEventListener('click', async () => {
      const startedAt = document.getElementById('walk-started-at')?.value;
      
      if (!startedAt) {
        alert('Пожалуйста, укажите дату и время начала прогулки');
        return;
      }
      if (points.length < 2) {
        alert('Пожалуйста, добавьте хотя бы 2 точки маршрута');
        return;
      }
      
      const token = tokenGetter();
      const startDate = new Date(startedAt);
      const walkPoints = points.map((p, idx) => ({
        lat: p.lat,
        lon: p.lon,
        timestamp: new Date(startDate.getTime() + idx * 30000).toISOString() // +30 секунд между точками
      }));
      
      const walkData = {
        userId: userId,
        points: walkPoints
      };
      
      const saveBtn = document.getElementById('save-walk-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
      
      try {
        const response = await fetch('http://127.0.0.1:10001/api/walks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(walkData)
        });
        
        if (response.ok) {
          const data = await response.json();
          alert(`Прогулка успешно создана!\nID: ${data.walkId}\nДистанция: ${data.distanceMeters} м\nДлительность: ${data.durationSeconds} сек`);
          closeModal();
          if (onSuccess) onSuccess();
        } else {
          const error = await response.text();
          alert(`Ошибка создания прогулки: ${error}`);
        }
      } catch (error) {
        alert(`Ошибка: ${error.message}`);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
      }
    });
  }, 0);
}