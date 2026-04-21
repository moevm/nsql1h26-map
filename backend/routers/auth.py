from fastapi import APIRouter
from pydantic import BaseModel

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

