from fastapi import APIRouter, Depends, Query

from database import get_session

router = APIRouter()


def parse_bbox(bbox: str = Query(..., example="59.95,30.28,59.98,30.34")):
    parts = bbox.split(",")
    if len(parts) != 4:
        raise ValueError("bbox must be: min_lat,min_lon,max_lat,max_lon")
    return tuple(float(p) for p in parts)


@router.get("/nodes")
async def get_nodes(bbox: str = Query(...), session=Depends(get_session)):
    min_lat, min_lon, max_lat, max_lon = parse_bbox(bbox)
    result = await session.run(
        """
        MATCH (n:MapNode)
        WHERE n.lat >= $min_lat AND n.lat <= $max_lat
          AND n.lon >= $min_lon AND n.lon <= $max_lon
        RETURN n.osmId AS osmId, n.lat AS lat, n.lon AS lon,
               n.tileX AS tileX, n.tileY AS tileY
        """,
        min_lat=min_lat, min_lon=min_lon, max_lat=max_lat, max_lon=max_lon,
    )
    return [r.data() async for r in result]


@router.get("/edges")
async def get_edges(bbox: str = Query(...), session=Depends(get_session)):
    min_lat, min_lon, max_lat, max_lon = parse_bbox(bbox)
    result = await session.run(
        """
        MATCH (a:MapNode)-[r:CONNECTED_TO]->(b:MapNode)
        WHERE a.lat >= $min_lat AND a.lat <= $max_lat
          AND a.lon >= $min_lon AND a.lon <= $max_lon
          AND b.lat >= $min_lat AND b.lat <= $max_lat
          AND b.lon >= $min_lon AND b.lon <= $max_lon
        RETURN a.lat AS fromLat, a.lon AS fromLon,
               b.lat AS toLat, b.lon AS toLon,
               r.distanceMeters AS distanceMeters
        """,
        min_lat=min_lat, min_lon=min_lon, max_lat=max_lat, max_lon=max_lon,
    )
    return [r.data() async for r in result]


@router.get("/pois")
async def get_pois(bbox: str = Query(...), session=Depends(get_session)):
    min_lat, min_lon, max_lat, max_lon = parse_bbox(bbox)
    result = await session.run(
        """
        MATCH (p:POI)
        WHERE p.lat >= $min_lat AND p.lat <= $max_lat
          AND p.lon >= $min_lon AND p.lon <= $max_lon
        RETURN p.osmId AS osmId, p.name AS name,
               p.category AS category, p.lat AS lat, p.lon AS lon
        """,
        min_lat=min_lat, min_lon=min_lon, max_lat=max_lat, max_lon=max_lon,
    )
    return [r.data() async for r in result]


@router.get("/tiles")
async def get_tiles(userId: str = Query(...), session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile)
        RETURN ct.tileX AS tileX, ct.tileY AS tileY,
               ct.firstCoveredAt AS firstCoveredAt
        """,
        userId=userId,
    )
    return [r.data() async for r in result]