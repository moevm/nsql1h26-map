import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import get_session

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    avatarUrl: str


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, session=Depends(get_session)):
    result = await session.run(
        "MATCH (u:User {email: $email}) RETURN u",
        email=body.email,
    )
    record = await result.single()
    if not record or record["u"]["password"] != body.password:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = secrets.token_hex(32)
    await session.run(
        "MATCH (u:User {email: $email}) SET u.token = $token",
        email=body.email,
        token=token,
    )
    u = record["u"]
    return AuthResponse(
        token=token,
        user=UserResponse(
            id=u["id"],
            username=u["username"],
            email=u["email"],
            avatarUrl=u.get("avatarUrl", ""),
        ),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session=Depends(get_session)):
    existing = await session.run(
        "MATCH (u:User) WHERE u.email = $email OR u.username = $username RETURN u",
        email=body.email,
        username=body.username,
    )
    if await existing.single():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    user_id = str(uuid.uuid4())
    token = secrets.token_hex(32)
    await session.run(
        """
        CREATE (u:User {
            id: $id, username: $username, email: $email,
            password: $password, token: $token, avatarUrl: ''
        })
        """,
        id=user_id,
        username=body.username,
        email=body.email,
        password=body.password,
        token=token,
    )
    return AuthResponse(
        token=token,
        user=UserResponse(id=user_id, username=body.username, email=body.email, avatarUrl=""),
    )
