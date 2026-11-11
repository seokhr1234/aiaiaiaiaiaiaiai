"""Real PBF fixture for silent node-tag loss, exact coordinates, missing IDs."""
from pathlib import Path
import tempfile
import osmium
from recover_road_node_tags import recover

with tempfile.TemporaryDirectory() as folder:
    path = Path(folder)/'nodes.pbf'
    writer = osmium.SimpleWriter(str(path))
    writer.add_node(osmium.osm.mutable.Node(id=1, location=(127.0, 37.6), tags={'barrier': 'bollard', 'foot': 'no'}))
    writer.add_node(osmium.osm.mutable.Node(id=2, location=(127.1, 37.6)))
    writer.add_node(osmium.osm.mutable.Node(id=3, location=(127.2, 37.6), tags={'highway': 'crossing'}))
    writer.close()
    previous = {1: {'id': 1, 'lon': 127.0, 'lat': 37.6}, 2: {'id': 2, 'lon': 127.1, 'lat': 37.6},
                3: {'id': 3, 'lon': 127.2, 'lat': 37.6, 'tags': {'highway': 'crossing'}}}
    rows = []
    result = recover(osmium.io.File(str(path), 'pbf'), previous, rows.append)
    assert result['road_nodes_found'] == 3 and result['tagged_nodes_emitted'] == 2
    assert result['tagged_nodes_missing_from_intermediate'] == 1
    assert rows[0]['tags'] == {'barrier': 'bollard', 'foot': 'no'}
    assert 'tags' not in previous[1]
    for faulty in [{**previous, 9: {'id': 9, 'lon': 127.0, 'lat': 37.6}},
                   {**previous, 1: {**previous[1], 'lon': 127.5}},
                   {**previous, 3: {**previous[3], 'tags': {'highway': 'bus_stop'}}}]:
        try:
            recover(osmium.io.File(str(path), 'pbf'), faulty, lambda row: None)
        except ValueError:
            pass
        else:
            raise AssertionError('Missing nodes, coordinate drift or changed retained tags must not succeed')
print('PASS: unnamed barrier/foot denial recovered, untagged nodes explicit, missing IDs/coordinate drift/changed tags rejected, previous data immutable')
