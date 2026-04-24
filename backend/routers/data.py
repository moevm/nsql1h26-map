import json

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File

from database import get_session
from utils import make_csv_response

router = APIRouter()


@router.get("/db/export")
async def db_export(session=Depends(get_session)):
    nodes = await session.run(
        "match (n) return labels(n) as labels, properties(n) as props"
    )
    rels = await session.run(
        "match (n1)-[r]->(n2) return labels(n1) as fromLabels, properties(n1) as fromProps, type(r) as relType, properties(r) as relProps, labels(n2) as toLabels, properties(n2) as toProps"
    )
    return {
        "nodes": [n.data() async for n in nodes],
        "relationships": [r.data() async for r in rels],
    }


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
