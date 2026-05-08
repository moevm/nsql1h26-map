import heapq
import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from database import get_session
from utils import make_page, tiles_on_segment

router = APIRouter()

DEFAULT_PRIORITY = 0.5
DEFAULT_TARGET_DISTANCE = 3000.0


class RouteRequest(BaseModel):
    userId: str
    startLat: float
    startLon: float
    targetDistance: float = DEFAULT_TARGET_DISTANCE
    priority: float = Field(DEFAULT_PRIORITY, ge=0.0, le=1.0)


class UpdateRouteRequest(BaseModel):
    priority: float | None = Field(None, ge=0.0, le=1.0)
    targetDistance: float | None = None


class LineRouteRequest(BaseModel):
    userId: str
    startLat: float
    startLon: float
    endLat: float
    endLon: float
    targetDistance: float = DEFAULT_TARGET_DISTANCE
    targetDuration: int | None = None
    priority: float = Field(DEFAULT_PRIORITY, ge=0.0, le=1.0)

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


async def _load_pois_per_node(session, node_ids: list) -> dict:
    """Возвращает map osmId -> список POI, привязанных к этому MapNode через HAS_POI."""
    if not node_ids:
        return {}
    result = await session.run(
        """
        UNWIND $nodeIds AS nid
        MATCH (n:MapNode {osmId: nid})-[:HAS_POI]->(p:POI)
        RETURN n.osmId AS nodeOsmId, p.osmId AS osmId, p.name AS name,
               p.category AS category, p.lat AS lat, p.lon AS lon
        """,
        nodeIds=node_ids,
    )
    pois_per_node = defaultdict(list)
    async for row in result:
        d = row.data()
        pois_per_node[d["nodeOsmId"]].append({
            "osmId": d["osmId"], "name": d["name"], "category": d["category"],
            "lat": d["lat"], "lon": d["lon"],
        })
    return pois_per_node

def _find_nearest_node(nodes: dict, lat: float, lon: float) -> int | None:
    """Найти osmId ближайшего узла к заданным координатам."""
    best_id = None
    best_dist = float("inf")
    for osm_id, n in nodes.items():
        d = (n["lat"] - lat) ** 2 + (n["lon"] - lon) ** 2
        if d < best_dist:
            best_dist = d
            best_id = osm_id
    return best_id

def _edge_tiles(
    nodes: dict, a: int, b: int, cache: dict,
) -> set:
    """Тайлы, через которые проходит отрезок между MapNode a и b. Кешируется."""
    key = (min(a, b), max(a, b))
    cached = cache.get(key)
    if cached is not None:
        return cached
    na, nb = nodes[a], nodes[b]
    tiles = tiles_on_segment(na["lat"], na["lon"], nb["lat"], nb["lon"])
    cache[key] = tiles
    return tiles


def _greedy_walk(
    nodes: dict,
    graph: dict,
    covered: set,
    pois_per_node: dict,
    start: int,
    target_distance: float,
    priority: float,
    penalised_edges: set | None = None,
) -> tuple[list[int], float, dict]:
    """
    Жадный обход кольцевого маршрута. Скоринг соседа — взвешенная комбинация
    «новизны тайлов вдоль ребра» и «насыщенности POI», вес задаёт priority ∈ [0, 1].

    priority=0 → строго максимизируем непокрытые тайлы.
    priority=1 → строго ведём маршрут через узлы с POI.
    penalised_edges: рёбра, по которым следует избегать ходить (используется
    при построении альтернативного маршрута).

    Возвращает (path, total_dist, edge_tiles_cache) — кеш тайлов по ребру
    переиспользуется на этапе сборки итогового набора newTiles.
    """
    budget = target_distance * 0.5  # кольцо: оставляем половину на возврат через Dijkstra
    penalised = penalised_edges or set()
    path = [start]
    visited_edges = set()
    total_dist = 0.0
    seen_tiles = set(covered)
    edge_tiles_cache: dict = {}
    current = start

    while total_dist < budget:
        neighbors = graph.get(current, [])
        if not neighbors:
            break

        scored = []
        for neighbor_id, dist in neighbors:
            edge_key = (min(current, neighbor_id), max(current, neighbor_id))
            edge_tiles = _edge_tiles(nodes, current, neighbor_id, edge_tiles_cache)
            new_along_edge = edge_tiles - seen_tiles

            # Доля новых тайлов по ребру: длинное ребро через незнакомую зону
            # выигрывает у короткого внутри одного тайла, но скоринг остаётся в [0,1].
            tile_score = len(new_along_edge) / len(edge_tiles) if edge_tiles else 0.0
            poi_count = len(pois_per_node.get(neighbor_id, []))
            poi_score = min(poi_count, 3) / 3.0
            combined = (1.0 - priority) * tile_score + priority * poi_score

            penalty = 1.0 if edge_key in penalised else 0.0
            walked = 1.0 if edge_key in visited_edges else 0.0

            score = (penalty, walked, -combined, dist)
            scored.append((score, neighbor_id, dist, edge_tiles, edge_key))

        scored.sort(key=lambda x: x[0])
        _, next_node, dist, edge_tiles, edge_key = scored[0]

        if total_dist + dist > target_distance * 1.2:
            break

        path.append(next_node)
        total_dist += dist
        visited_edges.add(edge_key)
        seen_tiles.update(edge_tiles)
        current = next_node

    return path, total_dist, edge_tiles_cache


