import csv
import io
import json
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse

from database import get_session
from utils import make_csv_response, lat_lon_to_tile, tiles_on_segment

router = APIRouter()


def _serialize(val):
    """Рекурсивно конвертирует Neo4j-типы (DateTime и др.) в JSON-совместимые."""
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if isinstance(val, dict):
        return {k: _serialize(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_serialize(i) for i in val]
    return val


@router.get("/db/export")
async def db_export(session=Depends(get_session)):
    nodes_result = await session.run(
        "MATCH (n) RETURN labels(n) AS labels, properties(n) AS props"
    )
    rels_result = await session.run(
        """
        MATCH (a)-[r]->(b)
        RETURN labels(a) AS fromLabels, properties(a) AS fromProps,
               type(r) AS relType, properties(r) AS relProps,
               labels(b) AS toLabels, properties(b) AS toProps
        """
    )
    dump = {
        "nodes": [_serialize(n.data()) async for n in nodes_result],
        "relationships": [_serialize(r.data()) async for r in rels_result],
    }
    return JSONResponse(
        content=dump,
        headers={"Content-Disposition": "attachment; filename=dump.json"},
    )


@router.post("/db/import")
async def db_import(file: UploadFile = File(...), session=Depends(get_session)):
    content = await file.read()
    try:
        dump = json.loads(content.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    nodes = dump["nodes"]
    rels = dump["relationships"]

    def nodes_of(lbl: str) -> list:
        return [n["props"] for n in nodes if lbl in n["labels"]]

    def rels_of(rel_type: str) -> list:
        return [r for r in rels if r["relType"] == rel_type]

    # 1. Полная очистка БД
    await session.run("MATCH (n) DETACH DELETE n")

    # 2. Все узлы
    datetime_fields = {
        "User":      ["createdAt", "updatedAt"],
        "Walk":      ["startedAt", "finishedAt", "createdAt", "updatedAt"],
        "Route":     ["createdAt", "updatedAt"],
        "TrackFile": ["uploadedAt"],
    }
    for label in ("User", "Walk", "Route", "TrackFile", "District", "MapNode", "POI"):
        items = nodes_of(lbl=label)
        if not items:
            continue
        fields = datetime_fields.get(label, [])
        set_dates = " ".join(
            f"SET n.{f} = datetime(props.{f})" for f in fields
        )
        await session.run(
            f"UNWIND $items AS props CREATE (n:{label}) SET n = props {set_dates}",
            items=items,
        )

    # 3. (MapNode)-[:CONNECTED_TO]->(MapNode)
    items = rels_of("CONNECTED_TO")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (a:MapNode {osmId: row.fromProps.osmId})
            MATCH (b:MapNode {osmId: row.toProps.osmId})
            CREATE (a)-[:CONNECTED_TO {distanceMeters: row.relProps.distanceMeters}]->(b)
            """,
            rows=items,
        )

    # 4. (MapNode)-[:HAS_POI]->(POI)
    items = rels_of("HAS_POI")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (mn:MapNode {osmId: row.fromProps.osmId})
            MATCH (p:POI {osmId: row.toProps.osmId})
            CREATE (mn)-[:HAS_POI]->(p)
            """,
            rows=items,
        )

    # 5. (User)-[:PERFORMED]->(Walk)
    items = rels_of("PERFORMED")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (u:User {id: row.fromProps.id})
            MATCH (w:Walk {id: row.toProps.id})
            CREATE (u)-[:PERFORMED]->(w)
            """,
            rows=items,
        )

    # 6. (Walk)-[:HAS_POINT]->(WalkPoint) — WalkPoint создаём inline
    items = rels_of("HAS_POINT")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (w:Walk {id: row.fromProps.id})
            CREATE (wp:WalkPoint) SET wp = row.toProps
            SET wp.timestamp = datetime(row.toProps.timestamp)
            CREATE (w)-[:HAS_POINT]->(wp)
            """,
            rows=items,
        )

    # 7. (User)-[:COVERED]->(CoveredTile) — CoveredTile создаём inline
    items = rels_of("COVERED")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (u:User {id: row.fromProps.id})
            CREATE (ct:CoveredTile) SET ct = row.toProps
            SET ct.firstCoveredAt = datetime(row.toProps.firstCoveredAt)
            CREATE (u)-[:COVERED]->(ct)
            """,
            rows=items,
        )

    # 8. (Walk)-[:FIRST_COVERED]->(CoveredTile) — ищем уже созданный CoveredTile
    items = rels_of("FIRST_COVERED")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (w:Walk {id: row.fromProps.id})
            MATCH (u:User)-[:PERFORMED]->(w)
            MATCH (u)-[:COVERED]->(ct:CoveredTile {tileX: row.toProps.tileX, tileY: row.toProps.tileY})
            CREATE (w)-[:FIRST_COVERED]->(ct)
            """,
            rows=items,
        )

    # 9. (User)-[:REQUESTED_ROUTE]->(Route)
    items = rels_of("REQUESTED_ROUTE")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (u:User {id: row.fromProps.id})
            MATCH (r:Route {id: row.toProps.id})
            CREATE (u)-[:REQUESTED_ROUTE]->(r)
            """,
            rows=items,
        )

    # 10. (Route)-[:PASSES_THROUGH]->(MapNode)
    items = rels_of("PASSES_THROUGH")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (r:Route {id: row.fromProps.id})
            MATCH (mn:MapNode {osmId: row.toProps.osmId})
            CREATE (r)-[:PASSES_THROUGH {order: row.relProps.order}]->(mn)
            """,
            rows=items,
        )

    # 11. (TrackFile)-[:CONTAINS]->(Walk)
    items = rels_of("CONTAINS")
    if items:
        await session.run(
            """
            UNWIND $rows AS row
            MATCH (tf:TrackFile {id: row.fromProps.id})
            MATCH (w:Walk {id: row.toProps.id})
            CREATE (tf)-[:CONTAINS]->(w)
            """,
            rows=items,
        )

    return {"nodesRestored": len(nodes), "relationshipsRestored": len(rels)}

