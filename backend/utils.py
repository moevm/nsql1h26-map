import csv
import io
import math


def make_page(items: list, total: int, offset: int, limit: int) -> dict:
    return {"total": total, "offset": offset, "limit": limit, "items": items}


def lat_lon_to_tile(lat: float, lon: float, zoom: int = 19) -> tuple[int, int]:
    n = 2 ** zoom
    tile_x = int((lon + 180) / 360 * n)
    tile_y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return tile_x, tile_y


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