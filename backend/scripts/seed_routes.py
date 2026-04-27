"""
Скрипт для создания тестовых маршрутов (Route) через API.
Запуск: docker compose exec backend python -m scripts.seed_routes
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

NUM_ROUTES = 5

START_POINTS = [
    (59.9676, 30.3129),
    (59.9589, 30.3072),
    (59.9710, 30.3120),
    (59.9545, 30.2905),
    (59.9650, 30.3060),
    (59.9630, 30.3150),
    (59.9700, 30.2950),
    (59.9600, 30.3000),
]


def get_auth():
    """Получение токена и ID пользователя"""
    response = requests.post(
        f"{API_BASE}/auth/login",
        json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASSWORD}
    )
    response.raise_for_status()
    data = response.json()
    return data["token"], data["user"]["id"]


def create_route(user_id, token, start_lat, start_lon, target_distance, priority):
    route_data = {
        "userId": user_id,
        "startLat": start_lat,
        "startLon": start_lon,
        "targetDistance": target_distance,
        "priority": priority
    }
    
    response = requests.post(
        f"{API_BASE}/routes/",
        json=route_data,
        headers={"Authorization": f"Bearer {token}"}
    )
    return response


def main():
    print("=" * 60)
    print("Создание тестовых маршрутов (Route)")
    print("=" * 60)

    print("\n1. Авторизация testuser...")
    try:
        token, user_id = get_auth()
        print(f"   Пользователь: {user_id}")
    except Exception as e:
        print(f"   Ошибка авторизации: {e}")
        sys.exit(1)
    
    print(f"\n2. Создание {NUM_ROUTES} тестовых маршрутов...")
    print("-" * 60)
    
    success_count = 0
    
    for i in range(NUM_ROUTES):
        start_lat, start_lon = random.choice(START_POINTS)
        target_distance = random.randint(1000, 10000)
        priority = round(random.uniform(0, 1), 2)
        
        print(f"\n   Маршрут {i+1}/{NUM_ROUTES}:")
        print(f"     - Старт: {start_lat}, {start_lon}")
        print(f"     - Дистанция: {target_distance} м")
        print(f"     - Приоритет: {priority} (0=тайлы, 1=POI)")
        
        try:
            response = create_route(user_id, token, start_lat, start_lon, target_distance, priority)
            
            if response.status_code in [200, 201]:
                data = response.json()
                success_count += 1
                print(f"     Создан маршрут: {data.get('routeId', 'unknown')[:8]}...")
                print(f"      - Дистанция: {data.get('totalDistanceMeters', 0)} м")
                print(f"      - Время: {data.get('estimatedMinutes', 0)} мин")
                print(f"      - Новых тайлов: {data.get('newTilesCount', 0)}")
                print(f"      - POI: {len(data.get('highlights', []))}")
            else:
                print(f"     Ошибка HTTP {response.status_code}")
                print(f"        {response.text[:150]}")
        except Exception as e:
            print(f"     Ошибка: {e}")
        
        time.sleep(0.5)
    
    print("\n" + "=" * 60)
    print(f"Создано маршрутов: {success_count}/{NUM_ROUTES}")
    print("=" * 60)


if __name__ == "__main__":
    main()