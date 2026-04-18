import json
import uuid
from pathlib import Path

SEED_FILE = Path(__file__).parent / "data" / "osm_seed.json"
BATCH_SIZE = 500


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
        for poi in pois:
            await session.run(
                """
                CREATE (p:POI {osmId: $osmId, name: $name, category: $category, lat: $lat, lon: $lon})
                WITH p
                MATCH (n:MapNode)
                WITH p, n,
                     point.distance(
                       point({latitude: p.lat, longitude: p.lon}),
                       point({latitude: n.lat, longitude: n.lon})
                     ) AS dist
                ORDER BY dist ASC LIMIT 1
                CREATE (n)-[:HAS_POI]->(p)
                """,
                osmId=poi["osmId"],
                name=poi.get("name", ""),
                category=poi.get("category", ""),
                lat=poi["lat"],
                lon=poi["lon"],
            )
        print(f"[seed] Created {len(pois)} POIs.")

        await session.run(
            """
            MERGE (u:User {username: 'testuser'})
            ON CREATE SET u.id = $id, u.password = 'test123', u.avatarUrl = ''
            """,
            id=str(uuid.uuid4()),
        )
        print("[seed] Debug user testuser/test123 created.")
        print("[seed] Done.")