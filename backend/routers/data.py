import json

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse

from database import get_session
from utils import make_csv_response

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
        "Walk":      ["startedAt", "finishedAt"],
        "Route":     ["createdAt"],
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
               w.distanceMeters AS distanceMeters, w.durationSeconds AS durationSeconds
        ORDER BY w.startedAt
        """,
        userId=userId,
        walkIds=ids,
    )
    rows = [[r["id"], r["startedAt"], r["finishedAt"], r["distanceMeters"], r["durationSeconds"]]
            async for r in result]
    return make_csv_response(rows, ["id", "startedAt", "finishedAt", "distanceMeters", "durationSeconds"], "walks.csv")


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