def _dijkstra(graph: dict, start: int, end: int) -> tuple[list[int], float]:
    """Кратчайший путь между двумя узлами (для возврата к старту/финишу)."""
    dist_to = {start: 0.0}
    prev = {}
    heap = [(0.0, start)]

    while heap:
        d, u = heapq.heappop(heap)
        if u == end:
            break
        if d > dist_to.get(u, float("inf")):
            continue
        for neighbor, weight in graph.get(u, []):
            nd = d + weight
            if nd < dist_to.get(neighbor, float("inf")):
                dist_to[neighbor] = nd
                prev[neighbor] = u
                heapq.heappush(heap, (nd, neighbor))

    if end not in prev and start != end:
        return [], 0.0

    path = []
    node = end
    while node != start:
        path.append(node)
        node = prev[node]
    path.append(start)
    path.reverse()

    return path, dist_to.get(end, 0.0)

async def _build_and_save_route(
    session,
    user_id: str,
    start_lat: float,
    start_lon: float,
    target_distance: float,
    priority: float,
    penalised_edges: set | None = None,
) -> dict:
    """Полный цикл построения и сохранения кольцевого маршрута. Используется
    как обычным `POST /`, так и `POST /{routeId}/alternative`.
    """
    search_radius = max(target_distance * 0.7, 1500.0)

    nodes, graph = await _load_subgraph(session, start_lat, start_lon, search_radius)
    if not nodes:
        raise HTTPException(status_code=404, detail="No MapNodes found in search radius")

    covered = await _load_covered_tiles(session, user_id)
    start_node = _find_nearest_node(nodes, start_lat, start_lon)
    if start_node is None:
        raise HTTPException(status_code=404, detail="Cannot snap start to graph")

    pois_per_node = await _load_pois_per_node(session, list(nodes.keys()))

    path, path_distance, edge_tiles_cache = _greedy_walk(
        nodes, graph, covered, pois_per_node,
        start_node, target_distance, priority,
        penalised_edges=penalised_edges,
    )

    # Замыкаем кольцо: всегда возвращаемся к старту через Dijkstra.
    if path[-1] != start_node:
        return_path, return_dist = _dijkstra(graph, path[-1], start_node)
        if return_path:
            path.extend(return_path[1:])
            path_distance += return_dist

    # POI вдоль маршрута через PASSES_THROUGH-узлы (dedup по osmId).
    seen_poi_ids = set()
    highlights = []
    for osm_id in path:
        for poi in pois_per_node.get(osm_id, []):
            if poi["osmId"] in seen_poi_ids:
                continue
            seen_poi_ids.add(poi["osmId"])
            highlights.append(poi)

    # Тайлы маршрута: объединение тайлов вдоль каждого ребра пути (с растеризацией),
    # чтобы покрыть «пустоту» между удалёнными MapNode'ами.
    route_tiles: set = set()
    for prev_id, next_id in zip(path, path[1:]):
        route_tiles |= _edge_tiles(nodes, prev_id, next_id, edge_tiles_cache)
    # Узлы с одним элементом / стартовый тайл, если путь оказался пустым.
    for osm_id in path:
        route_tiles.add((nodes[osm_id]["tileX"], nodes[osm_id]["tileY"]))

    new_tiles_set = route_tiles - covered
    new_tiles = sorted(new_tiles_set)

    route_id = str(uuid.uuid4())
    estimated_minutes = int(path_distance / 80)  # ~80 м/мин пешком

    await session.run(
        """
        MATCH (u:User {id: $userId})
        CREATE (r:Route {
            id: $routeId,
            createdAt: datetime(),
            totalDistanceMeters: $distance,
            estimatedMinutes: $minutes,
            priority: $priority,
            targetDistance: $targetDistance,
            newTilesX: $newTilesX,
            newTilesY: $newTilesY,
            allTilesCount: $allTilesCount
        })
        CREATE (u)-[:REQUESTED_ROUTE]->(r)
        WITH r
        UNWIND $nodeIds AS nd
        MATCH (mn:MapNode {osmId: nd.osmId})
        CREATE (r)-[:PASSES_THROUGH {order: nd.order}]->(mn)
        """,
        userId=user_id,
        routeId=route_id,
        distance=round(path_distance, 1),
        minutes=estimated_minutes,
        priority=priority,
        targetDistance=target_distance,
        newTilesX=[t[0] for t in new_tiles],
        newTilesY=[t[1] for t in new_tiles],
        allTilesCount=len(route_tiles),
        nodeIds=[{"osmId": osm_id, "order": i} for i, osm_id in enumerate(path)],
    )

    if highlights:
        await session.run(
            """
            MATCH (r:Route {id: $routeId})
            UNWIND $poiIds AS pid
            MATCH (p:POI {osmId: pid})
            CREATE (r)-[:HIGHLIGHTS]->(p)
            """,
            routeId=route_id,
            poiIds=[h["osmId"] for h in highlights],
        )

    return {
        "routeId": route_id,
        "totalDistanceMeters": round(path_distance, 1),
        "estimatedMinutes": estimated_minutes,
        "priority": priority,
        "targetDistance": target_distance,
        "newTiles": [{"tileX": x, "tileY": y} for x, y in new_tiles],
        "allTilesCount": len(route_tiles),
        "highlights": highlights,
        "nodes": [
            {"osmId": osm_id, "lat": nodes[osm_id]["lat"], "lon": nodes[osm_id]["lon"], "order": i}
            for i, osm_id in enumerate(path)
        ],
    }


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_route(body: RouteRequest, session=Depends(get_session)):
    return await _build_and_save_route(
        session,
        user_id=body.userId,
        start_lat=body.startLat,
        start_lon=body.startLon,
        target_distance=body.targetDistance,
        priority=body.priority,
    )

