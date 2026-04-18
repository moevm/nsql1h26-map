import argparse
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import datetime, timezone


def lat_lon_to_tile(lat, lon, zoom=19):
    n = 2 ** zoom
    tile_x = int((lon + 180) / 360 * n)
    tile_y = int((1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n)
    return tile_x, tile_y


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def fetch_overpass(bbox):
    min_lat, min_lon, max_lat, max_lon = bbox
    bbox_str = f"{min_lat},{min_lon},{max_lat},{max_lon}"
    query = f"""
[out:json][timeout:60];
(
  way["highway"~"primary|secondary|tertiary|residential|footway|pedestrian|path|living_street|unclassified"]({bbox_str});
  node["amenity"]({bbox_str});
  node["tourism"]({bbox_str});
  node["shop"]({bbox_str});
  node["historic"]({bbox_str});
);
(._;>;);
out body;
""".strip()

    url = "https://overpass-api.de/api/interpreter"
    data = ("data=" + urllib.parse.quote(query)).encode()

    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    print("Fetching data from Overpass API...")
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode())


def process(raw, bbox):
    elements = raw["elements"]

    node_map = {}
    for el in elements:
        if el["type"] == "node":
            node_map[el["id"]] = el

    poi_tag_keys = {"amenity", "tourism", "shop", "historic", "leisure"}

    nodes = []
    pois = []
    seen_node_ids = set()

    for el in elements:
        if el["type"] != "node":
            continue
        tags = el.get("tags", {})
        lat, lon = el["lat"], el["lon"]
        tile_x, tile_y = lat_lon_to_tile(lat, lon)

        poi_key = next((k for k in poi_tag_keys if k in tags), None)
        if poi_key:
            pois.append({
                "osmId": el["id"],
                "name": tags.get("name", ""),
                "category": tags.get(poi_key, ""),
                "lat": lat,
                "lon": lon,
            })

        if el["id"] not in seen_node_ids:
            nodes.append({
                "osmId": el["id"],
                "lat": lat,
                "lon": lon,
                "tileX": tile_x,
                "tileY": tile_y,
            })
            seen_node_ids.add(el["id"])

    edges = []
    for el in elements:
        if el["type"] != "way":
            continue
        node_ids = el.get("nodes", [])
        for i in range(len(node_ids) - 1):
            a = node_map.get(node_ids[i])
            b = node_map.get(node_ids[i + 1])
            if a and b:
                dist = haversine(a["lat"], a["lon"], b["lat"], b["lon"])
                edges.append({
                    "fromOsmId": a["id"],
                    "toOsmId": b["id"],
                    "distanceMeters": round(dist, 2),
                })

    return {
        "meta": {
            "bbox": list(bbox),
            "zoom": 19,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
        "nodes": nodes,
        "edges": edges,
        "pois": pois,
    }


def main():
    parser = argparse.ArgumentParser(description="Fetch OSM data and save to data/osm_seed.json")
    parser.add_argument(
        "--bbox",
        default="59.95,30.28,59.98,30.34",
        help="Bounding box: min_lat,min_lon,max_lat,max_lon (default: Petrogradka)",
    )
    args = parser.parse_args()

    bbox = tuple(float(x) for x in args.bbox.split(","))
    if len(bbox) != 4:
        raise ValueError("bbox must have exactly 4 values")

    raw = fetch_overpass(bbox)
    result = process(raw, bbox)

    output_path = Path(__file__).parent.parent / "data" / "osm_seed.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"Saved: {output_path}")
    print(f"  nodes: {len(result['nodes'])}")
    print(f"  edges: {len(result['edges'])}")
    print(f"  pois:  {len(result['pois'])}")


if __name__ == "__main__":
    main()