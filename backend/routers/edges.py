from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import haversine, make_page

router = APIRouter()


class CreateEdgeRequest(BaseModel):
    fromOsmId: int
    toOsmId: int
    distanceMeters: float | None = None

@router.get("/")
async def list_edges(
    fromOsmId: int | None = Query(None),
    toOsmId: int | None = Query(None),
    distanceMin: float | None = Query(None),
    distanceMax: float | None = Query(None),
    bbox: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    bbox_parts = [float(x) for x in bbox.split(",")] if bbox else None
    min_lat, min_lon, max_lat, max_lon = bbox_parts if bbox_parts else (None, None, None, None)

    where = """
        WHERE ($fromOsmId IS NULL OR a.osmId = $fromOsmId)
          AND ($toOsmId   IS NULL OR b.osmId = $toOsmId)
          AND ($distMin   IS NULL OR r.distanceMeters >= $distMin)
          AND ($distMax   IS NULL OR r.distanceMeters <= $distMax)
          AND ($minLat    IS NULL OR (a.lat >= $minLat AND a.lat <= $maxLat
                                  AND a.lon >= $minLon AND a.lon <= $maxLon))
    """
    params = dict(
        fromOsmId=fromOsmId, toOsmId=toOsmId,
        distMin=distanceMin, distMax=distanceMax,
        minLat=min_lat, maxLat=max_lat, minLon=min_lon, maxLon=max_lon,
    )

    count_result = await session.run(
        f"MATCH (a:MapNode)-[r:CONNECTED_TO]->(b:MapNode) {where} RETURN count(r) AS total",
        **params,
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        MATCH (a:MapNode)-[r:CONNECTED_TO]->(b:MapNode) {where}
        RETURN a.osmId AS fromOsmId, a.lat AS fromLat, a.lon AS fromLon,
               b.osmId AS toOsmId,   b.lat AS toLat,   b.lon AS toLon,
               r.distanceMeters AS distanceMeters
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_edge(body: CreateEdgeRequest, session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (a:MapNode {osmId: $from})
        MATCH (b:MapNode {osmId: $to})
        RETURN a.lat AS aLat, a.lon AS aLon, b.lat AS bLat, b.lon AS bLon
        """,
        **{"from": body.fromOsmId, "to": body.toOsmId},
    )
    record = await result.single()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or both MapNodes not found")

    dist = body.distanceMeters if body.distanceMeters is not None else round(
        haversine(record["aLat"], record["aLon"], record["bLat"], record["bLon"]), 2
    )

    await session.run(
        """
        MATCH (a:MapNode {osmId: $from})
        MATCH (b:MapNode {osmId: $to})
        CREATE (a)-[:CONNECTED_TO {distanceMeters: $dist}]->(b)
        CREATE (b)-[:CONNECTED_TO {distanceMeters: $dist}]->(a)
        """,
        **{"from": body.fromOsmId, "to": body.toOsmId, "dist": dist},
    )
    return {"fromOsmId": body.fromOsmId, "toOsmId": body.toOsmId, "distanceMeters": dist}


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_edge(
    fromOsmId: int = Query(...),
    toOsmId: int = Query(...),
    session=Depends(get_session),
):
    check = await session.run(
        "MATCH (a:MapNode {osmId: $from})-[r:CONNECTED_TO]-(b:MapNode {osmId: $to}) RETURN r LIMIT 1",
        **{"from": fromOsmId, "to": toOsmId},
    )
    if not await check.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Edge not found")

    await session.run(
        "MATCH (a:MapNode {osmId: $from})-[r:CONNECTED_TO]-(b:MapNode {osmId: $to}) DELETE r",
        **{"from": fromOsmId, "to": toOsmId},
    )

