"""Prepare a transaction for a fresh source snapshot; no implicit database writes.

Usage: python export-expansion-postgis.py > /tmp/donghaeng-import.sql
Then explicitly run psql with ON_ERROR_STOP against the intended local database.
Source IDs include hashes; duplicates reject the entire import instead of updating.
"""
from pathlib import Path
import hashlib
import json

base = Path(__file__).resolve().parents[1] / 'dist'
quote = lambda value: 'NULL' if value is None else "'" + str(value).replace("'", "''") + "'"
files = [('precision', 'data/precision/precision-map.geojson'), ('facilities','data/accessibility/seoul/seoul-facilities.geojson'), ('crossings','data/precision/crossings-review.geojson')]
print('BEGIN;')
for kind, name in files:
    raw = (base/name).read_bytes()
    data = json.loads(raw)
    digest = hashlib.sha256(raw).hexdigest()
    source_id = kind+':'+digest
    meta = data.get('metadata', {})
    # A collection of mixed providers retains the original per-feature metadata.
    url = meta.get('source_url') or 'https://github.com/seokhr1234/aiaiaiaiaiaiaiai'
    license = meta.get('license') or 'Mixed sources; see original per-feature properties'
    print('INSERT INTO donghaeng.source_snapshot(id,source_url,sha256,source_as_of,source_crs,vertical_datum,license,metadata) VALUES ('+
          ','.join(quote(v) for v in [source_id,url,digest,meta.get('as_of'),meta.get('source_crs'),meta.get('vertical_datum'),license,json.dumps(meta,ensure_ascii=False)])+');')
    for i, f in enumerate(data['features']):
        p = f['properties']
        print('INSERT INTO donghaeng.review_feature(source_id,ordinal,external_id,original_feature_id,kind,original_geometry,geometry,properties,field_verified) VALUES ('+
              ','.join([quote(source_id),str(i),quote(f.get('id') or p.get('id')),quote(json.dumps(f['id'])) if f.get('id') is not None else 'NULL',quote(p.get('kind') or kind),
                        quote(json.dumps(f['geometry'],ensure_ascii=False)),
                        'ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON('+quote(json.dumps(f['geometry'],ensure_ascii=False))+'),4326))',quote(json.dumps(p,ensure_ascii=False)), 'false'])+');')
print('COMMIT;')
