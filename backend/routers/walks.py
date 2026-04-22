import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import haversine, lat_lon_to_tile, make_page

router = APIRouter()


class WalkPoint(BaseModel):
    lat: float
    lon: float
    timestamp: datetime


class CreateWalkRequest(BaseModel):
    userId: str
    points: list[WalkPoint]


class UpdateWalkRequest(BaseModel):
    distanceMeters: float | None = None
    durationSeconds: int | None = None


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_walk(body: CreateWalkRequest, session=Depends(get_session)):
    if len(body.points) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least 2 points required")

    user = await session.run("MATCH (u:User {id: $id}) RETURN u", id=body.userId)
    if not await user.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    points = sorted(body.points, key=lambda p: p.timestamp)
    started_at = points[0].timestamp
    finished_at = points[-1].timestamp
    duration_seconds = int((finished_at - started_at).total_seconds())

    distance_meters = sum(
        haversine(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon)
        for i in range(len(points) - 1)
    )

    walk_id = str(uuid.uuid4())
    await session.run(
        """
        MATCH (u:User {id: $userId})
        CREATE (w:Walk {
            id: $walkId,
            startedAt: datetime($startedAt),
            finishedAt: datetime($finishedAt),
            distanceMeters: $distanceMeters,
            durationSeconds: $durationSeconds
        })
        CREATE (u)-[:PERFORMED]->(w)
        """,
        userId=body.userId,
        walkId=walk_id,
        startedAt=started_at.isoformat(),
        finishedAt=finished_at.isoformat(),
        distanceMeters=round(distance_meters, 2),
        durationSeconds=duration_seconds,
    )

    walk_points = [
        {
            "lat": p.lat,
            "lon": p.lon,
            "timestamp": p.timestamp.isoformat(),
            "order": i,
        }
        for i, p in enumerate(points)
    ]
    await session.run(
        """
        MATCH (w:Walk {id: $walkId})
        UNWIND $points AS p
        CREATE (wp:WalkPoint {lat: p.lat, lon: p.lon, timestamp: datetime(p.timestamp), order: p.order})
        CREATE (w)-[:HAS_POINT]->(wp)
        """,
        walkId=walk_id,
        points=walk_points,
    )

    tiles = list({(lat_lon_to_tile(p.lat, p.lon)) for p in points})
    await session.run(
        """
        UNWIND $tiles AS t
        MATCH (u:User {id: $userId})
        MERGE (u)-[:COVERED]->(ct:CoveredTile {tileX: t.tileX, tileY: t.tileY})
        ON CREATE SET ct.firstCoveredAt = datetime($now)
        WITH ct
        MATCH (w:Walk {id: $walkId})
        MERGE (w)-[:FIRST_COVERED]->(ct)
        """,
        userId=body.userId,
        walkId=walk_id,
        tiles=[{"tileX": tx, "tileY": ty} for tx, ty in tiles],
        now=datetime.now(timezone.utc).isoformat(),
    )

    return {
        "walkId": walk_id,
        "distanceMeters": round(distance_meters, 2),
        "durationSeconds": duration_seconds,
        "tilesCount": len(tiles),
    }


@router.get("/")
async def list_walks(
    userId: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    if userId:
        count_result = await session.run(
            "MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk) RETURN count(w) AS total",
            userId=userId,
        )
        total = (await count_result.single())["total"]
        result = await session.run(
            """
            MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)
            RETURN w.id AS id, toString(w.startedAt) AS startedAt, toString(w.finishedAt) AS finishedAt,
                   w.distanceMeters AS distanceMeters, w.durationSeconds AS durationSeconds
            ORDER BY w.startedAt DESC
            SKIP $offset LIMIT $limit
            """,
            userId=userId, offset=offset, limit=limit,
        )
    else:
        count_result = await session.run("MATCH (w:Walk) RETURN count(w) AS total")
        total = (await count_result.single())["total"]
        result = await session.run(
            """
            MATCH (w:Walk)
            RETURN w.id AS id, toString(w.startedAt) AS startedAt, toString(w.finishedAt) AS finishedAt,
                   w.distanceMeters AS distanceMeters, w.durationSeconds AS durationSeconds
            ORDER BY w.startedAt DESC
            SKIP $offset LIMIT $limit
            """,
            offset=offset, limit=limit,
        )

    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{walkId}")
async def get_walk(walkId: str, session=Depends(get_session)):
    walk_result = await session.run(
        """
        MATCH (w:Walk {id: $walkId})
        OPTIONAL MATCH (w)-[:HAS_POINT]->(wp:WalkPoint)
        OPTIONAL MATCH (w)-[:FIRST_COVERED]->(ct:CoveredTile)
        RETURN w.id AS id, toString(w.startedAt) AS startedAt, toString(w.finishedAt) AS finishedAt,
               w.distanceMeters AS distanceMeters, w.durationSeconds AS durationSeconds,
               count(DISTINCT wp) AS pointsCount, count(DISTINCT ct) AS newTilesCount
        """,
        walkId=walkId,
    )
    record = await walk_result.single()
    if not record or record["id"] is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Walk not found")

    points_result = await session.run(
        """
        MATCH (w:Walk {id: $walkId})-[:HAS_POINT]->(wp:WalkPoint)
        RETURN wp.lat AS lat, wp.lon AS lon, toString(wp.timestamp) AS timestamp, wp.order AS order
        ORDER BY wp.order
        """,
        walkId=walkId,
    )
    points = [r.data() async for r in points_result]

    return {**record.data(), "points": points}


@router.put("/{walkId}")
async def update_walk(walkId: str, body: UpdateWalkRequest, session=Depends(get_session)):
    result = await session.run("MATCH (w:Walk {id: $id}) RETURN w", id=walkId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Walk not found")

    if body.distanceMeters is not None:
        await session.run(
            "MATCH (w:Walk {id: $id}) SET w.distanceMeters = $v", id=walkId, v=body.distanceMeters
        )
    if body.durationSeconds is not None:
        await session.run(
            "MATCH (w:Walk {id: $id}) SET w.durationSeconds = $v", id=walkId, v=body.durationSeconds
        )

    result = await session.run(
        """
        MATCH (w:Walk {id: $id})
        RETURN w.id AS id, toString(w.startedAt) AS startedAt, toString(w.finishedAt) AS finishedAt,
               w.distanceMeters AS distanceMeters, w.durationSeconds AS durationSeconds
        """,
        id=walkId,
    )
    return (await result.single()).data()


@router.delete("/{walkId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_walk(walkId: str, session=Depends(get_session)):
    result = await session.run("MATCH (w:Walk {id: $id}) RETURN w", id=walkId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Walk not found")

    await session.run(
        """
        MATCH (w:Walk {id: $walkId})
        OPTIONAL MATCH (w)-[:HAS_POINT]->(wp:WalkPoint)
        OPTIONAL MATCH (w)-[:FIRST_COVERED]->(ct:CoveredTile)
        DETACH DELETE w, wp, ct
        """,
        walkId=walkId,
    )
