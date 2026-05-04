from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import lat_lon_to_tile, make_page

router = APIRouter()


def _parse_bbox(bbox: str | None) -> tuple:
    if not bbox:
        return None, None, None, None
    parts = bbox.split(",")
    if len(parts) != 4:
        return None, None, None, None
    min_lat, min_lon, max_lat, max_lon = (float(p) for p in parts)
    return min_lat, min_lon, max_lat, max_lon


class CreateMapNodeRequest(BaseModel):
    osmId: int
    lat: float
    lon: float


class UpdateMapNodeRequest(BaseModel):
    lat: float
    lon: float


@router.get("/")
async def list_mapnodes(
    osmId: int | None = Query(None),
    tileX: int | None = Query(None),
    tileY: int | None = Query(None),
    bbox: str | None = Query(None, example="59.95,30.28,59.98,30.34"),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=10000),
    session=Depends(get_session),
):
    min_lat, min_lon, max_lat, max_lon = _parse_bbox(bbox)
    where = """
        WHERE ($osmId   IS NULL OR n.osmId = $osmId)
          AND ($tileX   IS NULL OR n.tileX = $tileX)
          AND ($tileY   IS NULL OR n.tileY = $tileY)
          AND ($minLat  IS NULL OR n.lat >= $minLat)
          AND ($maxLat  IS NULL OR n.lat <= $maxLat)
          AND ($minLon  IS NULL OR n.lon >= $minLon)
          AND ($maxLon  IS NULL OR n.lon <= $maxLon)
    """
    params = dict(osmId=osmId, tileX=tileX, tileY=tileY,
                  minLat=min_lat, maxLat=max_lat, minLon=min_lon, maxLon=max_lon)

    count_result = await session.run(
        f"MATCH (n:MapNode) {where} RETURN count(n) AS total", **params
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        MATCH (n:MapNode) {where}
        RETURN n.osmId AS osmId, n.lat AS lat, n.lon AS lon, n.tileX AS tileX, n.tileY AS tileY
        ORDER BY n.osmId
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{osmId}")
async def get_mapnode(osmId: int, session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (n:MapNode {osmId: $osmId})
        RETURN n.osmId AS osmId, n.lat AS lat, n.lon AS lon, n.tileX AS tileX, n.tileY AS tileY
        """,
        osmId=osmId,
    )
    record = await result.single()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MapNode not found")

    neighbors_result = await session.run(
        """
        MATCH (n:MapNode {osmId: $osmId})-[e:CONNECTED_TO]->(nb:MapNode)
        RETURN nb.osmId AS osmId, nb.lat AS lat, nb.lon AS lon, e.distanceMeters AS distanceMeters
        """,
        osmId=osmId,
    )
    neighbors = [r.data() async for r in neighbors_result]

    pois_result = await session.run(
        """
        MATCH (n:MapNode {osmId: $osmId})-[:HAS_POI]->(p:POI)
        RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon
        """,
        osmId=osmId,
    )
    pois = [r.data() async for r in pois_result]

    return {**record.data(), "neighbors": neighbors, "pois": pois}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_mapnode(body: CreateMapNodeRequest, session=Depends(get_session)):
    exists = await session.run("MATCH (n:MapNode {osmId: $osmId}) RETURN n", osmId=body.osmId)
    if await exists.single():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="MapNode already exists")

    tile_x, tile_y = lat_lon_to_tile(body.lat, body.lon)
    await session.run(
        """
        CREATE (:MapNode {osmId: $osmId, lat: $lat, lon: $lon, tileX: $tileX, tileY: $tileY})
        """,
        osmId=body.osmId, lat=body.lat, lon=body.lon, tileX=tile_x, tileY=tile_y,
    )
    return {"osmId": body.osmId, "lat": body.lat, "lon": body.lon, "tileX": tile_x, "tileY": tile_y}


@router.put("/{osmId}")
async def update_mapnode(osmId: int, body: UpdateMapNodeRequest, session=Depends(get_session)):
    result = await session.run("MATCH (n:MapNode {osmId: $osmId}) RETURN n", osmId=osmId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MapNode not found")

    tile_x, tile_y = lat_lon_to_tile(body.lat, body.lon)
    await session.run(
        """
        MATCH (n:MapNode {osmId: $osmId})
        SET n.lat = $lat, n.lon = $lon, n.tileX = $tileX, n.tileY = $tileY
        """,
        osmId=osmId, lat=body.lat, lon=body.lon, tileX=tile_x, tileY=tile_y,
    )
    return {"osmId": osmId, "lat": body.lat, "lon": body.lon, "tileX": tile_x, "tileY": tile_y}


@router.delete("/{osmId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mapnode(osmId: int, session=Depends(get_session)):
    result = await session.run("MATCH (n:MapNode {osmId: $osmId}) RETURN n", osmId=osmId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="MapNode not found")

    await session.run(
        """
        MATCH (n:MapNode {osmId: $osmId})
        OPTIONAL MATCH (n)-[:HAS_POI]->(p:POI)
        DETACH DELETE n, p
        """,
        osmId=osmId,
    )
