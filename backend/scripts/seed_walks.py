"""
Скрипт для заполнения БД тестовыми прогулками через API.
Запуск: docker compose exec backend python3 -m scripts.seed_walks
"""

import requests
import random
from datetime import datetime, timedelta
import time
import sys
import os

if os.path.exists('/.dockerenv'):
    API_BASE = "http://backend:11111/api"
else:
    API_BASE = "http://127.0.0.1:10001/api"

TEST_USER_EMAIL = "testuser@example.com"
TEST_USER_PASSWORD = "test123"

# bbox из osm_seed.json (Петроградская сторона)
LAT_MIN, LAT_MAX = 59.95, 59.98
LON_MIN, LON_MAX = 30.28, 30.34

# Конфигурация тестовых данных
NUM_WALKS = 5
POINTS_PER_WALK = 30
DAYS_BACK = 14


def random_point_within_bbox():
    lat = random.uniform(LAT_MIN, LAT_MAX)
    lon = random.uniform(LON_MIN, LON_MAX)
    return lat, lon


def generate_walk_points(num_points):
    points = []
    
    lat, lon = random_point_within_bbox()
    points.append((lat, lon))
    
    for _ in range(num_points - 1):
        lat_offset = random.uniform(-0.0003, 0.0003)
        lon_offset = random.uniform(-0.0003, 0.0003)
        
        lat = max(LAT_MIN, min(LAT_MAX, lat + lat_offset))
        lon = max(LON_MIN, min(LON_MAX, lon + lon_offset))
        
        points.append((lat, lon))
    
    return points


def get_user_info():
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    response.raise_for_status()
    data = response.json()
    token = data["token"]
    user_id = data["user"]["id"]
    
    return token, user_id


def create_walk(user_id, token, points, started_at):
    walk_points = []
    for i, (lat, lon) in enumerate(points):
        timestamp = started_at + timedelta(seconds=i * 30)
        walk_points.append({
            "lat": lat,
            "lon": lon,
            "timestamp": timestamp.isoformat() + "Z"
        })
    
    walk_data = {
        "userId": user_id,
        "points": walk_points
    }
    
    response = requests.post(
        f"{API_BASE}/walks",
        json=walk_data,
        headers={"Authorization": f"Bearer {token}"}
    )
    return response


def main():
    print(f"DEBUG: os.path.exists('/.dockerenv') = {os.path.exists('/.dockerenv')}")
    print(f"DEBUG: API_BASE = {API_BASE}")

    print("=" * 60)
    print("Заполнение БД тестовыми прогулками")
    print(f"Область: lat[{LAT_MIN}..{LAT_MAX}], lon[{LON_MIN}..{LON_MAX}]")
    print("=" * 60)
    
    print("\n1. Авторизация testuser...")
    try:
        token, user_id = get_user_info()
        print(f"   Пользователь: {user_id}")
        print(f"   Токен: {token}")
    except requests.exceptions.ConnectionError:
        print("   Ошибка: Не удалось подключиться к серверу")
        sys.exit(1)
    except Exception as e:
        print(f"   Ошибка авторизации: {e}")
        sys.exit(1)
    
    print(f"\n2. Создание {NUM_WALKS} тестовых прогулок...")
    print("-" * 60)
    
    success_count = 0
    failed_count = 0
    
    for i in range(NUM_WALKS):
        started_at = datetime.now() - timedelta(
            days=random.randint(0, DAYS_BACK),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        )
        
        points = generate_walk_points(POINTS_PER_WALK)
        
        print(f"\n   Прогулка {i+1}/{NUM_WALKS}:")
        print(f"     - Точек: {len(points)}")
        print(f"     - Дата: {started_at.strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
            response = create_walk(user_id, token, points, started_at)
            
            if response.status_code in [200, 201]:
                data = response.json()
                success_count += 1
                print(f"        Успешно создана")
                print(f"        ID прогулки: {data.get('walkId', 'unknown')}")
                print(f"        Дистанция: {data.get('distanceMeters', 0):.0f} м")
                print(f"        Длительность: {data.get('durationSeconds', 0) // 60} мин")
                print(f"        Новых тайлов: {data.get('tilesCount', 0)}")
            else:
                failed_count += 1
                print(f"        Ошибка HTTP {response.status_code}")
                print(f"        {response.text[:150]}")
        except requests.exceptions.RequestException as e:
            failed_count += 1
            print(f"        Ошибка запроса: {e}")
        except Exception as e:
            failed_count += 1
            print(f"        Неизвестная ошибка: {e}")
        
        time.sleep(0.5)
    
    print("=" * 60)


if __name__ == "__main__":
    main()