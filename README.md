# nosql_template

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
python3 scripts/fetch_osm.py --bbox "59.95,30.28,59.98,30.34"
```

Для визуализации результата — запустить локальный сервер и открыть карту:

```bash
python3 -m http.server 8080
# открыть http://localhost:8080/backend/scripts/preview.html
```


## Предварительная проверка заданий

<a href=" ./../../../actions/workflows/1_helloworld.yml" >![1. Согласована и сформулирована тема курсовой]( ./../../actions/workflows/1_helloworld.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/2_usecase.yml" >![2. Usecase]( ./../../actions/workflows/2_usecase.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/3_data_model.yml" >![3. Модель данных]( ./../../actions/workflows/3_data_model.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/4_prototype_store_and_view.yml" >![4. Прототип хранение и представление]( ./../../actions/workflows/4_prototype_store_and_view.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/5_prototype_analysis.yml" >![5. Прототип анализ]( ./../../actions/workflows/5_prototype_analysis.yml/badge.svg)</a> 

<a href=" ./../../../actions/workflows/6_report.yml" >![6. Пояснительная записка]( ./../../actions/workflows/6_report.yml/badge.svg)</a>

<a href=" ./../../../actions/workflows/7_app_is_ready.yml" >![7. App is ready]( ./../../actions/workflows/7_app_is_ready.yml/badge.svg)</a>