@router.post("/import/walks")
async def import_walks(
    userId: str = Query(...),
    walks_file: UploadFile = File(...),
    walkpoints_file: UploadFile = File(...),
    session=Depends(get_session),
):
    try:
        walks_rows = list(csv.DictReader(io.StringIO((await walks_file.read()).decode("utf-8"))))
        walkpoints_rows = list(csv.DictReader(io.StringIO((await walkpoints_file.read()).decode("utf-8"))))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV format")

    user_result = await session.run("MATCH (u:User {id: $userId}) RETURN u", userId=userId)
    if not await user_result.single():
        raise HTTPException(status_code=404, detail="User not found")

    existing_result = await session.run(
        "MATCH (u:User {id: $userId})-[:PERFORMED]->(w:Walk) RETURN w.id AS id",
        userId=userId,
    )
    existing_walk_ids = {r["id"] async for r in existing_result}

    covered_result = await session.run(
        "MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile) RETURN ct.tileX AS tileX, ct.tileY AS tileY",
        userId=userId,
    )
    covered_tiles: set[tuple[int, int]] = {(r["tileX"], r["tileY"]) async for r in covered_result}

    walkpoints_by_walk: dict[str, list] = defaultdict(list)
    for wp in walkpoints_rows:
        walkpoints_by_walk[wp["walkId"]].append(wp)
    for wid in walkpoints_by_walk:
        walkpoints_by_walk[wid].sort(key=lambda x: int(x["order"]))

    walks_rows.sort(key=lambda x: x["startedAt"])

    imported_count = 0
    skipped_count = 0
    new_tiles_total = 0

    for walk_row in walks_rows:
        walk_id = walk_row["id"]

        if walk_id in existing_walk_ids:
            skipped_count += 1
            continue

        wps = walkpoints_by_walk.get(walk_id, [])

        # tile -> timestamp первого касания в рамках этой прогулки
        walk_tile_ts: dict[tuple[int, int], str] = {}
        for i, wp in enumerate(wps):
            lat, lon, ts = float(wp["lat"]), float(wp["lon"]), wp["timestamp"]
            tile = lat_lon_to_tile(lat, lon)
            if tile not in walk_tile_ts:
                walk_tile_ts[tile] = ts
            if i + 1 < len(wps):
                nxt = wps[i + 1]
                for seg_tile in tiles_on_segment(lat, lon, float(nxt["lat"]), float(nxt["lon"])):
                    if seg_tile not in walk_tile_ts:
                        walk_tile_ts[seg_tile] = ts

        new_walk_tiles = {tile: ts for tile, ts in walk_tile_ts.items() if tile not in covered_tiles}

        distance = float(walk_row["distanceMeters"]) if walk_row.get("distanceMeters") else None
        duration = int(walk_row["durationSeconds"]) if walk_row.get("durationSeconds") else None
        import_now = datetime.now(timezone.utc).isoformat()
        created_at = walk_row.get("createdAt") or import_now

        await session.run(
            """
            MATCH (u:User {id: $userId})
            CREATE (w:Walk {
                id: $walkId,
                startedAt: datetime($startedAt),
                finishedAt: datetime($finishedAt),
                distanceMeters: $distanceMeters,
                durationSeconds: $durationSeconds,
                createdAt: datetime($createdAt),
                updatedAt: datetime($updatedAt)
            })
            CREATE (u)-[:PERFORMED]->(w)
            """,
            userId=userId,
            walkId=walk_id,
            startedAt=walk_row["startedAt"],
            finishedAt=walk_row["finishedAt"],
            distanceMeters=distance,
            durationSeconds=duration,
            createdAt=created_at,
            updatedAt=import_now,
        )

        if wps:
            await session.run(
                """
                MATCH (w:Walk {id: $walkId})
                UNWIND $points AS pt
                CREATE (wp:WalkPoint {lat: pt.lat, lon: pt.lon, timestamp: datetime(pt.timestamp), order: pt.order})
                CREATE (w)-[:HAS_POINT]->(wp)
                """,
                walkId=walk_id,
                points=[
                    {"lat": float(wp["lat"]), "lon": float(wp["lon"]),
                     "timestamp": wp["timestamp"], "order": int(wp["order"])}
                    for wp in wps
                ],
            )

        if new_walk_tiles:
            await session.run(
                """
                MATCH (u:User {id: $userId})
                MATCH (w:Walk {id: $walkId})
                UNWIND $tiles AS t
                CREATE (ct:CoveredTile {tileX: t.tileX, tileY: t.tileY, firstCoveredAt: datetime(t.firstCoveredAt)})
                CREATE (u)-[:COVERED]->(ct)
                CREATE (w)-[:FIRST_COVERED]->(ct)
                """,
                userId=userId,
                walkId=walk_id,
                tiles=[
                    {"tileX": tile[0], "tileY": tile[1], "firstCoveredAt": ts}
                    for tile, ts in new_walk_tiles.items()
                ],
            )
            covered_tiles.update(new_walk_tiles.keys())
            new_tiles_total += len(new_walk_tiles)

        existing_walk_ids.add(walk_id)
        imported_count += 1

    return {"imported": imported_count, "skipped": skipped_count, "newTiles": new_tiles_total}