@router.post("/line", status_code=status.HTTP_201_CREATED)
async def create_line_route(body: LineRouteRequest, session=Depends(get_session)):
    from utils import haversine
    
    direct_distance = haversine(body.startLat, body.startLon, body.endLat, body.endLon)

    search_radius = max(direct_distance * 0.6 + 500, 1500.0)

    mid_lat = (body.startLat + body.endLat) / 2
    mid_lon = (body.startLon + body.endLon) / 2

    nodes, graph = await _load_subgraph(session, mid_lat, mid_lon, search_radius)
    if not nodes:
        raise HTTPException(status_code=404, detail="No MapNodes found in search radius")

    start_node = _find_nearest_node(nodes, body.startLat, body.startLon)
    end_node = _find_nearest_node(nodes, body.endLat, body.endLon)

    if start_node is None or end_node is None:
        raise HTTPException(status_code=404, detail="Cannot snap start/end to graph")

    path, path_distance = _dijkstra(graph, start_node, end_node)
    if not path:
        raise HTTPException(status_code=404, detail="No path found between start and end points")

    covered = await _load_covered_tiles(session, body.userId)
    pois_per_node = await _load_pois_per_node(session, list(nodes.keys()))

    edge_tiles_cache: dict = {}
    route_tiles: set = set()
    for prev_id, next_id in zip(path, path[1:]):
        route_tiles |= _edge_tiles(nodes, prev_id, next_id, edge_tiles_cache)
    for osm_id in path:
        route_tiles.add((nodes[osm_id]["tileX"], nodes[osm_id]["tileY"]))

    new_tiles_set = route_tiles - covered
    new_tiles = sorted(new_tiles_set)

    seen_poi_ids = set()
    highlights = []
    for osm_id in path:
        for poi in pois_per_node.get(osm_id, []):
            if poi["osmId"] in seen_poi_ids:
                continue
            seen_poi_ids.add(poi["osmId"])
            highlights.append(poi)

    route_id = str(uuid.uuid4())
    estimated_minutes = body.targetDuration if body.targetDuration is not None else int(path_distance / 80)

    await session.run(
        """
        MATCH (u:User {id: $userId})
        CREATE (r:Route {
            id: $routeId,
            createdAt: datetime() + duration({hours: 3}),
            totalDistanceMeters: $distance,
            estimatedMinutes: $minutes,
            priority: $priority,
            targetDistance: $targetDistance,
            newTilesX: $newTilesX,
            newTilesY: $newTilesY,
            allTilesCount: $allTilesCount,
            routeType: 'line',
            endLat: $endLat,
            endLon: $endLon
        })
        CREATE (u)-[:REQUESTED_ROUTE]->(r)
        WITH r
        UNWIND $nodeIds AS nd
        MATCH (mn:MapNode {osmId: nd.osmId})
        CREATE (r)-[:PASSES_THROUGH {order: nd.order}]->(mn)
        """,
        userId=body.userId,
        routeId=route_id,
        distance=round(path_distance, 1),
        minutes=estimated_minutes,
        priority=body.priority,
        targetDistance=body.targetDistance,
        newTilesX=[t[0] for t in new_tiles],
        newTilesY=[t[1] for t in new_tiles],
        allTilesCount=len(route_tiles),
        nodeIds=[{"osmId": osm_id, "order": i} for i, osm_id in enumerate(path)],
        endLat=body.endLat,
        endLon=body.endLon,
    )

    if highlights:
        await session.run(
            """
            MATCH (r:Route {id: $routeId})
            UNWIND $poiIds AS pid
            MATCH (p:POI {osmId: pid})
            CREATE (r)-[:HIGHLIGHTS]->(p)
            """,
            routeId=route_id,
            poiIds=[h["osmId"] for h in highlights],
        )

    return {
        "routeId": route_id,
        "totalDistanceMeters": round(path_distance, 1),
        "estimatedMinutes": estimated_minutes,
        "targetDistance": body.targetDistance,
        "targetDuration": body.targetDuration,
        "routeType": "line",
        "newTiles": [{"tileX": x, "tileY": y} for x, y in new_tiles],
        "allTilesCount": len(route_tiles),
        "highlights": highlights,
        "priority": body.priority,
        "nodes": [
            {"osmId": osm_id, "lat": nodes[osm_id]["lat"], "lon": nodes[osm_id]["lon"], "order": i}
            for i, osm_id in enumerate(path)
        ],
    }

