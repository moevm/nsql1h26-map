import csv
import io
import math


def make_page(items: list, total: int, offset: int, limit: int) -> dict:
    return {"total": total, "offset": offset, "limit": limit, "items": items}


def lat_lon_to_tile(lat: float, lon: float, zoom: int = 19) -> tuple[int, int]:
    fx, fy = lat_lon_to_tile_float(lat, lon, zoom)
    return int(fx), int(fy)


def lat_lon_to_tile_float(lat: float, lon: float, zoom: int = 19) -> tuple[float, float]:
    """Web Mercator с дробной точностью — нужен для растеризации отрезков."""
    n = 2 ** zoom
    tile_x = (lon + 180) / 360 * n
    tile_y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return tile_x, tile_y


def tiles_on_segment(
    lat1: float, lon1: float, lat2: float, lon2: float, zoom: int = 19,
) -> set[tuple[int, int]]:
    """Все тайлы (zoom), через которые проходит отрезок между двумя гео-точками.

    Шагаем по отрезку с шагом 0.4 тайла, собираем уникальные cell-индексы.
    Гарантирует покрытие тайлов длинных рёбер CONNECTED_TO, между концами
    которых нет MapNode.
    """
    x1, y1 = lat_lon_to_tile_float(lat1, lon1, zoom)
    x2, y2 = lat_lon_to_tile_float(lat2, lon2, zoom)
    dx, dy = x2 - x1, y2 - y1
    span = max(abs(dx), abs(dy))
    steps = max(int(span / 0.4) + 1, 1)
    tiles = {(int(x1), int(y1)), (int(x2), int(y2))}
    for i in range(1, steps):
        t = i / steps
        tiles.add((int(x1 + dx * t), int(y1 + dy * t)))
    return tiles


def make_csv_response(rows: list[list], headers: list[str], filename: str):
    from fastapi.responses import StreamingResponse
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))