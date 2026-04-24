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
        raise HTTPException(status_code=400, detail="Incorrect json file")

    await session.run("match (n) detach delete n")

    label_map = {
        "User": "create (n:User) set n = row.props",
        "Walk": "create (n:Walk) set n = row.props",
    }
    for label, script in label_map.items():
        nodes_for_label = [n for n in dump["nodes"] if label in n["labels"]]
        if nodes_for_label:
            await session.run(f"unwind $rows as row {script}", rows=nodes_for_label)

    rel_map = {"PERFORMED": "CREATE (a)-[:PERFORMED]->(b)"}
    for rel_type, script in rel_map.items():
        rels_for_type = [r for r in dump["relationships"] if r["relType"] == rel_type]
        if rels_for_type:
            await session.run(
                f"unwind $rows as row match (a {{id: row.fromProps.id}}) match (b {{id: row.toProps.id}}) {script}",
                rows=rels_for_type,
            )

    return {"nodesRestored": len(dump["nodes"]), "relationshipsRestored": len(dump["relationships"])}

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
