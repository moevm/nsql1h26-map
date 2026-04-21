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


