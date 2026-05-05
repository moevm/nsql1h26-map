import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import make_page

router = APIRouter()


class CreatePOIRequest(BaseModel):
    name: str
    category: str
    lat: float
    lon: float


class UpdatePOIRequest(BaseModel):
    name: str | None = None
    category: str | None = None
    lat: float | None = None
    lon: float | None = None


def _parse_bbox(bbox: str | None) -> tuple:
    if not bbox:
        return None, None, None, None
    parts = bbox.split(",")
    if len(parts) != 4:
        return None, None, None, None
    return tuple(float(p) for p in parts)


@router.get("/")
async def list_pois(
    name: str | None = Query(None),
    category: str | None = Query(None),
    categories: str | None = Query(None, example="bar,hotel,pub"),
    bbox: str | None = Query(None, example="59.95,30.28,59.98,30.34"),
    route_id: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=5000),
    session=Depends(get_session),
):
    min_lat, min_lon, max_lat, max_lon = _parse_bbox(bbox)
    categories_list = [c.strip() for c in categories.split(",")] if categories else None
    where = """
        WHERE ($name           IS NULL OR toLower(p.name)     CONTAINS toLower($name))
          AND ($category       IS NULL OR toLower(p.category) CONTAINS toLower($category))
          AND ($categories     IS NULL OR p.category IN $categories)
          AND ($minLat         IS NULL OR p.lat >= $minLat)
          AND ($maxLat         IS NULL OR p.lat <= $maxLat)
          AND ($minLon         IS NULL OR p.lon >= $minLon)
          AND ($maxLon         IS NULL OR p.lon <= $maxLon)
          AND ($route_id       IS NULL OR EXISTS { MATCH (r:Route {id: $route_id})-[:PASSES_THROUGH]->(mn:MapNode)-[:HAS_POI]->(p) })
    """
    params = dict(name=name, category=category, categories=categories_list, route_id=route_id,
                  minLat=min_lat, maxLat=max_lat, minLon=min_lon, maxLon=max_lon)

    count_result = await session.run(
        f"MATCH (p:POI) {where} RETURN count(p) AS total", **params
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        MATCH (p:POI) {where}
        RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon
        ORDER BY p.osmId
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)

@router.get("/categories")
async def list_poi_categories(session=Depends(get_session)):
    result = await session.run(
        "MATCH (p:POI) RETURN DISTINCT p.category AS category ORDER BY category"
    )
    categories = [r["category"] async for r in result]
    return {"categories": categories}

@router.get("/{poiId}")
async def get_poi(poiId: str, session=Depends(get_session)):
    try:
        poi_id: int | str = int(poiId)
    except ValueError:
        poi_id = poiId

    result = await session.run(
        "MATCH (p:POI {osmId: $poiId}) RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon",
        poiId=poi_id,
    )
    record = await result.single()
    if not record or record["osmId"] is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POI not found")

    nodes_result = await session.run(
        """
        MATCH (n:MapNode)-[:HAS_POI]->(p:POI {osmId: $poiId})
        RETURN n.osmId AS osmId, n.lat AS lat, n.lon AS lon
        """,
        poiId=poi_id,
    )
    nodes = [r.data() async for r in nodes_result]

    return {**record.data(), "mapNodes": nodes}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_poi(body: CreatePOIRequest, session=Depends(get_session)):
    poi_id = str(uuid.uuid4())

    nearest_result = await session.run(
        """
        MATCH (n:MapNode)
        WITH n, point.distance(
            point({latitude: n.lat, longitude: n.lon}),
            point({latitude: $lat, longitude: $lon})
        ) AS d
        ORDER BY d LIMIT 1
        RETURN n.osmId AS osmId
        """,
        lat=body.lat, lon=body.lon,
    )
    nearest = await nearest_result.single()
    if not nearest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No MapNode found for attachment")

    await session.run(
        """
        CREATE (p:POI {osmId: $poiId, name: $name, category: $category, lat: $lat, lon: $lon})
        WITH p
        MATCH (n:MapNode {osmId: $nodeOsmId})
        CREATE (n)-[:HAS_POI]->(p)
        """,
        poiId=poi_id, name=body.name, category=body.category,
        lat=body.lat, lon=body.lon, nodeOsmId=nearest["osmId"],
    )
    return {"osmId": poi_id, "name": body.name, "category": body.category, "lat": body.lat, "lon": body.lon}


@router.put("/{poiId}")
async def update_poi(poiId: str, body: UpdatePOIRequest, session=Depends(get_session)):
    try:
        poi_id: int | str = int(poiId)
    except ValueError:
        poi_id = poiId

    result = await session.run("MATCH (p:POI {osmId: $poiId}) RETURN p", poiId=poi_id)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POI not found")

    if body.name is not None:
        await session.run("MATCH (p:POI {osmId: $id}) SET p.name = $v", id=poi_id, v=body.name)
    if body.category is not None:
        await session.run("MATCH (p:POI {osmId: $id}) SET p.category = $v", id=poi_id, v=body.category)

    if body.lat is not None and body.lon is not None:
        nearest_result = await session.run(
            """
            MATCH (n:MapNode)
            WITH n, point.distance(
                point({latitude: n.lat, longitude: n.lon}),
                point({latitude: $lat, longitude: $lon})
            ) AS d
            ORDER BY d LIMIT 1
            RETURN n.osmId AS osmId
            """,
            lat=body.lat, lon=body.lon,
        )
        nearest = await nearest_result.single()
        await session.run(
            """
            MATCH (p:POI {osmId: $poiId})
            SET p.lat = $lat, p.lon = $lon
            WITH p
            OPTIONAL MATCH (old:MapNode)-[r:HAS_POI]->(p) DELETE r
            WITH p
            MATCH (n:MapNode {osmId: $nodeOsmId})
            CREATE (n)-[:HAS_POI]->(p)
            """,
            poiId=poi_id, lat=body.lat, lon=body.lon, nodeOsmId=nearest["osmId"],
        )

    result = await session.run(
        "MATCH (p:POI {osmId: $id}) RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon",
        id=poi_id,
    )
    return (await result.single()).data()


@router.delete("/{poiId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poi(poiId: str, session=Depends(get_session)):
    try:
        poi_id: int | str = int(poiId)
    except ValueError:
        poi_id = poiId

    result = await session.run("MATCH (p:POI {osmId: $id}) RETURN p", id=poi_id)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POI not found")

    await session.run("MATCH (p:POI {osmId: $id}) DETACH DELETE p", id=poi_id)
