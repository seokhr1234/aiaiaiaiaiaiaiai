"""Validate the public PBF checksum, extract a rectangular Seoul-area STUDY set.

Never overwrites attempts or modifies active runtime data. Bbox is a study extent,
not an administrative boundary or a claim of complete/verified pedestrian data.
"""
from pathlib import Path
import hashlib
import json
import time
import gzip
import osmium

ROOT = Path(__file__).resolve().parent
source = ROOT / 'raw/osm-korea-261109-pbf/response.bin'
expected = (ROOT / 'raw/osm-korea-261109-md5/response.bin').read_text().split()[0]
raw = source.read_bytes()
assert hashlib.md5(raw).hexdigest() == expected, 'PBF checksum mismatch'
source_sha = hashlib.sha256(raw).hexdigest()
del raw
out = ROOT / 'derived'
out.mkdir(exist_ok=False)
file = osmium.io.File(str(source), 'pbf')
with osmium.io.Reader(file, osmium.osm.NOTHING) as reader:
    header = reader.header()
    timestamp = header.get('osmosis_replication_timestamp') or None
    generator = header.get('generator') or None
bbox = [126.7, 37.38, 127.3, 37.78]
nodes, roads, buildings, pois = {}, [], [], []
started = time.monotonic()


def inside(x, y):
    return bbox[0] <= x <= bbox[2] and bbox[1] <= y <= bbox[3]


class Extract(osmium.SimpleHandler):
    def node(self, n):
        if not n.location.valid() or not inside(n.location.lon, n.location.lat):
            return
        tags = dict(n.tags)
        if tags.get('name') or tags.get('public_transport') or tags.get('railway') or tags.get('highway') in ['bus_stop', 'elevator', 'crossing']:
            pois.append({'type': 'node', 'id': n.id, 'lat': n.location.lat,
                         'lon': n.location.lon, 'version': n.version,
                         'timestamp': str(n.timestamp), 'tags': tags})

    def way(self, w):
        tags = dict(w.tags)
        if not (tags.get('highway') or tags.get('building') not in [None, 'no']):
            return
        refs = list(w.nodes)
        if not refs or any(not n.location.valid() for n in refs):
            return
        xs, ys = [n.location.lon for n in refs], [n.location.lat for n in refs]
        if max(xs) < bbox[0] or min(xs) > bbox[2] or max(ys) < bbox[1] or min(ys) > bbox[3]:
            return
        item = {'type': 'way', 'id': w.id, 'nodes': [n.ref for n in refs],
                'version': w.version, 'timestamp': str(w.timestamp), 'tags': tags}
        if tags.get('highway'):
            roads.append(item)
        if tags.get('building') not in [None, 'no']:
            buildings.append(item)
        for n in refs:
            nodes[n.ref] = {'type': 'node', 'id': n.ref, 'lat': n.location.lat, 'lon': n.location.lon}


Extract().apply_file(file, locations=True, idx='flex_mem')
for p in pois:
    if p['id'] in nodes:
        nodes[p['id']].update(p)
road_nodes = {n for w in roads for n in w['nodes']}
building_nodes = {n for w in buildings for n in w['nodes']}
meta = {'source': 'Geofabrik / OpenStreetMap contributors', 'source_url': 'https://download.geofabrik.de/asia/south-korea.html',
        'source_sha256': source_sha, 'source_as_of': timestamp,
        'bbox': bbox, 'source_crs': 'EPSG:4326', 'vertical_datum': None,
        'license': 'ODbL-1.0', 'field_verified': False, 'routing_eligible': False,
        'notice': 'Rectangular study extraction; incomplete relations and unverified connectivity; not an active routing dataset'}
files = {}
for name, elements in [('study-map.json', [nodes[i] for i in sorted(road_nodes)] + roads),
                       ('study-context.json', [nodes[i] for i in sorted(building_nodes)] + buildings),
                       ('study-places.json', pois)]:
    data = {'version': 0.6, 'osm3s': {'timestamp_osm_base': timestamp}, 'study': meta, 'elements': elements}
    content = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    packed = gzip.compress(content, compresslevel=6, mtime=0)
    (out / (name+'.gz')).write_bytes(packed)
    files[name+'.gz'] = {'bytes': len(packed), 'sha256': hashlib.sha256(packed).hexdigest(),
                        'uncompressed_sha256': hashlib.sha256(content).hexdigest(),
                        'uncompressed_bytes': len(content), 'elements': len(elements)}
report = {**meta, 'pbf_md5_verified': True, 'pbf_generator': generator, 'ways': len(roads),
          'road_nodes': len(road_nodes), 'building_ways': len(buildings), 'poi_nodes': len(pois),
          'relations_included': False, 'active_runtime_replaced': False,
          'elapsed_seconds': round(time.monotonic()-started, 2), 'outputs': files,
          'limitations': ['bbox overlap selection can include ways outside the rectangle',
                         'relations/restrictions/multipolygons not yet validated; no pedestrian connectivity/terrain promotion']}
(ROOT / 'osm-extract-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