@router.post("/import/tiles")
async def import_tiles(
    userId: str = Query(...),
    tiles_file: UploadFile = File(...),
    session=Depends(get_session),
):
    try:
        rows = list(csv.DictReader(io.StringIO((await tiles_file.read()).decode("utf-8"))))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid CSV format")

    user_result = await session.run("MATCH (u:User {id: $userId}) RETURN u", userId=userId)
    if not await user_result.single():
        raise HTTPException(status_code=404, detail="User not found")

    covered_result = await session.run(
        "MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile) RETURN ct.tileX AS tileX, ct.tileY AS tileY",
        userId=userId,
    )
    existing: set[tuple[int, int]] = {(r["tileX"], r["tileY"]) async for r in covered_result}

    new_tiles = []
    skipped = 0
    for row in rows:
        try:
            tile_x = int(row["tileX"])
            tile_y = int(row["tileY"])
            covered_at = row["firstCoveredAt"]
        except (KeyError, ValueError, TypeError):
            raise HTTPException(status_code=422, detail="CSV must have columns: tileX, tileY, firstCoveredAt")

        key = (tile_x, tile_y)
        if key in existing:
            skipped += 1
            continue
        new_tiles.append({"tileX": tile_x, "tileY": tile_y, "firstCoveredAt": covered_at})
        existing.add(key)

    if new_tiles:
        await session.run(
            """
            MATCH (u:User {id: $userId})
            UNWIND $tiles AS t
            CREATE (ct:CoveredTile {tileX: t.tileX, tileY: t.tileY, firstCoveredAt: datetime(t.firstCoveredAt)})
            CREATE (u)-[:COVERED]->(ct)
            """,
            userId=userId,
            tiles=new_tiles,
        )

    return {"imported": len(new_tiles), "skipped": skipped}


