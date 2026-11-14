"""Build a display-only steep-road overlay from the pinned GLO-30 tiles and city graph."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import numpy as np
import rasterio

NAV = Path(__file__).resolve().parents[1]
CITY = NAV / 'services/city-walk'
THRESHOLD = 10
SUPPORT = 90
TILES = {
    126: 'f530dd28308ecd6c5ceb0405dc1ffb7113bcafdec30d023de50f16dc433a274f',
    127: '4f8fef79da8c18ed9a9a0fb97b3d2695c4681181e013e039d87044e5479f7df6',
}
CREDIT = ('Produced using Copernicus WorldDEM™-30 © DLR e.V. 2010-2014 and '
          '© Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS '
          'by the European Union and ESA; all rights reserved.')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def graph_data(manifest):
    asset = 'graph.bin.gz'
    raw = gzip.decompress((CITY / 'assets' / asset).read_bytes())
    assert sha(raw) == manifest['assets'][asset]['raw_sha256']
    return {
        key: np.frombuffer(raw, dtype='<' + info['type'], count=info['length'], offset=info['offset'])
        for key, info in manifest['layout'].items()
    }


def terrain_sampler(directory):
    arrays = []
    transforms = []
    sources = []
    for lon, digest in TILES.items():
        path = directory / f'{lon}.tif'
        assert sha(path.read_bytes()) == digest, path
        tile = f'Copernicus_DSM_COG_10_N37_00_E{lon}_00_DEM'
        sources.append({'url': f'https://copernicus-dem-30m.s3.amazonaws.com/{tile}/{tile}.tif',
                        'sha256': digest})
        with rasterio.open(path) as dataset:
            assert dataset.crs.to_epsg() == 4326 and dataset.shape == (3600, 3600)
            arrays.append(dataset.read(1, masked=True).filled(np.nan))
            transforms.append(dataset.transform)
    west, east = transforms
    assert np.allclose([west.a, west.e, west.f, west.c + 3600 * west.a],
                       [east.a, east.e, east.f, east.c], rtol=0, atol=1e-10)
    heights = np.concatenate(arrays, axis=1)

    def sample(lon, lat):
        col = (lon - west.c) / west.a - .5
        row = (lat - west.f) / west.e - .5
        x, y = np.floor(col).astype(int), np.floor(row).astype(int)
        assert ((x >= 0) & (x + 1 < heights.shape[1]) &
                (y >= 0) & (y + 1 < heights.shape[0])).all()
        dx, dy = col - x, row - y
        return ((heights[y, x] * (1-dx) + heights[y, x+1] * dx) * (1-dy)
                + (heights[y+1, x] * (1-dx) + heights[y+1, x+1] * dx) * dy)

    return sample, sources


def estimate(data, sample, tagged):
    # Only follow contiguous segments of the same original way. Never bridge a
    # missing segment, guess across a junction, or infer a slope on stairs.
    order = np.lexsort((data['parts'], data['wayIndex']))
    starts, ends, lengths = (data[key][order] for key in ('starts', 'ends', 'lengths'))
    ways, parts, flags = (data[key][order] for key in ('wayIndex', 'parts', 'flags'))
    cut = np.flatnonzero((ways[1:] != ways[:-1]) | (parts[1:] != parts[:-1]+1) |
                         (starts[1:] != ends[:-1])) + 1
    boundaries = np.r_[0, cut, len(order)]
    coordinates = data['coordinates'].reshape(-1, 2)
    features, inspected = [], 0
    for first, last in zip(boundaries[:-1], boundaries[1:]):
        if flags[first] & 1 or lengths[first:last].sum() < SUPPORT:
            continue
        distance = np.r_[0, np.cumsum(lengths[first:last])]
        points = coordinates[np.r_[starts[first:last], ends[last-1]]]
        centers = (distance[1:] + distance[:-1]) / 2
        original = order[first:last]
        valid = (centers >= SUPPORT/2) & (centers <= distance[-1]-SUPPORT/2)
        valid &= (lengths[first:last] <= 60) & ~tagged[original]
        centers, original = centers[valid], original[valid]
        if not len(original):
            continue
        positions = centers[:, None] + np.linspace(-SUPPORT/2, SUPPORT/2, 4)
        elevation = sample(*(np.interp(positions, distance, axis) for axis in points.T))
        deltas = np.diff(elevation, axis=1)
        # Require a consistent rise or fall across each third of the window.
        consistent = (deltas > 0).all(axis=1) | (deltas < 0).all(axis=1)
        grade = np.abs(elevation[:, -1] - elevation[:, 0]) / SUPPORT * 100
        inspected += np.isfinite(grade).sum()
        for i, value in zip(original[consistent & (grade >= THRESHOLD)], grade[consistent & (grade >= THRESHOLD)]):
            a, b = data['starts'][i], data['ends'][i]
            features.append(feature(int(i), coordinates[[a, b]].tolist(), float(value), 'dem'))
    return features, int(inspected)


def feature(segment, coordinates, percent, source):
    return {'type': 'Feature', 'geometry': {'type': 'LineString', 'coordinates': coordinates},
            'properties': {'segment': segment, 'percent': round(percent, 1), 'source': source}}


def main(directory):
    manifest = json.loads((CITY / 'manifest.json').read_bytes())
    data = graph_data(manifest)
    sample, sources = terrain_sampler(directory)
    assets = NAV / 'dist/data/accessibility/seoul'
    registered = json.loads((assets / 'registered-slopes.geojson').read_bytes())
    graph_hash = manifest['assets']['graph.bin.gz']['raw_sha256']
    assert registered['metadata']['source_graph_sha256'] == graph_hash
    tagged = np.zeros(manifest['segments'], dtype=bool)
    readings = []
    for entry in registered['features']:
        p = entry['properties']
        if p['percent'] is None:
            continue
        index = p['segment']
        tagged[index] = True
        if p['percent'] >= THRESHOLD and not (data['flags'][index] & 1):
            readings.append(feature(index, entry['geometry']['coordinates'], p['percent'], 'osm'))
    estimates, inspected = estimate(data, sample, tagged)
    features = sorted(estimates + readings, key=lambda item: item['properties']['segment'])
    assert len({item['properties']['segment'] for item in features}) == len(features)
    assert all(item['properties']['percent'] >= THRESHOLD for item in features)
    assert all(item['geometry']['coordinates'] == data['coordinates'].reshape(-1, 2)[
        [data['starts'][item['properties']['segment']], data['ends'][item['properties']['segment']]]].tolist()
        for item in features)
    metadata = {'display_only': True, 'field_verified': False, 'routing_eligible': False,
                'threshold_percent': THRESHOLD, 'source_graph_sha256': graph_hash,
                'dem_resolution_m_nominal': 30, 'dem_support_m': SUPPORT,
                'sources': sources, 'attribution': CREDIT, 'osm_license': 'ODbL-1.0',
                'license_url': ('https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/'
                                'copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf'),
                'collected_date_kst': '2026-11-15'}
    asset = assets / 'steep-roads.json'
    # Use compact rows for the browser and retain the original graph segment ID.
    rows = []
    for item in features:
        (lon_a, lat_a), (lon_b, lat_b) = item['geometry']['coordinates']
        props = item['properties']
        rows.append([lon_a, lat_a, lon_b, lat_b, props['percent'], props['source'], props['segment']])
    raw = json.dumps({'schema': 'steep-roads-v1', 'metadata': metadata, 'segments': rows},
                     ensure_ascii=False, separators=(',', ':')).encode()
    asset.write_bytes(raw)
    asset.with_suffix('.json.gz').write_bytes(gzip.compress(raw, compresslevel=6, mtime=0))
    result = {'pass': True, 'inspectedTerrainSegments': inspected, 'steepTerrainSegments': len(estimates),
              'steepRegisteredSegments': len(readings), 'sourceGeometryPreserved': True,
              'newSlopeValuesPromoted': 0, **metadata}
    (NAV / 'docs/steep-road-source-results.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tile_directory', type=Path, help='Directory containing the pinned 126.tif and 127.tif')
    main(parser.parse_args().tile_directory)
