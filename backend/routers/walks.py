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


class UpdateWalkPoint(BaseModel):
    lat: float
    lon: float
    timestamp: datetime
    order: int


class UpdateWalkRequest(BaseModel):
    distanceMeters: float | None = None
    durationSeconds: int | None = None
    startedAt: datetime | None = None
    finishedAt: datetime | None = None
    points: list[UpdateWalkPoint] | None = None

async def _create_walk(session, user_id: str, points: list[WalkPoint]) -> dict:
    if len(points) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="At least 2 points required")

    points = sorted(points, key=lambda p: p.timestamp)
    started_at = points[0].timestamp
    finished_at = points[-1].timestamp
    duration_seconds = int((finished_at - started_at).total_seconds())

    distance_meters = sum(
        haversine(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon)
        for i in range(len(points) - 1)
    )

    walk_id = str(uuid.uuid4())
    tiles = list({lat_lon_to_tile(p.lat, p.lon) for p in points})

    await session.run(
        """
        MATCH (u:User {id: $userId})
        CREATE (w:Walk {
            id: $walkId,
            startedAt: datetime($startedAt),
            finishedAt: datetime($finishedAt),
            distanceMeters: $distanceMeters,
            durationSeconds: $durationSeconds,
            allTilesCount: $allTilesCount
        })
        CREATE (u)-[:PERFORMED]->(w)
        """,
        userId=user_id,
        walkId=walk_id,
        startedAt=started_at.isoformat(),
        finishedAt=finished_at.isoformat(),
        distanceMeters=round(distance_meters, 2),
        durationSeconds=duration_seconds,
        allTilesCount=len(tiles),
    )

    walk_points_data = [
        {"lat": p.lat, "lon": p.lon, "timestamp": p.timestamp.isoformat(), "order": i}
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
        points=walk_points_data,
    )

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
        userId=user_id,
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


async def rebuild_user_covered_tiles(session, user_id: str):
    await session.run(
        """
        MATCH (u:User {id: $userId})-[r:COVERED]->()
        DELETE r
        """,
        userId=user_id,
    )

    await session.run(
        """
        MATCH (u:User {id: $userId})
              -[:PERFORMED]->
              (:Walk)
              -[:FIRST_COVERED]->
              (ct:CoveredTile)

        MERGE (u)-[:COVERED]->(ct)
        """,
        userId=user_id,
    )

    await session.run(
        """
        MATCH (ct:CoveredTile)
        WHERE NOT ()-[:COVERED]->(ct)
        DETACH DELETE ct
        """
    )


