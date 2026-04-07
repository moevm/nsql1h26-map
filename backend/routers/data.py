import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException

from database import get_session

router = APIRouter()


@router.get("/export")
async def export_all(session=Depends(get_session)):
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


@router.post("/import")
async def import_dump(
    file: UploadFile = File(...),
    session=Depends(get_session),
):
    content = await file.read()
    try:
        dump = json.loads(content.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Incorrect json file")

    # Очистка БД
    await session.run("match (n) detach delete n")

    # Восстановление узлов
    label_map = {
        "User": "create (n:User) set n = row.props",
        "Walk": "create (n:Walk) set n = row.props",
    }

    for label, script in label_map.items():
        nodes_for_label = [n for n in dump["nodes"] if label in n["labels"]]
        if not nodes_for_label:
            continue
        await session.run(
            f"unwind $rows as row {script}",
            rows=nodes_for_label,
        )

    # Восстановление рёбер
    rel_map = {
        "PERFORMED": "CREATE (a)-[:PERFORMED]->(b)",
    }

    for rel_type, script in rel_map.items():
        rels_for_type = [r for r in dump["relationships"] if r["relType"] == rel_type]
        if not rels_for_type:
            continue
        await session.run(
            f"""
            unwind $rows as row
            match (a {{id: row.fromProps.id}})
            match (b {{id: row.toProps.id}})
            {script}
            """,
            rows=rels_for_type,
        )

    return {
        "nodesRestored": len(dump["nodes"]),
        "relationshipsRestored": len(dump["relationships"]),
    }
