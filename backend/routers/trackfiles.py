import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import make_page

router = APIRouter()


class CreateTrackFileRequest(BaseModel):
    format: str
    source: str


class UpdateTrackFileRequest(BaseModel):
    format: str | None = None
    source: str | None = None


@router.get("/")
async def list_trackfiles(
    format: str | None = Query(None),
    source: str | None = Query(None),
    uploadedFrom: str | None = Query(None),
    uploadedTo: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    where = """
        WHERE ($format       IS NULL OR toLower(tf.format) CONTAINS toLower($format))
          AND ($source       IS NULL OR toLower(tf.source) CONTAINS toLower($source))
          AND ($uploadedFrom IS NULL OR tf.uploadedAt >= datetime($uploadedFrom))
          AND ($uploadedTo   IS NULL OR tf.uploadedAt <= datetime($uploadedTo))
    """
    params = dict(format=format, source=source,
                  uploadedFrom=uploadedFrom, uploadedTo=uploadedTo)

    count_result = await session.run(
        f"MATCH (tf:TrackFile) {where} RETURN count(tf) AS total", **params
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        MATCH (tf:TrackFile) {where}
        RETURN tf.id AS id, tf.format AS format, tf.source AS source,
               toString(tf.uploadedAt) AS uploadedAt
        ORDER BY tf.uploadedAt DESC
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{trackFileId}")
async def get_trackfile(trackFileId: str, session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (tf:TrackFile {id: $id})
        RETURN tf.id AS id, tf.format AS format, tf.source AS source,
               toString(tf.uploadedAt) AS uploadedAt
        """,
        id=trackFileId,
    )
    record = await result.single()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TrackFile not found")

    walks_result = await session.run(
        """
        MATCH (tf:TrackFile {id: $id})-[:CONTAINS]->(w:Walk)
        RETURN w.id AS id, toString(w.startedAt) AS startedAt, toString(w.finishedAt) AS finishedAt,
               w.distanceMeters AS distanceMeters
        """,
        id=trackFileId,
    )
    walks = [r.data() async for r in walks_result]

    return {**record.data(), "walks": walks}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_trackfile(body: CreateTrackFileRequest, session=Depends(get_session)):
    file_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await session.run(
        "CREATE (:TrackFile {id: $id, format: $format, source: $source, uploadedAt: datetime($now)})",
        id=file_id, format=body.format, source=body.source, now=now,
    )
    return {"id": file_id, "format": body.format, "source": body.source}


@router.put("/{trackFileId}")
async def update_trackfile(trackFileId: str, body: UpdateTrackFileRequest, session=Depends(get_session)):
    result = await session.run("MATCH (tf:TrackFile {id: $id}) RETURN tf", id=trackFileId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TrackFile not found")

    if body.format is not None:
        await session.run("MATCH (tf:TrackFile {id: $id}) SET tf.format = $v", id=trackFileId, v=body.format)
    if body.source is not None:
        await session.run("MATCH (tf:TrackFile {id: $id}) SET tf.source = $v", id=trackFileId, v=body.source)

    result = await session.run(
        "MATCH (tf:TrackFile {id: $id}) RETURN tf.id AS id, tf.format AS format, tf.source AS source, toString(tf.uploadedAt) AS uploadedAt",
        id=trackFileId,
    )
    return (await result.single()).data()


@router.delete("/{trackFileId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trackfile(trackFileId: str, session=Depends(get_session)):
    result = await session.run("MATCH (tf:TrackFile {id: $id}) RETURN tf", id=trackFileId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="TrackFile not found")

    await session.run("MATCH (tf:TrackFile {id: $id}) DETACH DELETE tf", id=trackFileId)