@router.get("/export/walks")
async def export_walks(
    userId: str = Query(...),
    walkIds: str | None = Query(None),
    session=Depends(get_session),
):
    ids = walkIds.split(",") if walkIds else None
    where = "WHERE w.id IN $walkIds" if ids else ""
    result = await session.run(
        f"""
        MATCH (u:User {{id: $userId}})-[:PERFORMED]->(w:Walk)
        {where}
        RETURN w.id AS id, toString(w.startedAt) AS startedAt, toString(w.finishedAt) AS finishedAt,
               w.distanceMeters AS distanceMeters, w.durationSeconds AS durationSeconds,
               toString(w.createdAt) AS createdAt, toString(w.updatedAt) AS updatedAt
        ORDER BY w.startedAt
        """,
        userId=userId,
        walkIds=ids,
    )
    rows = [
        [r["id"], r["startedAt"], r["finishedAt"], r["distanceMeters"], r["durationSeconds"],
         r["createdAt"], r["updatedAt"]]
        async for r in result
    ]
    return make_csv_response(
        rows,
        ["id", "startedAt", "finishedAt", "distanceMeters", "durationSeconds", "createdAt", "updatedAt"],
        "walks.csv",
    )


@router.get("/export/walkpoints")
async def export_walkpoints(
    userId: str = Query(...),
    walkIds: str | None = Query(None),
    session=Depends(get_session),
):
    ids = walkIds.split(",") if walkIds else None
    where = "WHERE w.id IN $walkIds" if ids else ""
    result = await session.run(
        f"""
        MATCH (u:User {{id: $userId}})-[:PERFORMED]->(w:Walk)-[:HAS_POINT]->(wp:WalkPoint)
        {where}
        RETURN w.id AS walkId, wp.lat AS lat, wp.lon AS lon,
               toString(wp.timestamp) AS timestamp, wp.order AS order
        ORDER BY w.id, wp.order
        """,
        userId=userId,
        walkIds=ids,
    )
    rows = [[r["walkId"], r["lat"], r["lon"], r["timestamp"], r["order"]] async for r in result]
    return make_csv_response(rows, ["walkId", "lat", "lon", "timestamp", "order"], "walkpoints.csv")


@router.get("/export/tiles")
async def export_tiles(
    userId: str = Query(...),
    session=Depends(get_session),
):
    result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile)
        RETURN ct.tileX AS tileX, ct.tileY AS tileY, toString(ct.firstCoveredAt) AS firstCoveredAt
        ORDER BY ct.firstCoveredAt
        """,
        userId=userId,
    )
    rows = [[r["tileX"], r["tileY"], r["firstCoveredAt"]] async for r in result]
    return make_csv_response(rows, ["tileX", "tileY", "firstCoveredAt"], "tiles.csv")
