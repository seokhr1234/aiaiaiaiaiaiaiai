import urllib.request,urllib.parse,json
from pathlib import Path
q='''[out:json][timeout:45];(way[highway](37.580,127.020,37.611,127.058);nwr[amenity~"bench|cafe|library|school|community_centre|shelter"](37.584,127.025,37.607,127.053);node[highway=bus_stop](37.584,127.025,37.607,127.053););out body center;>;out body qt;'''
u='https://overpass-api.de/api/interpreter'
r=urllib.request.urlopen(urllib.request.Request(u,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'DonghaengSchoolMVP/1.0'}),timeout=65)
data=json.load(r)
Path('dist/map-data.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
print('elements',len(data['elements']))
