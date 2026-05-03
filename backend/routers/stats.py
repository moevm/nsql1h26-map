from datetime import date as date_cls, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from database import get_session

router = APIRouter()


@router.get("/")
async def get_stats(userId: str = Query(...), session=Depends(get_session)):
    user_result = await session.run(
        "MATCH (u:User {id: $userId}) RETURN toString(u.createdAt) AS createdAt",
        userId=userId,
    )
    user_record = await user_result.single()
    created_at = user_record["createdAt"] if user_record else None

    # 1. Агрегация по датам: расстояние и количество прогулок за каждый день
    days_result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)
        WITH date(w.startedAt) AS day, sum(w.distanceMeters) AS dayDistance, count(w) AS dayWalks
        ORDER BY day
        RETURN toString(day) AS date, dayDistance, dayWalks
        """,
        userId=userId,
    )
    by_date = [r.data() async for r in days_result]

    total_distance = sum(r["dayDistance"] for r in by_date)
    walk_count = sum(r["dayWalks"] for r in by_date)
    active_days = len(by_date)
    avg_distance = round(total_distance / walk_count, 1) if walk_count else 0.0

    best = max(by_date, key=lambda r: r["dayDistance"], default=None)
    best_day = (
        {"date": best["date"], "walkCount": best["dayWalks"], "distance": best["dayDistance"]}
        if best else None
    )

    # 2. Новые тайлы по датам (через FIRST_COVERED)
    tiles_by_date_result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)-[:FIRST_COVERED]->(ct:CoveredTile)
        WITH date(w.startedAt) AS day, count(DISTINCT ct) AS newTiles
        ORDER BY day
        RETURN toString(day) AS date, newTiles
        """,
        userId=userId,
    )
    tiles_by_date = {r["date"]: r["newTiles"] async for r in tiles_by_date_result}

    # 4. Покрытые тайлы пользователя
    tiles_result = await session.run(
        "MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile) RETURN count(ct) AS covered",
        userId=userId,
    )
    covered_tiles = (await tiles_result.single())["covered"]

    # 5. Всего уникальных тайлов на карте
    map_tiles_result = await session.run(
        "MATCH (mn:MapNode) RETURN count(DISTINCT [mn.tileX, mn.tileY]) AS total"
    )
    total_map_tiles = (await map_tiles_result.single())["total"]
    coverage_percent = round(covered_tiles / total_map_tiles * 100, 2) if total_map_tiles else 0.0

    # 6. Динамика недели: текущая vs предыдущая
    today = date_cls.today()
    current_week_start = today - timedelta(days=today.weekday())
    prev_week_start = current_week_start - timedelta(days=7)

    week_result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)
        WHERE w.startedAt >= datetime($prevWeekStart)
        WITH w,
             w.startedAt >= datetime($currentWeekStart) AS isCurrentWeek
        RETURN
            sum(CASE WHEN isCurrentWeek THEN w.distanceMeters ELSE 0 END) AS currentWeek,
            sum(CASE WHEN NOT isCurrentWeek THEN w.distanceMeters ELSE 0 END) AS previousWeek
        """,
        userId=userId,
        prevWeekStart=prev_week_start.isoformat(),
        currentWeekStart=current_week_start.isoformat(),
    )
    week = await week_result.single()
    current_week = week["currentWeek"] if week else 0.0
    previous_week = week["previousWeek"] if week else 0.0
    weekly_ratio = round(current_week / previous_week, 2) if previous_week else None

    return {
        "createdAt": created_at,
        "totalDistance": round(total_distance, 1),
        "walkCount": walk_count,
        "activeDays": active_days,
        "avgDistancePerWalk": avg_distance,
        "coveredTiles": covered_tiles,
        "totalMapTiles": total_map_tiles,
        "coveragePercent": coverage_percent,
        "bestDay": best_day,
        "weeklyDynamics": {
            "currentWeek": round(current_week, 1),
            "previousWeek": round(previous_week, 1),
            "ratio": weekly_ratio,
        },
        "distanceByDate": [
            {
                "date": r["date"],
                "distance": r["dayDistance"],
                "walkCount": r["dayWalks"],
                "newTiles": tiles_by_date.get(r["date"], 0),
            }
            for r in by_date
        ],
    }


_SUPPORTED_METRICS = {"distance", "walks", "tiles"}


@router.get("/metrics")
async def get_metrics(
    userId: str = Query(...),
    metric: str = Query(...),
    date: str = Query(...),
    days: int = Query(..., ge=1, le=365),
    session=Depends(get_session),
):
    if metric not in _SUPPORTED_METRICS:
        raise HTTPException(status_code=422, detail=f"Unknown metric '{metric}'. Supported: {', '.join(sorted(_SUPPORTED_METRICS))}")

    try:
        end_date = date_cls.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format, expected YYYY-MM-DD")

    start_date = end_date - timedelta(days=days - 1)

    if metric == "distance":
        result = await session.run(
            """
            MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)
            WHERE date(w.startedAt) >= date($startDate) AND date(w.startedAt) <= date($endDate)
            WITH date(w.startedAt) AS day, sum(w.distanceMeters) AS value
            ORDER BY day
            RETURN toString(day) AS date, value
            """,
            userId=userId, startDate=start_date.isoformat(), endDate=end_date.isoformat(),
        )
    elif metric == "walks":
        result = await session.run(
            """
            MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)
            WHERE date(w.startedAt) >= date($startDate) AND date(w.startedAt) <= date($endDate)
            WITH date(w.startedAt) AS day, count(w) AS value
            ORDER BY day
            RETURN toString(day) AS date, value
            """,
            userId=userId, startDate=start_date.isoformat(), endDate=end_date.isoformat(),
        )
    elif metric == "tiles":
        result = await session.run(
            """
            MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk)-[:FIRST_COVERED]->(ct:CoveredTile)
            WHERE date(w.startedAt) >= date($startDate) AND date(w.startedAt) <= date($endDate)
            WITH date(w.startedAt) AS day, count(DISTINCT ct) AS value
            ORDER BY day
            RETURN toString(day) AS date, value
            """,
            userId=userId, startDate=start_date.isoformat(), endDate=end_date.isoformat(),
        )

    return [r.data() async for r in result]