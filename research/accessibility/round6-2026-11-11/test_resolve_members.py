"""Small real PBF fixture: nesting/cycles, missing country objects, way nodes."""
from pathlib import Path
import hashlib
import tempfile
import osmium
from resolve_members import resolve


def main():
    with tempfile.TemporaryDirectory() as folder:
        path=Path(folder)/'fixture.osm.pbf'
        writer=osmium.SimpleWriter(str(path))
        for n in [1,2,3]:writer.add_node(osmium.osm.mutable.Node(id=n,location=(127+n*.001,37.6)))
        writer.add_way(osmium.osm.mutable.Way(id=10,nodes=[1,2],tags={'highway':'footway'}))
        writer.add_way(osmium.osm.mutable.Way(id=11,nodes=[2,3],tags={'highway':'footway','access':'private'}))
        writer.add_way(osmium.osm.mutable.Way(id=12,nodes=[3,999],tags={'highway':'steps'}))
        relation={'type':'relation','id':20,'tags':{'type':'route'},'members':[{'type':'r','ref':21,'role':''},{'type':'w','ref':11,'role':''},{'type':'w','ref':404,'role':''}]}
        writer.add_relation(osmium.osm.mutable.Relation(id=20,members=[('r',21,''),('w',11,''),('w',404,'')],tags={'type':'route'}))
        writer.add_relation(osmium.osm.mutable.Relation(id=21,members=[('r',20,''),('r',22,''),('w',12,''),('n',99,'')],tags={'type':'route'}))
        writer.close()
        before=hashlib.sha256(path.read_bytes()).hexdigest()
        result=resolve(osmium.io.File(str(path),'pbf'),{1,2},{10},[relation])
        assert result['added']=={'n':1,'w':2,'r':1}
        by_id={(e['type'],e['id']):e for e in result['elements']}
        assert by_id['way',11]['tags']['access']=='private'
        assert by_id['way',12]['tags']['highway']=='steps'
        assert len(result['missing_way_nodes'])==1 and result['missing_way_nodes'][0]['nodes']==[999]
        assert {r['id'] for r in result['missing_relations']}=={20,21}
        assert next(r for r in result['missing_relations'] if r['id']==20)['original_relation']
        assert not next(r for r in result['missing_relations'] if r['id']==21)['original_relation']
        try:resolve(osmium.io.File(str(path),'pbf'),{1,2},{10},[relation],max_objects=1)
        except ValueError:pass
        else:raise AssertionError('object budget must fail before partial success')
        assert hashlib.sha256(path.read_bytes()).hexdigest()==before
    print('PASS: real PBF member recovery, recursive cycle, absent members/nodes, preserved access/steps, bounded work, immutable source')


if __name__=='__main__':main()
