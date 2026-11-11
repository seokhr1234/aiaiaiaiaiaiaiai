"""Recover ALL tagged road-reference nodes from the same verified PBF.

round5 preserved full way tags, but node tags only survived for its selected POI
classes. An unnamed barrier/kerb/entrance cannot be assumed untagged from that
intermediate study-map. Original artifacts remain byte-identical.
"""
from pathlib import Path
import gzip
import hashlib
import json
import time
import osmium

ROOT = Path(__file__).resolve().parent
PREVIOUS = ROOT.parent/'round5-2026-11-11'


def recover(source, original_nodes, emit):
    seen = set()
    stats = {'road_nodes_expected': len(original_nodes), 'road_nodes_found': 0,
             'tagged_nodes_emitted': 0, 'tagged_nodes_missing_from_intermediate': 0,
             'originally_tagged_nodes': sum(bool(n.get('tags')) for n in original_nodes.values())}

    class Read(osmium.SimpleHandler):
        def node(self, node):
            if node.id not in original_nodes:
                return
            if node.id in seen:
                raise ValueError('Duplicate source node')
            seen.add(node.id)
            previous = original_nodes[node.id]
            if not node.location.valid() or node.location.lon != previous['lon'] or node.location.lat != previous['lat']:
                raise ValueError('Road node coordinate differs from preserved source')
            tags = dict(node.tags)
            if previous.get('tags') and previous['tags'] != tags:
                raise ValueError('Preserved node tags differ from same source PBF')
            stats['road_nodes_found'] += 1
            if tags:
                if not previous.get('tags'):
                    stats['tagged_nodes_missing_from_intermediate'] += 1
                stats['tagged_nodes_emitted'] += 1
                emit({'type': 'node', 'id': node.id, 'lon': node.location.lon, 'lat': node.location.lat,
                      'version': node.version, 'timestamp': str(node.timestamp), 'tags': tags})

    with osmium.io.Reader(source, osmium.osm.NODE) as reader:
        osmium.apply(reader, Read())
    if len(seen) != len(original_nodes):
        raise ValueError('Some original road-reference nodes are absent in the PBF')
    return stats


def main():
    result_path = ROOT/'node-recovery-results.json'
    output = ROOT/'derived/road-node-tags.ndjson.gz'
    if result_path.exists() or output.exists():
        raise FileExistsError('Preserve previous node recovery')
    extraction = json.loads((PREVIOUS/'osm-extract-results.json').read_bytes())
    source = PREVIOUS/'raw/osm-korea-261109-pbf/response.bin'
    state = hashlib.sha256()
    with source.open('rb') as stream:
        while chunk := stream.read(1024*1024):
            state.update(chunk)
    if state.hexdigest() != extraction['source_sha256']:
        raise ValueError('PBF source hash mismatch')
    packed_source = (PREVIOUS/'derived/study-map.json.gz').read_bytes()
    if hashlib.sha256(packed_source).hexdigest() != extraction['outputs']['study-map.json.gz']['sha256']:
        raise ValueError('Intermediate artifact hash mismatch')
    data = json.loads(gzip.decompress(packed_source))
    original = {n['id']: n for n in data['elements'] if n['type'] == 'node'}
    del data, packed_source
    raw_sha = hashlib.sha256()
    started = time.monotonic()
    with output.open('wb') as stream, gzip.GzipFile(fileobj=stream, mode='wb', mtime=0, filename='', compresslevel=6) as packed:
        def emit(row):
            line = (json.dumps(row, ensure_ascii=False, separators=(',', ':'))+'\n').encode()
            packed.write(line)
            raw_sha.update(line)
        stats = recover(osmium.io.File(str(source), 'pbf'), original, emit)
    report = {'reviewed_date_kst': '2026-11-11', 'original_collected_date_kst': '2026-11-11',
              'source_as_of': extraction['source_as_of'], 'source_crs': 'EPSG:4326', 'vertical_datum': None,
              'source_pbf_sha256': extraction['source_sha256'], 'coordinates_unchanged': True,
              **stats, 'elapsed_seconds': round(time.monotonic()-started, 2),
              'output': {'path': 'derived/road-node-tags.ndjson.gz', 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
                         'uncompressed_sha256': raw_sha.hexdigest(), 'bytes': output.stat().st_size},
              'field_verified': False, 'routing_eligible': False, 'active_runtime_replaced': False, 'new_slope_values_promoted': 0,
              'notice': 'Recovered original node tags, not newly surveyed data. Existing runtime and round5/round6 files remain untouched.'}
    result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
