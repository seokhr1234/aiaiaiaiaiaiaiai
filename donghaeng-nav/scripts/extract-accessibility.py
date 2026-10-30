"""Extract sourced facilities without changing the app or inventing coordinates."""
import csv
import json
import math
import re
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/accessibility'
SCHOOL = (37.5950991, 127.038992)


def distance(lat, lon):
    p, q = map(math.radians, (SCHOOL[0], lat))
    a = math.sin((q-p)/2)**2 + math.cos(p)*math.cos(q)*math.sin(math.radians(lon-SCHOOL[1])/2)**2
    return round(6371000 * 2 * math.asin(math.sqrt(a)), 1)


def write_csv(path, rows, fields):
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    source = json.loads((ROOT / 'dist/map-data.json').read_text())
    elements = {(e['type'], e['id']): e for e in source['elements']}
    nodes = {i: e for (t, i), e in elements.items() if t == 'node'}
    features, rows = [], []
    for e in elements.values():
        tags = e.get('tags', {})
        if tags.get('amenity') == 'bench':
            kind = 'bench'
        elif tags.get('highway') == 'steps':
            kind = 'escalator' if tags.get('conveying') in ('yes', 'forward', 'backward', 'reversible') else 'stairs'
        else:
            continue
        if e['type'] == 'node':
            geometry = {'type': 'Point', 'coordinates': [e['lon'], e['lat']]}
            lat, lon = e['lat'], e['lon']
        elif e['type'] == 'way':
            assert all(i in nodes for i in e['nodes']), f"Missing geometry: {e['id']}"
            coords = [[nodes[i]['lon'], nodes[i]['lat']] for i in e['nodes']]
            assert len(coords) >= 2
            geometry = {'type': 'LineString', 'coordinates': coords}
            # This is a representative point, not a surveyed entrance or midpoint.
            lat = sum(c[1] for c in coords)/len(coords)
            lon = sum(c[0] for c in coords)/len(coords)
        else:
            raise ValueError('Unsupported facility geometry')
        props = {
            'id': f"osm:{e['type']}/{e['id']}", 'kind': kind,
            'name': tags.get('name', ''), 'latitude': lat, 'longitude': lon,
            'coordinate_role': 'facility_point' if e['type'] == 'node' else 'mean_of_vertices',
            'distance_from_school_m': distance(lat, lon),
            'source_url': f"https://www.openstreetmap.org/{e['type']}/{e['id']}",
            'source_snapshot': source['osm3s']['timestamp_osm_base'],
            'field_verified': False, 'operational_status': 'unknown',
            'license': 'ODbL-1.0',
        }
        features.append({'type': 'Feature', 'geometry': geometry, 'properties': {**props, 'osm_tags': tags}})
        rows.append(props)
    collection = {'type': 'FeatureCollection', 'name': 'school-area-accessibility',
                  'attribution': '© OpenStreetMap contributors', 'features': features}
    (OUT / 'school-facilities.geojson').write_text(json.dumps(collection, ensure_ascii=False, indent=2))
    write_csv(OUT / 'school-facilities.csv', rows, list(rows[0]))

    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    official = []
    with ZipFile(OUT / 'raw/seoul-escalators-20260211.xlsx') as z:
        shared = [''.join(n.text or '' for n in si.findall('.//s:t', ns))
                  for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', ns)]
        sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        for row in sheet.findall('s:sheetData/s:row', ns)[2:]:
            values = {}
            for cell in row.findall('s:c', ns):
                value = cell.findtext('s:v', '', ns)
                if cell.get('t') == 's':
                    value = shared[int(value)]
                values[re.sub(r'\d', '', cell.get('r'))] = value
            if not values.get('D') or not values.get('F'):
                continue
            official.append({
                'line': values.get('C', ''), 'station': values['D'],
                'unit': values.get('E', ''), 'elevator_number': values['F'],
                'location': values.get('G', ''), 'floors': values.get('H', ''),
                'direction': values.get('I', ''), 'latitude': '', 'longitude': '',
                'coordinate_status': 'not_provided', 'operational_status': 'unknown',
                'source_as_of': '2026-02-11', 'license': 'KOGL-Type-1',
                'source_url': 'https://data.seoul.go.kr/dataList/OA-22486/F/1/datasetView.do',
            })
    write_csv(OUT / 'seoul-escalators.csv', official, list(official[0]))
    nearby = [r for r in official if any(s in r['station'] for s in ('월곡', '고려대', '안암', '길음', '성신여대', '청량리'))]
    write_csv(OUT / 'nearby-station-escalators.csv', nearby, list(official[0]))
    summary = {
        'school_point': list(SCHOOL),
        'osm_counts': dict(Counter(r['kind'] for r in rows)),
        'within_1km_straight_line': dict(Counter(r['kind'] for r in rows if r['distance_from_school_m'] <= 1000)),
        'official_escalator_records': len(official),
        'nearby_station_records': len(nearby),
        'nearby_stations': dict(Counter(r['station'] for r in nearby)),
        'osm_snapshot': source['osm3s']['timestamp_osm_base'],
        'note': 'OSM counts are mapped objects/segments, not exhaustive facility counts. All field verification and current operating status remain unknown.',
    }
    (OUT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
