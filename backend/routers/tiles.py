from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import make_page

router = APIRouter()


class CreateTileRequest(BaseModel):
    userId: str
    tileX: int
    tileY: int


@router.get("/")
async def list_tiles(
    userId: str = Query(...),
    tileXMin: int | None = Query(None),
    tileXMax: int | None = Query(None),
    tileYMin: int | None = Query(None),
    tileYMax: int | None = Query(None),
    coveredFrom: str | None = Query(None),
    coveredTo: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    where = """
        WHERE ($tileXMin    IS NULL OR ct.tileX >= $tileXMin)
          AND ($tileXMax    IS NULL OR ct.tileX <= $tileXMax)
          AND ($tileYMin    IS NULL OR ct.tileY >= $tileYMin)
          AND ($tileYMax    IS NULL OR ct.tileY <= $tileYMax)
          AND ($coveredFrom IS NULL OR ct.firstCoveredAt >= datetime($coveredFrom))
          AND ($coveredTo   IS NULL OR ct.firstCoveredAt <= datetime($coveredTo))
    """
    params = dict(
        userId=userId,
        tileXMin=tileXMin, tileXMax=tileXMax,
        tileYMin=tileYMin, tileYMax=tileYMax,
        coveredFrom=coveredFrom, coveredTo=coveredTo,
    )

    count_result = await session.run(
        f"MATCH (u:User {{id: $userId}})-[:COVERED]->(ct:CoveredTile) {where} RETURN count(ct) AS total",
        **params,
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        MATCH (u:User {{id: $userId}})-[:COVERED]->(ct:CoveredTile) {where}
        RETURN ct.tileX AS tileX, ct.tileY AS tileY, toString(ct.firstCoveredAt) AS firstCoveredAt
        ORDER BY ct.firstCoveredAt
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{userId}")
async def get_user_tiles(userId: str, session=Depends(get_session)):
    user_result = await session.run("MATCH (u:User {id: $id}) RETURN u", id=userId)
    if not await user_result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile)
        RETURN ct.tileX AS tileX, ct.tileY AS tileY, toString(ct.firstCoveredAt) AS firstCoveredAt
        ORDER BY ct.firstCoveredAt
        """,
        userId=userId,
    )
    return [r.data() async for r in result]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_tile(body: CreateTileRequest, session=Depends(get_session)):
    user_result = await session.run("MATCH (u:User {id: $id}) RETURN u", id=body.userId)
    if not await user_result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await session.run(
        """
        MATCH (u:User {id: $userId})
        MERGE (u)-[:COVERED]->(ct:CoveredTile {tileX: $tileX, tileY: $tileY})
        ON CREATE SET ct.firstCoveredAt = datetime($now)
        """,
        userId=body.userId,
        tileX=body.tileX,
        tileY=body.tileY,
        now=datetime.now(timezone.utc).isoformat(),
    )
    return {"userId": body.userId, "tileX": body.tileX, "tileY": body.tileY}


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tile(
    userId: str = Query(...),
    tileX: int = Query(...),
    tileY: int = Query(...),
    session=Depends(get_session),
):
    result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile {tileX: $tileX, tileY: $tileY})
        RETURN ct
        """,
        userId=userId, tileX=tileX, tileY=tileY,
    )
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tile not found")

    await session.run(
        """
        MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile {tileX: $tileX, tileY: $tileY})
        DETACH DELETE ct
        """,
        userId=userId, tileX=tileX, tileY=tileY,
    )