@router.post("/{routeId}/alternative", status_code=status.HTTP_201_CREATED)
async def create_alternative_route(routeId: str, session=Depends(get_session)):
    """Строит альтернативный маршрут с теми же параметрами, что и исходный,
    штрафуя в жадном скоринге его рёбра."""
    meta_result = await session.run(
        """
        MATCH (u:User)-[:REQUESTED_ROUTE]->(r:Route {id: $id})
        RETURN u.id AS userId,
               r.priority AS priority,
               r.targetDistance AS targetDistance
        """,
        id=routeId,
    )
    meta = await meta_result.single()
    if not meta:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    path_result = await session.run(
        """
        MATCH (r:Route {id: $id})-[pt:PASSES_THROUGH]->(mn:MapNode)
        RETURN mn.osmId AS osmId, mn.lat AS lat, mn.lon AS lon
        ORDER BY pt.order
        """,
        id=routeId,
    )
    path_nodes = [row.data() async for row in path_result]
    if len(path_nodes) < 2:
        raise HTTPException(status_code=400, detail="Original route is too short to alternate")

    penalised_edges = set()
    for i in range(len(path_nodes) - 1):
        a, b = path_nodes[i]["osmId"], path_nodes[i + 1]["osmId"]
        penalised_edges.add((min(a, b), max(a, b)))

    priority = meta["priority"] if meta["priority"] is not None else DEFAULT_PRIORITY
    target_distance = (
        meta["targetDistance"] if meta["targetDistance"] is not None
        else DEFAULT_TARGET_DISTANCE
    )

    return await _build_and_save_route(
        session,
        user_id=meta["userId"],
        start_lat=path_nodes[0]["lat"],
        start_lon=path_nodes[0]["lon"],
        target_distance=target_distance,
        priority=priority,
        penalised_edges=penalised_edges,
    )

