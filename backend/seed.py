import json
import uuid
from pathlib import Path

from utils import haversine
from routers.routes import _build_and_save_route
import random
from datetime import datetime, timezone
from datetime import timedelta
from routers.walks import _create_walk, WalkPoint

SEED_FILE = Path(__file__).parent / "data" / "osm_seed.json"
BATCH_SIZE = 500
POI_RADIUS_METERS = 25


async def run_seed(driver):
    async with driver.session() as session:
        result = await session.run("MATCH (n:MapNode) RETURN count(n) AS cnt")
        record = await result.single()
        if record["cnt"] > 0:
            print("[seed] DB already populated, skipping.")
            return

        print("[seed] Loading osm_seed.json...")
        with open(SEED_FILE, encoding="utf-8") as f:
            data = json.load(f)

        await session.run("CREATE INDEX mapnode_osmid IF NOT EXISTS FOR (n:MapNode) ON (n.osmId)")
        await session.run("CREATE INDEX mapnode_tile IF NOT EXISTS FOR (n:MapNode) ON (n.tileX, n.tileY)")
        await session.run("CREATE INDEX covered_tile IF NOT EXISTS FOR (ct:CoveredTile) ON (ct.tileX, ct.tileY)")
        await session.run("CREATE INDEX user_id IF NOT EXISTS FOR (u:User) ON (u.id)")
        print("[seed] Indexes created.")

        nodes = data["nodes"]
        for i in range(0, len(nodes), BATCH_SIZE):
            await session.run(
                """
                UNWIND $batch AS n
                CREATE (:MapNode {osmId: n.osmId, lat: n.lat, lon: n.lon, tileX: n.tileX, tileY: n.tileY})
                """,
                batch=nodes[i:i + BATCH_SIZE],
            )
        print(f"[seed] Created {len(nodes)} MapNodes.")

        edges = data["edges"]
        for i in range(0, len(edges), BATCH_SIZE):
            await session.run(
                """
                UNWIND $batch AS e
                MATCH (a:MapNode {osmId: e.fromOsmId})
                MATCH (b:MapNode {osmId: e.toOsmId})
                CREATE (a)-[:CONNECTED_TO {distanceMeters: e.distanceMeters}]->(b)
                CREATE (b)-[:CONNECTED_TO {distanceMeters: e.distanceMeters}]->(a)
                """,
                batch=edges[i:i + BATCH_SIZE],
            )
        print(f"[seed] Created {len(edges)} edges.")

        pois = data["pois"]
        node_coords = [(n["osmId"], n["lat"], n["lon"]) for n in nodes]

        LAT_DELTA = POI_RADIUS_METERS / 111_000
        LON_DELTA = POI_RADIUS_METERS / 55_500

        poi_batch = []
        for p in pois:
            plat, plon = p["lat"], p["lon"]
            candidates = [
                (osmId, lat, lon) for osmId, lat, lon in node_coords
                if abs(lat - plat) <= LAT_DELTA and abs(lon - plon) <= LON_DELTA
            ]
            nearby = [
                osmId for osmId, lat, lon in candidates
                if haversine(lat, lon, plat, plon) <= POI_RADIUS_METERS
            ]
            if not nearby:
                nearest = min(node_coords, key=lambda n: (n[1] - plat) ** 2 + (n[2] - plon) ** 2)
                nearby = [nearest[0]]
            poi_batch.append({
                "osmId": p["osmId"],
                "name": p.get("name", ""),
                "category": p.get("category", ""),
                "lat": p["lat"],
                "lon": p["lon"],
                "nearestOsmIds": nearby,
            })

        for i in range(0, len(poi_batch), BATCH_SIZE):
            await session.run(
                """
                UNWIND $batch AS p
                CREATE (poi:POI {osmId: p.osmId, name: p.name, category: p.category, lat: p.lat, lon: p.lon})
                WITH poi, p
                UNWIND p.nearestOsmIds AS nodeId
                MATCH (n:MapNode {osmId: nodeId})
                CREATE (n)-[:HAS_POI]->(poi)
                """,
                batch=poi_batch[i:i + BATCH_SIZE],
            )
        total_links = sum(len(p["nearestOsmIds"]) for p in poi_batch)
        print(f"[seed] Created {len(poi_batch)} POIs with {total_links} HAS_POI links.")

        user_id = str(uuid.uuid4())
        await session.run(
            """
            MERGE (u:User {username: 'testuser'})
            ON CREATE SET u.id = $id, u.password = 'test123', u.email = 'testuser@example.com', u.avatarUrl = '', u.createdAt = datetime(), u.updatedAt = datetime()
            """,
            id=user_id,
        )
        result = await session.run("MATCH (u:User {username: 'testuser'}) RETURN u.id AS id")
        record = await result.single()
        print(f"[seed] Debug user: email=testuser@example.com  password=test123  id={record['id']}")
        print("[seed] Done.")
        
        user_id = record["id"]

        START_POINTS = [
            (59.9676, 30.3129),
            (59.9589, 30.3072),
            (59.9710, 30.3120),
            (59.9545, 30.2905),
            (59.9650, 30.3060),
            (59.9630, 30.3150),
            (59.9700, 30.2950),
            (59.9600, 30.3000),
        ]
        NUM_ROUTES = 10

        print("[seed] Creating seed routes...")
        success = 0
        for i in range(NUM_ROUTES):
            start_lat, start_lon = random.choice(START_POINTS)
            try:
                await _build_and_save_route(
                    session,
                    user_id=user_id,
                    start_lat=start_lat,
                    start_lon=start_lon,
                    target_distance=random.randint(1000, 10000),
                    priority=round(random.uniform(0, 1), 2),
                )
                success += 1
            except Exception as e:
                print(f"[seed] Route {i+1} failed: {e}")
        print(f"[seed] Created {success}/{NUM_ROUTES} routes.")

        print("[seed] Done.")

        LAT_MIN, LAT_MAX = 59.95, 59.98
        LON_MIN, LON_MAX = 30.28, 30.34
        NUM_WALKS = 10
        POINTS_PER_WALK = random.randrange(400,700)
        DAYS_BACK = 10

        def _gen_points(num_points):
            lat = random.uniform(LAT_MIN, LAT_MAX)
            lon = random.uniform(LON_MIN, LON_MAX)
            pts = [(lat, lon)]
            for _ in range(num_points - 1):
                lat = max(LAT_MIN, min(LAT_MAX, lat + random.uniform(-0.0005, 0.0005)))
                lon = max(LON_MIN, min(LON_MAX, lon + random.uniform(-0.0005, 0.0005)))
                pts.append((lat, lon))
            return pts

        print("[seed] Creating seed walks...")
        success = 0
        for i in range(NUM_WALKS):
            started_at = datetime.now(timezone.utc) - timedelta(
                days=random.randint(0, DAYS_BACK),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59),
            )
            raw_points = _gen_points(POINTS_PER_WALK)
            walk_points = [
                WalkPoint(lat=lat, lon=lon, timestamp=started_at + timedelta(seconds=j * 30))
                for j, (lat, lon) in enumerate(raw_points)
            ]
            try:
                await _create_walk(session, user_id, walk_points)
                success += 1
            except Exception as e:
                print(f"[seed] Walk {i+1} failed: {e}")
        print(f"[seed] Created {success}/{NUM_WALKS} walks.")

        print("[seed] Done.")
