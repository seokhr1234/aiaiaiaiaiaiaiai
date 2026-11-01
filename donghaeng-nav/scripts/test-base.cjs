'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),B=require('../dist/seoul-base.js');
const root=path.join(__dirname,'..'),data=JSON.parse(fs.readFileSync(path.join(root,'dist/data/accessibility/seoul/seoul-base.json'),'utf8'));
assert(data.counts.road>10000);assert(data.counts.green>0);assert(data.features.every(f=>Array.isArray(f.b)&&f.b.length===4&&Number.isFinite(f.z)));
const world={west:126.7,east:127.3,south:37.3,north:37.8};assert(B.visible(data,18,world).length>B.visible(data,11,world).length,'street detail appears at larger zoom');assert.equal(B.visible(data,18,{west:0,east:1,south:0,north:1}).length,0);
const app=fs.readFileSync(path.join(root,'dist/app.js'),'utf8'),html=fs.readFileSync(path.join(root,'../동행길-시연.html'),'utf8');assert(!app.includes('tile.openstreetmap.org'));assert(!html.includes('https://tile.openstreetmap.org/'));assert(html.includes('bundled-seoul-base'));assert(html.includes('인터넷 없이 표시'));console.log('PASS: offline Seoul basemap data, zoom/viewport filtering, no external OSM tile requests, standalone embedding.');console.log(data.counts);
