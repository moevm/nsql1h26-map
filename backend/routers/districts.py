import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from database import get_session
from utils import make_page

router = APIRouter()


class CreateDistrictRequest(BaseModel):
    name: str
    polygon: list[float]


class UpdateDistrictRequest(BaseModel):
    name: str | None = None
    polygon: list[float] | None = None


@router.get("/")
async def list_districts(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    count_result = await session.run("MATCH (d:District) RETURN count(d) AS total")
    total = (await count_result.single())["total"]

    result = await session.run(
        """
        MATCH (d:District)
        RETURN d.id AS id, d.name AS name, d.polygon AS polygon
        ORDER BY d.name
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{districtId}")
async def get_district(
    districtId: str,
    userId: str | None = Query(None),
    session=Depends(get_session),
):
    result = await session.run(
        "MATCH (d:District {id: $id}) RETURN d.id AS id, d.name AS name, d.polygon AS polygon",
        id=districtId,
    )
    record = await result.single()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="District not found")

    data = record.data()
    data["coveragePercent"] = None

    if userId:
        polygon = data["polygon"]
        if polygon and len(polygon) >= 4:
            lats = polygon[0::2]
            lons = polygon[1::2]
            min_lat, max_lat = min(lats), max(lats)
            min_lon, max_lon = min(lons), max(lons)

            bbox_result = await session.run(
                """
                MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile)
                WITH count(ct) AS userTotal
                MATCH (n:MapNode)
                WHERE n.lat >= $minLat AND n.lat <= $maxLat AND n.lon >= $minLon AND n.lon <= $maxLon
                WITH userTotal, collect(DISTINCT [n.tileX, n.tileY]) AS districtTiles
                MATCH (u:User {id: $userId})-[:COVERED]->(ct:CoveredTile)
                WHERE [ct.tileX, ct.tileY] IN districtTiles
                RETURN size(districtTiles) AS districtTotal, count(ct) AS coveredInDistrict
                """,
                userId=userId, minLat=min_lat, maxLat=max_lat, minLon=min_lon, maxLon=max_lon,
            )
            bbox_record = await bbox_result.single()
            if bbox_record and bbox_record["districtTotal"] > 0:
                data["coveragePercent"] = round(
                    bbox_record["coveredInDistrict"] / bbox_record["districtTotal"] * 100, 1
                )

    return data


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_district(body: CreateDistrictRequest, session=Depends(get_session)):
    district_id = str(uuid.uuid4())
    await session.run(
        "CREATE (:District {id: $id, name: $name, polygon: $polygon})",
        id=district_id, name=body.name, polygon=body.polygon,
    )
    return {"id": district_id, "name": body.name, "polygon": body.polygon}


@router.put("/{districtId}")
async def update_district(districtId: str, body: UpdateDistrictRequest, session=Depends(get_session)):
    result = await session.run("MATCH (d:District {id: $id}) RETURN d", id=districtId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="District not found")

    if body.name is not None:
        await session.run("MATCH (d:District {id: $id}) SET d.name = $v", id=districtId, v=body.name)
    if body.polygon is not None:
        await session.run("MATCH (d:District {id: $id}) SET d.polygon = $v", id=districtId, v=body.polygon)

    result = await session.run(
        "MATCH (d:District {id: $id}) RETURN d.id AS id, d.name AS name, d.polygon AS polygon",
        id=districtId,
    )
    return (await result.single()).data()


@router.delete("/{districtId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_district(districtId: str, session=Depends(get_session)):
    result = await session.run("MATCH (d:District {id: $id}) RETURN d", id=districtId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="District not found")

    await session.run("MATCH (d:District {id: $id}) DETACH DELETE d", id=districtId)
