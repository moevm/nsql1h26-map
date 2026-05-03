from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import make_page

router = APIRouter()


class CreateWalkPointRequest(BaseModel):
    walkId: str
    lat: float
    lon: float
    timestamp: datetime
    order: int


@router.get("/")
async def list_walkpoints(
    walkId: str | None = Query(None),
    latMin: float | None = Query(None),
    latMax: float | None = Query(None),
    lonMin: float | None = Query(None),
    lonMax: float | None = Query(None),
    timestampFrom: str | None = Query(None),
    timestampTo: str | None = Query(None),
    orderMin: int | None = Query(None),
    orderMax: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    where = """
        WHERE ($walkId         IS NULL OR w.id = $walkId)
          AND ($latMin         IS NULL OR wp.lat >= $latMin)
          AND ($latMax         IS NULL OR wp.lat <= $latMax)
          AND ($lonMin         IS NULL OR wp.lon >= $lonMin)
          AND ($lonMax         IS NULL OR wp.lon <= $lonMax)
          AND ($timestampFrom  IS NULL OR wp.timestamp >= datetime($timestampFrom))
          AND ($timestampTo    IS NULL OR wp.timestamp <= datetime($timestampTo))
          AND ($orderMin       IS NULL OR wp.order >= $orderMin)
          AND ($orderMax       IS NULL OR wp.order <= $orderMax)
    """
    params = dict(
        walkId=walkId,
        latMin=latMin, latMax=latMax,
        lonMin=lonMin, lonMax=lonMax,
        timestampFrom=timestampFrom, timestampTo=timestampTo,
        orderMin=orderMin, orderMax=orderMax,
    )

    count_result = await session.run(
        f"MATCH (w:Walk)-[:HAS_POINT]->(wp:WalkPoint) {where} RETURN count(wp) AS total",
        **params,
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        MATCH (w:Walk)-[:HAS_POINT]->(wp:WalkPoint) {where}
        RETURN wp.lat AS lat, wp.lon AS lon, toString(wp.timestamp) AS timestamp, wp.order AS order
        ORDER BY wp.order
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{walkId}")
async def get_walkpoints(walkId: str, session=Depends(get_session)):
    walk_result = await session.run("MATCH (w:Walk {id: $id}) RETURN w", id=walkId)
    if not await walk_result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Walk not found")

    result = await session.run(
        """
        MATCH (w:Walk {id: $walkId})-[:HAS_POINT]->(wp:WalkPoint)
        RETURN wp.lat AS lat, wp.lon AS lon, toString(wp.timestamp) AS timestamp, wp.order AS order
        ORDER BY wp.order
        """,
        walkId=walkId,
    )
    return [r.data() async for r in result]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_walkpoint(body: CreateWalkPointRequest, session=Depends(get_session)):
    walk_result = await session.run("MATCH (w:Walk {id: $id}) RETURN w", id=body.walkId)
    if not await walk_result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Walk not found")

    await session.run(
        """
        MATCH (w:Walk {id: $walkId})
        CREATE (wp:WalkPoint {lat: $lat, lon: $lon, timestamp: datetime($timestamp), order: $order})
        CREATE (w)-[:HAS_POINT]->(wp)
        """,
        walkId=body.walkId,
        lat=body.lat,
        lon=body.lon,
        timestamp=body.timestamp.isoformat(),
        order=body.order,
    )
    return {"walkId": body.walkId, "order": body.order, "lat": body.lat, "lon": body.lon}


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_walkpoint(
    walkId: str = Query(...),
    order: int = Query(...),
    session=Depends(get_session),
):
    result = await session.run(
        """
        MATCH (w:Walk {id: $walkId})-[:HAS_POINT]->(wp:WalkPoint {order: $order})
        RETURN wp
        """,
        walkId=walkId, order=order,
    )
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="WalkPoint not found")

    await session.run(
        """
        MATCH (w:Walk {id: $walkId})-[:HAS_POINT]->(wp:WalkPoint {order: $order})
        DETACH DELETE wp
        """,
        walkId=walkId, order=order,
    )
