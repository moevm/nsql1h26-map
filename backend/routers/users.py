import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import make_page

router = APIRouter()


class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str


class UpdateUserRequest(BaseModel):
    username: str | None = None
    avatarUrl: str | None = None


@router.get("/")
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    count_result = await session.run("MATCH (u:User) RETURN count(u) AS total")
    total = (await count_result.single())["total"]

    result = await session.run(
        """
        MATCH (u:User)
        RETURN u.id AS id, u.username AS username, u.email AS email, u.avatarUrl AS avatarUrl
        ORDER BY u.username
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{userId}")
async def get_user(userId: str, session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (u:User {id: $id})
        OPTIONAL MATCH (u)-[:PERFORMED]->(w:Walk)
        OPTIONAL MATCH (u)-[:COVERED]->(ct:CoveredTile)
        OPTIONAL MATCH (u)-[:REQUESTED_ROUTE]->(r:Route)
        RETURN u.id AS id, u.username AS username, u.email AS email, u.avatarUrl AS avatarUrl,
               count(DISTINCT w) AS walksCount,
               count(DISTINCT ct) AS tilesCount,
               count(DISTINCT r) AS routesCount
        """,
        id=userId,
    )
    record = await result.single()
    if not record or record["id"] is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return record.data()


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(body: CreateUserRequest, session=Depends(get_session)):
    exists = await session.run(
        "MATCH (u:User {email: $email}) RETURN u", email=body.email
    )
    if await exists.single():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user_id = str(uuid.uuid4())
    token = uuid.uuid4().hex + uuid.uuid4().hex
    await session.run(
        """
        CREATE (u:User {
            id: $id, username: $username, email: $email,
            password: $password, token: $token, avatarUrl: ''
        })
        """,
        id=user_id, username=body.username, email=body.email,
        password=body.password, token=token,
    )
    return {"id": user_id, "username": body.username, "email": body.email}


@router.put("/{userId}")
async def update_user(userId: str, body: UpdateUserRequest, session=Depends(get_session)):
    result = await session.run("MATCH (u:User {id: $id}) RETURN u", id=userId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if body.username is not None:
        await session.run(
            "MATCH (u:User {id: $id}) SET u.username = $username", id=userId, username=body.username
        )
    if body.avatarUrl is not None:
        await session.run(
            "MATCH (u:User {id: $id}) SET u.avatarUrl = $avatarUrl", id=userId, avatarUrl=body.avatarUrl
        )

    result = await session.run(
        "MATCH (u:User {id: $id}) RETURN u.id AS id, u.username AS username, u.email AS email, u.avatarUrl AS avatarUrl",
        id=userId,
    )
    return (await result.single()).data()


@router.delete("/{userId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(userId: str, session=Depends(get_session)):
    result = await session.run("MATCH (u:User {id: $id}) RETURN u", id=userId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await session.run(
        """
        MATCH (u:User {id: $id})
        OPTIONAL MATCH (u)-[:PERFORMED]->(w:Walk)
        OPTIONAL MATCH (w)-[:HAS_POINT]->(wp:WalkPoint)
        OPTIONAL MATCH (w)-[:FIRST_COVERED]->(ct:CoveredTile)
        OPTIONAL MATCH (u)-[:REQUESTED_ROUTE]->(r:Route)
        DETACH DELETE u, w, wp, ct, r
        """,
        id=userId,
    )
