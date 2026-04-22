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

def _greedy_walk(
            nodes: dict,
            graph: dict,
            covered: set,
            start: int,
            target_distance: float,
            is_loop: bool,
    ) -> tuple[list[int], float]:
        """
        Жадный обход графа: на каждом шаге предпочитаем соседа
        с непокрытым тайлом. Останавливаемся, когда набрали ~targetDistance.
        Для кольцевого маршрута останавливаемся раньше, оставляя запас на обратный путь.
        """
        budget = target_distance * 0.75 if is_loop else target_distance
        path = [start]
        visited_edges = set()
        total_dist = 0.0
        seen_tiles = set(covered)  # копия, чтобы не считать один тайл дважды за маршрут
        current = start

        while total_dist < budget:
            neighbors = graph.get(current, [])
            if not neighbors:
                break

            # Сортируем: сначала соседи с новым тайлом, потом по расстоянию
            scored = []
            for neighbor_id, dist in neighbors:
                edge_key = (min(current, neighbor_id), max(current, neighbor_id))
                tile = (nodes[neighbor_id]["tileX"], nodes[neighbor_id]["tileY"])
                is_new = tile not in seen_tiles
                already_walked = edge_key in visited_edges
                # Приоритет: новый тайл > не ходили по ребру > короче
                score = (not is_new, already_walked, dist)
                scored.append((score, neighbor_id, dist, tile, edge_key))

            scored.sort(key=lambda x: x[0])

            # Берём лучшего кандидата
            _, next_node, dist, tile, edge_key = scored[0]

            if total_dist + dist > target_distance * 1.2:
                break

            path.append(next_node)
            total_dist += dist
            visited_edges.add(edge_key)
            seen_tiles.add(tile)
            current = next_node

        return path, total_dist


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

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_route(body: RouteRequest, session=Depends(get_session)):
        # 1. Загрузить подграф и закрашенные тайлы
        nodes, graph = await _load_subgraph(session, body.startLat, body.startLon, body.searchRadius)
        if not nodes:
            raise HTTPException(status_code=404, detail="No MapNodes found in search radius")

        covered = await _load_covered_tiles(session, body.userId)

        # 2. Найти ближайшие узлы к старту и финишу
        start_node = _find_nearest_node(nodes, body.startLat, body.startLon)
        end_node = _find_nearest_node(nodes, body.endLat, body.endLon)
        if start_node is None or end_node is None:
            raise HTTPException(status_code=404, detail="Cannot snap start/end to graph")

        is_loop = (start_node == end_node)

        # 3. Жадный обход: максимизируем новые тайлы
        path, path_distance = _greedy_walk(
            nodes, graph, covered, start_node, body.targetDistance, is_loop,
        )

        # 4. Если кольцевой — вернуться к старту
        if is_loop and path[-1] != start_node:
            return_path, return_dist = _dijkstra(graph, path[-1], start_node)
            if return_path:
                path.extend(return_path[1:])  # без дубля текущего узла
                path_distance += return_dist
        elif not is_loop and path[-1] != end_node:
            return_path, return_dist = _dijkstra(graph, path[-1], end_node)
            if return_path:
                path.extend(return_path[1:])
                path_distance += return_dist

        # 5. Подсчитать новые тайлы на маршруте
        new_tiles = set()
        for osm_id in path:
            tile = (nodes[osm_id]["tileX"], nodes[osm_id]["tileY"])
            if tile not in covered:
                new_tiles.add(tile)

        # 6. Сохранить в Neo4j
        route_id = str(uuid.uuid4())
        estimated_minutes = int(path_distance / 80)  # ~80 м/мин пешком

        await session.run(
            """
            MATCH (u:User {id: $userId})
            CREATE (r:Route {
                id: $routeId,
                createdAt: datetime(),
                totalDistanceMeters: $distance,
                estimatedMinutes: $minutes
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
            nodeIds=[{"osmId": osm_id, "order": i} for i, osm_id in enumerate(path)],
        )

        return {
            "routeId": route_id,
            "totalDistanceMeters": round(path_distance, 1),
            "estimatedMinutes": estimated_minutes,
            "newTiles": len(new_tiles),
            "nodes": [
                {"osmId": osm_id, "lat": nodes[osm_id]["lat"], "lon": nodes[osm_id]["lon"], "order": i}
                for i, osm_id in enumerate(path)
            ],
        }