@router.get("/")
async def list_routes(
    userId: str | None = Query(None),
    createdFrom: str | None = Query(None),
    createdTo: str | None = Query(None),
    distanceMin: float | None = Query(None),
    distanceMax: float | None = Query(None),
    estimatedMin: int | None = Query(None),
    estimatedMax: int | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    session=Depends(get_session),
):
    match = "MATCH (u:User)-[:REQUESTED_ROUTE]->(r:Route)"
    where = """
        WHERE ($userId       IS NULL OR u.id = $userId)
          AND ($createdFrom  IS NULL OR r.createdAt >= datetime($createdFrom))
          AND ($createdTo    IS NULL OR r.createdAt <= datetime($createdTo))
          AND ($distanceMin  IS NULL OR r.totalDistanceMeters >= $distanceMin)
          AND ($distanceMax  IS NULL OR r.totalDistanceMeters <= $distanceMax)
          AND ($estimatedMin IS NULL OR r.estimatedMinutes >= $estimatedMin)
          AND ($estimatedMax IS NULL OR r.estimatedMinutes <= $estimatedMax)
    """
    params = dict(
        userId=userId,
        createdFrom=createdFrom, createdTo=createdTo,
        distanceMin=distanceMin, distanceMax=distanceMax,
        estimatedMin=estimatedMin, estimatedMax=estimatedMax,
    )

    count_result = await session.run(
        f"{match} {where} RETURN count(r) AS total", **params
    )
    total = (await count_result.single())["total"]

    result = await session.run(
        f"""
        {match} {where}
        RETURN u.id AS userId,
               r.id AS id, 
               toString(r.createdAt) AS createdAt,
               r.totalDistanceMeters AS totalDistanceMeters,
               r.estimatedMinutes AS estimatedMinutes,
               size(r.newTilesX) AS newTilesCount,
               r.allTilesCount AS allTilesCount,
               size([(r)-[:HIGHLIGHTS]->(p) | p]) AS poiCount,
               [(r)-[:HIGHLIGHTS]->(p) | {{osmId: p.osmId, name: p.name, category: p.category}}][..5] AS poiPreview
        ORDER BY r.createdAt DESC
        SKIP $offset LIMIT $limit
        """,
        offset=offset, limit=limit, **params,
    )
    items = [r.data() async for r in result]
    return make_page(items, total, offset, limit)


@router.get("/{routeId}")
async def get_route(routeId: str, session=Depends(get_session)):
    result = await session.run(
        """
        MATCH (r:Route {id: $id})
        RETURN r.id AS id, toString(r.createdAt) AS createdAt,
               r.totalDistanceMeters AS totalDistanceMeters,
               r.estimatedMinutes AS estimatedMinutes,
               r.priority AS priority,
               r.targetDistance AS targetDistance,
               r.newTilesX AS newTilesX,
               r.newTilesY AS newTilesY,
               r.allTilesCount AS allTilesCount
        """,
        id=routeId,
    )
    record = await result.single()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    nodes_result = await session.run(
        """
        MATCH (r:Route {id: $id})-[pt:PASSES_THROUGH]->(mn:MapNode)
        RETURN mn.osmId AS osmId, mn.lat AS lat, mn.lon AS lon, pt.order AS order
        ORDER BY pt.order
        """,
        id=routeId,
    )
    nodes = [r.data() async for r in nodes_result]

    highlights_result = await session.run(
        """
        MATCH (r:Route {id: $id})-[:HIGHLIGHTS]->(p:POI)
        RETURN p.osmId AS osmId, p.name AS name, p.category AS category,
               p.lat AS lat, p.lon AS lon
        """,
        id=routeId,
    )
    highlights = [r.data() async for r in highlights_result]

    tiles_x = record["newTilesX"] or []
    tiles_y = record["newTilesY"] or []
    new_tiles = [{"tileX": x, "tileY": y} for x, y in zip(tiles_x, tiles_y)]

    data = record.data()
    data.pop("newTilesX", None)
    data.pop("newTilesY", None)
    return {**data, "nodes": nodes, "highlights": highlights, "newTiles": new_tiles}


@router.put("/{routeId}")
async def update_route(routeId: str, body: UpdateRouteRequest, session=Depends(get_session)):
    result = await session.run("MATCH (r:Route {id: $id}) RETURN r", id=routeId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    if body.priority is not None:
        await session.run(
            "MATCH (r:Route {id: $id}) SET r.priority = $v", id=routeId, v=body.priority
        )
    if body.targetDistance is not None:
        await session.run(
            "MATCH (r:Route {id: $id}) SET r.targetDistance = $v", id=routeId, v=body.targetDistance
        )

    result = await session.run(
        """
        MATCH (r:Route {id: $id})
        RETURN r.id AS id, toString(r.createdAt) AS createdAt,
               r.totalDistanceMeters AS totalDistanceMeters,
               r.estimatedMinutes AS estimatedMinutes,
               r.priority AS priority,
               r.targetDistance AS targetDistance,
               r.allTilesCount AS allTilesCount
        """,
        id=routeId,
    )
    return (await result.single()).data()


@router.delete("/{routeId}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_route(routeId: str, session=Depends(get_session)):
    result = await session.run("MATCH (r:Route {id: $id}) RETURN r", id=routeId)
    if not await result.single():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route not found")

    await session.run("MATCH (r:Route {id: $id}) DETACH DELETE r", id=routeId)
