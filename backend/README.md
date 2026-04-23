## Отладочные пользователи

| username | email | password | роль |
|----------|---------------------|----------|------|
| testuser | testuser@example.com test123 | user     |

Пользователь создаётся автоматически при первом запуске приложения.


## Запуск приложения

```bash
docker compose build --no-cache && docker compose up -d
```

- Backend API: http://127.0.0.1:10001/docs
- Frontend: http://127.0.0.1:10002

## Утилита получения OSM-данных

Скрипт `backend/scripts/fetch_osm.py` скачивает данные дорожной сети из Overpass API и сохраняет в `backend/data/osm_seed.json`.

```bash
# Петроградка (по умолчанию)
python3 backend/scripts/fetch_osm.py

# Произвольный bbox: min_lat,min_lon,max_lat,max_lon
python3 backend/scripts/fetch_osm.py --bbox "59.95,30.28,59.98,30.34"
```

Для визуализации результата — запустить локальный сервер и открыть карту:

```bash
python3 -m http.server 8080
# открыть http://localhost:8080/backend/scripts/preview.html
```


## API эндпоинты карты

Полная документация доступна по адресу http://127.0.0.1:10001/docs

### Узлы дорожного графа
```
GET /api/map/nodes?bbox=min_lat,min_lon,max_lat,max_lon
```
Возвращает все точки дорожной сети в указанной области. Используется для отрисовки графа на карте.

### Рёбра дорожного графа
```
GET /api/map/edges?bbox=min_lat,min_lon,max_lat,max_lon
```
Возвращает соединения между узлами (отрезки дорог) в указанной области с расстоянием в метрах.

### Точки интереса (POI)
```
GET /api/map/pois?bbox=min_lat,min_lon,max_lat,max_lon
```
Возвращает кафе, магазины, достопримечательности и другие объекты в указанной области.

### Закрашенные тайлы пользователя
```
GET /api/map/tiles?userId=...
```
Возвращает все тайлы карты, которые пользователь посетил во время прогулок («туман войны»).

**Пример запроса для Петроградки:**
```
http://127.0.0.1:10001/api/map/nodes?bbox=59.95,30.28,59.98,30.34
```

## API эндпоинты авторизации

### Вход
```
POST /api/auth/login
{ "email": "...", "password": "..." }
```
Возвращает токен и данные пользователя.

### Регистрация
```
POST /api/auth/register
{ "username": "...", "email": "...", "password": "..." }
```

### Текущий пользователь
```
GET /api/auth/me?token=...
```

## API эндпоинты прогулок

### Список прогулок пользователя
```
GET /api/walks?userId=...
```

### Детали прогулки
```
GET /api/walks/{walkId}
```
Возвращает данные прогулки и все GPS-точки маршрута.

### Загрузить прогулку
```
POST /api/walks
{
  "userId": "...",
  "points": [
    {"lat": 59.9343, "lon": 30.3351, "timestamp": "2026-04-15T08:30:15Z"}
  ]
}
```
Создаёт прогулку, вычисляет дистанцию и закрашивает новые тайлы карты.

## Фильтрация списковых эндпоинтов

Все списковые эндпоинты поддерживают пагинацию (`?offset=0&limit=20`) и фильтрацию по полям. Все параметры опциональны и комбинируются через AND. Текстовые поля — регистронезависимый поиск по подстроке.

| Эндпоинт | Параметры фильтрации |
|----------|----------------------|
| `GET /api/users` | `username`, `email` |
| `GET /api/walks` | `userId`, `startedAtFrom`, `startedAtTo`, `distanceMin`, `distanceMax`, `durationMin`, `durationMax` |
| `GET /api/walkpoints` | `walkId`*, `latMin`, `latMax`, `lonMin`, `lonMax`, `timestampFrom`, `timestampTo`, `orderMin`, `orderMax` |
| `GET /api/tiles` | `userId`*, `tileXMin`, `tileXMax`, `tileYMin`, `tileYMax`, `coveredFrom`, `coveredTo` |
| `GET /api/routes` | `userId`, `createdFrom`, `createdTo`, `distanceMin`, `distanceMax`, `estimatedMin`, `estimatedMax` |
| `GET /api/mapnodes` | `osmId`, `tileX`, `tileY`, `bbox` |
| `GET /api/pois` | `name`, `category`, `bbox` |
| `GET /api/districts` | `name` |
| `GET /api/trackfiles` | `format`, `source`, `uploadedFrom`, `uploadedTo` |

\* — обязательный параметр

`bbox` передаётся в формате `min_lat,min_lon,max_lat,max_lon`.  
Даты передаются в формате ISO 8601: `2026-04-01T00:00:00Z`.

