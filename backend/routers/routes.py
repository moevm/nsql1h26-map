import heapq
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from database import get_session

router = APIRouter()


class RouteRequest(BaseModel):
    userId: str
    startLat: float
    startLon: float
    endLat: float
    endLon: float
    searchRadius: float = 1500.0
    targetDistance: float = 3000.0


async def _load_subgraph(session, start_lat: float, start_lon: float, search_radius: float):
    result = await session.run(
        """
        MATCH (a:MapNode)
        WHERE point.distance(
          point({latitude: a.lat, longitude: a.lon}),
          point({latitude: $startLat, longitude: $startLon})
        ) <= $searchRadius
        WITH collect(a) AS candidates
        UNWIND candidates AS a
        MATCH (a)-[e:CONNECTED_TO]->(b)
        WHERE b IN candidates
        RETURN a.osmId AS aOsmId, a.lat AS aLat, a.lon AS aLon,
               a.tileX AS aTileX, a.tileY AS aTileY,
               b.osmId AS bOsmId, b.lat AS bLat, b.lon AS bLon,
               b.tileX AS bTileX, b.tileY AS bTileY,
               e.distanceMeters AS dist
        """,
        startLat=start_lat, startLon=start_lon, searchRadius=search_radius,
    )

    nodes = {}
    graph = defaultdict(list)

    async for row in result:
        d = row.data()
        nodes[d["aOsmId"]] = {"lat": d["aLat"], "lon": d["aLon"], "tileX": d["aTileX"], "tileY": d["aTileY"]}
        nodes[d["bOsmId"]] = {"lat": d["bLat"], "lon": d["bLon"], "tileX": d["bTileX"], "tileY": d["bTileY"]}
        graph[d["aOsmId"]].append((d["bOsmId"], d["dist"]))
        graph[d["bOsmId"]].append((d["aOsmId"], d["dist"]))

    return nodes, graph


async def _load_covered_tiles(session, user_id: str) -> set:
    result = await session.run(
        """
        MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile)
        RETURN ct.tileX AS tileX, ct.tileY AS tileY
        """,
        userId=user_id,
    )
    return {(r["tileX"], r["tileY"]) async for r in result}

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_route(body: RouteRequest):
    return {"detail": "not implemented"}