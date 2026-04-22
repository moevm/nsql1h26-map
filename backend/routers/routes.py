from fastapi import APIRouter, status
from pydantic import BaseModel

router = APIRouter()


class RouteRequest(BaseModel):
    userId: str
    startLat: float
    startLon: float
    endLat: float
    endLon: float
    searchRadius: float = 1500.0
    targetDistance: float = 3000.0


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_route(body: RouteRequest):
    return {"detail": "not implemented"}