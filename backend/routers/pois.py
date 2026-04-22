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


@router.get("/")
async def list_pois(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    count_result = await session.run("MATCH (p:POI) RETURN count(p) AS total")
    total = (await count_result.single())["total"]

    result = await session.run(
        """
        MATCH (p:POI)
        RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon
        ORDER BY p.osmId
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{poiId}")
async def get_poi(poiId: str, session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (p:POI {osmId: $poiId})
        OPTIONAL MATCH (n:MapNode)-[:HAS_POI]->(p)
        RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon,
               n.osmId AS nearestNodeOsmId, n.lat AS nearestNodeLat, n.lon AS nearestNodeLon
        """,
        poiId=poiId,
    )
    record = await result.single()
    if not record or record["osmId"] is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POI not found")
    return record.data()


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
    result = await session.run("MATCH (p:POI {osmId: $poiId}) RETURN p", poiId=poiId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POI not found")

    if body.name is not None:
        await session.run("MATCH (p:POI {osmId: $id}) SET p.name = $v", id=poiId, v=body.name)
    if body.category is not None:
        await session.run("MATCH (p:POI {osmId: $id}) SET p.category = $v", id=poiId, v=body.category)

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
            poiId=poiId, lat=body.lat, lon=body.lon, nodeOsmId=nearest["osmId"],
        )

    result = await session.run(
        "MATCH (p:POI {osmId: $id}) RETURN p.osmId AS osmId, p.name AS name, p.category AS category, p.lat AS lat, p.lon AS lon",
        id=poiId,
    )
    return (await result.single()).data()


@router.delete("/{poiId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_poi(poiId: str, session=Depends(get_session)):
    result = await session.run("MATCH (p:POI {osmId: $id}) RETURN p", id=poiId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="POI not found")

    await session.run("MATCH (p:POI {osmId: $id}) DETACH DELETE p", id=poiId)
