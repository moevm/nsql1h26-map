import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import get_session
from utils import haversine, lat_lon_to_tile

router = APIRouter()


class WalkPoint(BaseModel):
    lat: float
    lon: float
    timestamp: datetime


class CreateWalkRequest(BaseModel):
    userId: str
    points: list[WalkPoint]