async def create_first_covered_links(
    session,
    user_id: str,
    walk_id: str,
    tiles: list[tuple[int, int]],
):
    await session.run(
        """
        UNWIND $tiles AS t

        MATCH (u:User {id: $userId})

        MERGE (ct:CoveredTile {
            tileX: t.tileX,
            tileY: t.tileY
        })

        ON CREATE SET ct.firstCoveredAt = datetime($now)

        WITH ct

        MATCH (w:Walk {id: $walkId})

        MERGE (w)-[:FIRST_COVERED]->(ct)
        """,
        userId=user_id,
        walkId=walk_id,
        tiles=[{"tileX": tx, "tileY": ty} for tx, ty in tiles],
        now=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_walk(body: CreateWalkRequest, session=Depends(get_session)):
    if len(body.points) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least 2 points required",
        )

    user = await session.run(
        "MATCH (u:User {id: $id}) RETURN u",
        id=body.userId,
    )

    if not await user.single():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    points = sorted(body.points, key=lambda p: p.timestamp)

    started_at = points[0].timestamp
    finished_at = points[-1].timestamp

    duration_seconds = int(
        (finished_at - started_at).total_seconds()
    )

    distance_meters = sum(
        haversine(
            points[i].lat,
            points[i].lon,
            points[i + 1].lat,
            points[i + 1].lon,
        )
        for i in range(len(points) - 1)
    )

    walk_id = str(uuid.uuid4())

    tiles = list({
        lat_lon_to_tile(p.lat, p.lon)
        for p in points
    })

    await session.run(
        """
        MATCH (u:User {id: $userId})

        CREATE (w:Walk {
            id: $walkId,
            startedAt: datetime($startedAt),
            finishedAt: datetime($finishedAt),
            distanceMeters: $distanceMeters,
            durationSeconds: $durationSeconds,
            allTilesCount: $allTilesCount
        })

        CREATE (u)-[:PERFORMED]->(w)
        """,
        userId=body.userId,
        walkId=walk_id,
        startedAt=started_at.isoformat(),
        finishedAt=finished_at.isoformat(),
        distanceMeters=round(distance_meters, 2),
        durationSeconds=duration_seconds,
        allTilesCount=len(tiles),
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

        CREATE (wp:WalkPoint {
            lat: p.lat,
            lon: p.lon,
            timestamp: datetime(p.timestamp),
            order: p.order
        })

        CREATE (w)-[:HAS_POINT]->(wp)
        """,
        walkId=walk_id,
        points=walk_points,
    )

    await create_first_covered_links(
        session,
        body.userId,
        walk_id,
        tiles,
    )

    await rebuild_user_covered_tiles(
        session,
        body.userId,
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
    startedAtFrom: str | None = Query(None),
    startedAtTo: str | None = Query(None),
    distanceMin: float | None = Query(None),
    distanceMax: float | None = Query(None),
    durationMin: int | None = Query(None),
    durationMax: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    match = "MATCH (u:User)-[:PERFORMED]->(w:Walk)"

    where = """
        WHERE ($userId IS NULL OR u.id = $userId)
          AND ($startedAtFrom IS NULL OR w.startedAt >= datetime($startedAtFrom))
          AND ($startedAtTo IS NULL OR w.startedAt <= datetime($startedAtTo))
          AND ($distanceMin IS NULL OR w.distanceMeters >= $distanceMin)
          AND ($distanceMax IS NULL OR w.distanceMeters <= $distanceMax)
          AND ($durationMin IS NULL OR w.durationSeconds >= $durationMin)
          AND ($durationMax IS NULL OR w.durationSeconds <= $durationMax)
    """

    params = dict(
        userId=userId,
        startedAtFrom=startedAtFrom,
        startedAtTo=startedAtTo,
        distanceMin=distanceMin,
        distanceMax=distanceMax,
        durationMin=durationMin,
        durationMax=durationMax,
    )

    count_result = await session.run(
        f"{match} {where} RETURN count(w) AS total",
        **params,
    )

    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        {match} {where}

        RETURN
            u.id AS userId,
            w.id AS id,
            toString(w.startedAt) AS startedAt,
            toString(w.finishedAt) AS finishedAt,
            w.distanceMeters AS distanceMeters,
            w.durationSeconds AS durationSeconds,
            size([(w)-[:FIRST_COVERED]->(ct) | ct]) AS newTilesCount,
            w.allTilesCount AS allTilesCount

        ORDER BY w.startedAt DESC

        SKIP $offset
        LIMIT $limit
        """,
        offset=offset,
        limit=limit,
        **params,
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

        RETURN
            w.id AS id,
            toString(w.startedAt) AS startedAt,
            toString(w.finishedAt) AS finishedAt,
            w.distanceMeters AS distanceMeters,
            w.durationSeconds AS durationSeconds,
            count(DISTINCT wp) AS pointsCount,
            count(DISTINCT ct) AS newTilesCount,
            w.allTilesCount AS allTilesCount
        """,
        walkId=walkId,
    )

    record = await walk_result.single()

    if not record or record["id"] is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Walk not found",
        )

    points_result = await session.run(
        """
        MATCH (w:Walk {id: $walkId})-[:HAS_POINT]->(wp:WalkPoint)

        RETURN
            wp.lat AS lat,
            wp.lon AS lon,
            toString(wp.timestamp) AS timestamp,
            wp.order AS order

        ORDER BY wp.order
        """,
        walkId=walkId,
    )

    points = [r.data() async for r in points_result]

    return {
        **record.data(),
        "points": points,
    }


@router.put("/{walkId}")
async def update_walk(
    walkId: str,
    body: UpdateWalkRequest,
    session=Depends(get_session),
):
    result = await session.run(
        "MATCH (w:Walk {id: $id}) RETURN w",
        id=walkId,
    )

    if not await result.single():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Walk not found",
        )

    user_result = await session.run(
        """
        MATCH (u:User)-[:PERFORMED]->(w:Walk {id: $id})
        RETURN u.id AS userId
        """,
        id=walkId,
    )

    user_record = await user_result.single()
    user_id = user_record["userId"]

    if body.points is not None:
        pts = sorted(body.points, key=lambda p: p.order)

        started_at = body.startedAt if body.startedAt is not None else min(p.timestamp for p in pts)
        finished_at = body.finishedAt if body.finishedAt is not None else max(p.timestamp for p in pts)
        duration_seconds = body.durationSeconds if body.durationSeconds is not None else int((finished_at - started_at).total_seconds())

        distance_meters = body.distanceMeters if body.distanceMeters is not None else sum(
            haversine(
                pts[i].lat,
                pts[i].lon,
                pts[i + 1].lat,
                pts[i + 1].lon,
            )
            for i in range(len(pts) - 1)
        )

        tiles = list({
            lat_lon_to_tile(p.lat, p.lon)
            for p in pts
        })

        await session.run(
            """
            MATCH (w:Walk {id: $id})-[:HAS_POINT]->(wp:WalkPoint)
            DETACH DELETE wp
            """,
            id=walkId,
        )

        walk_points_data = [
            {
                "lat": p.lat,
                "lon": p.lon,
                "timestamp": p.timestamp.isoformat(),
                "order": p.order,
            }
            for p in pts
        ]

        await session.run(
            """
            MATCH (w:Walk {id: $walkId})
            UNWIND $points AS p
            CREATE (wp:WalkPoint {
                lat: p.lat,
                lon: p.lon,
                timestamp: datetime(p.timestamp),
                order: p.order
            })
            CREATE (w)-[:HAS_POINT]->(wp)
            """,
            walkId=walkId,
            points=walk_points_data,
        )

        await session.run(
            """
            MATCH (w:Walk {id: $walkId})-[fc:FIRST_COVERED]->()
            DELETE fc
            """,
            walkId=walkId,
        )

        await create_first_covered_links(
            session,
            user_id,
            walkId,
            tiles,
        )

        await rebuild_user_covered_tiles(
            session,
            user_id,
        )

        await session.run(
            """
            MATCH (w:Walk {id: $id})
            SET
                w.distanceMeters = $distance,
                w.durationSeconds = $duration,
                w.startedAt = datetime($startedAt),
                w.finishedAt = datetime($finishedAt),
                w.allTilesCount = $allTilesCount
            """,
            id=walkId,
            distance=round(distance_meters, 2),
            duration=duration_seconds,
            startedAt=started_at.isoformat(),
            finishedAt=finished_at.isoformat(),
            allTilesCount=len(tiles),
        )

    else:
        set_clauses = []
        params = {"id": walkId}

        if body.distanceMeters is not None:
            set_clauses.append("w.distanceMeters = $distanceMeters")
            params["distanceMeters"] = body.distanceMeters
        if body.durationSeconds is not None:
            set_clauses.append("w.durationSeconds = $durationSeconds")
            params["durationSeconds"] = body.durationSeconds
        if body.startedAt is not None:
            set_clauses.append("w.startedAt = datetime($startedAt)")
            params["startedAt"] = body.startedAt.isoformat()
        if body.finishedAt is not None:
            set_clauses.append("w.finishedAt = datetime($finishedAt)")
            params["finishedAt"] = body.finishedAt.isoformat()

        if set_clauses:
            await session.run(
                f"MATCH (w:Walk {{id: $id}}) SET {', '.join(set_clauses)}",
                **params,
            )

    result = await session.run(
        """
        MATCH (w:Walk {id: $id})
        RETURN
            w.id AS id,
            toString(w.startedAt) AS startedAt,
            toString(w.finishedAt) AS finishedAt,
            w.distanceMeters AS distanceMeters,
            w.durationSeconds AS durationSeconds,
            w.allTilesCount AS allTilesCount
        """,
        id=walkId,
    )

    return (await result.single()).data()


@router.delete("/{walkId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_walk(walkId: str, session=Depends(get_session)):
    result = await session.run(
        "MATCH (w:Walk {id: $id}) RETURN w",
        id=walkId,
    )

    if not await result.single():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Walk not found",
        )

    user_result = await session.run(
        """
        MATCH (u:User)-[:PERFORMED]->(w:Walk {id: $id})
        RETURN u.id AS userId
        """,
        id=walkId,
    )

    user_record = await user_result.single()
    user_id = user_record["userId"]

    await session.run(
        """
        MATCH (w:Walk {id: $walkId})

        OPTIONAL MATCH (w)-[:HAS_POINT]->(wp:WalkPoint)

        DETACH DELETE w, wp
        """,
        walkId=walkId,
    )

    await rebuild_user_covered_tiles(
        session,
        user_id,
    )

