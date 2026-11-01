const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
let pw;
try { pw = require('playwright'); } catch {
  pw = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'donghaeng-nav/docs');
const chrome = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
const transparent = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const tilePattern = 'https://tile.openstreetmap.org/**';
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('#find-route').disabled, null, {timeout:60000});
}
async function settled(page) {
  await page.waitForFunction(() => !map._animatingZoom && !map._panAnim?._inProgress);
  await page.waitForTimeout(200);
}
async function main() {
  const {createApp} = await import(pathToFileURL(path.join(root, 'donghaeng-nav/server.mjs')));
  const app = createApp(); // Never spend the user's Gemini key in UI regression tests.
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + app.address().port;
  let browser;
  const checks = [], errors = [];
  try {
    browser = await pw.chromium.launch({headless:true, executablePath:chrome});
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    let actualTiles = 0, tileReferer = false;
    page.on('response', response => { if (response.url().startsWith('https://tile.openstreetmap.org/') && response.ok()) actualTiles++; });
    page.on('request', request => { if (request.url().startsWith('https://tile.openstreetmap.org/')) tileReferer ||= Boolean(request.headers().referer); });
    await page.goto(base);
    await ready(page);
    await page.waitForFunction(() => document.querySelector('.map-source-control span').dataset.mode === 'online', null, {timeout:30000});
    assert(actualTiles > 0, 'real OSM tiles must load');
    assert(tileReferer, 'web tiles must carry a Referer');
    assert.equal(await page.locator('.seoul-base-canvas, .leaflet-embeddedBase-pane, .leaflet-embeddedLabels-pane').count(), 0);
    assert.equal(await page.locator('.leaflet-tile-pane > .leaflet-layer').count(), 1, 'one online background');
    await page.evaluate(() => facilityController.setAll(false));
    const box = await page.locator('#live-map').boundingBox();
    const x = box.x + box.width * .6, y = box.y + box.height * .43;
    const before = await page.evaluate(() => [map.getCenter().lat,map.getCenter().lng]);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 110, y + 40, {steps:15}); await page.mouse.up();
    await settled(page);
    const after = await page.evaluate(() => [map.getCenter().lat,map.getCenter().lng]);
    assert.notDeepEqual(before, after, 'drag changes map center');
    const anchor = await page.evaluate(({x,y}) => {const r=map.getContainer().getBoundingClientRect(); const point=map.containerPointToLatLng([x-r.left,y-r.top]); return [point.lat,point.lng];}, {x,y});
    const zoomBefore = await page.evaluate(() => map.getZoom());
    await page.mouse.move(x,y); await page.mouse.wheel(0,-160); await page.waitForTimeout(600); await settled(page);
    assert((await page.evaluate(() => map.getZoom())) > zoomBefore, 'wheel zoom changes zoom');
    const drift = await page.evaluate(({anchor,x,y}) => {const p=map.latLngToContainerPoint(anchor),r=map.getContainer().getBoundingClientRect(); return Math.hypot(p.x+r.left-x,p.y+r.top-y);}, {anchor,x,y});
    assert(drift < 4, 'wheel stays anchored at cursor');
    await page.locator('.leaflet-control-zoom-out').click(); await settled(page);
    await page.locator('#school-reset').click();
    await page.locator('#condition').fill('가장 짧은 길로 가고 싶어요.');
    await page.locator('#find-route').click();
    await page.waitForFunction(() => routes.length && !document.querySelector('#find-route').disabled);
    const routeIds = await page.evaluate(() => routes[0].ids.join(','));
    await page.evaluate(() => facilityController.setAll(true));
    assert.equal(await page.evaluate(() => routes[0].ids.join(',')), routeIds);
    await page.locator('#present-mode').click(); await settled(page);
    await page.screenshot({path:path.join(out,'osm-tiles-desktop.png')});
    checks.push('real OSM tiles with Referer', 'one background', 'mouse drag', 'cursor-anchored wheel zoom', 'zoom buttons', 'route calculation and facility-toggle independence', 'presentation mode');
    await page.locator('#present-mode').click();
    // Deterministic outage/recovery; no repeated external test traffic.
    await context.route(tilePattern, route => route.abort());
    await page.evaluate(() => {for(const layer of Object.values(map._layers)) if(layer instanceof L.TileLayer) layer.redraw();});
    await page.waitForFunction(() => document.querySelector('.map-source-control span').dataset.mode === 'fallback');
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-tile-pane canvas.leaflet-tile').length > 0);
    await page.evaluate(() => map.setZoom(16)); await settled(page);
    assert.equal(await page.evaluate(() => routes[0].ids.join(',')), routeIds);
    await page.screenshot({path:path.join(out,'osm-tiles-fallback.png')});
    await context.unroute(tilePattern);
    await context.route(tilePattern, route => route.fulfill({status:200,contentType:'image/png',body:transparent}));
    await page.getByRole('button',{name:'다시 연결',exact:true}).click();
    await page.waitForFunction(() => document.querySelector('.map-source-control span').dataset.mode === 'online');
    assert.equal(await page.locator('.leaflet-tile-pane canvas.leaflet-tile').count(), 0, 'remove fallback when recovered');
    checks.push('tile failure fallback', 'fallback zoom', 'route preserved through outage', 'retry removes fallback');
    await context.setOffline(true);
    await page.waitForFunction(() => /오프라인/.test(document.querySelector('.map-source-control span').textContent));
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelector('.map-source-control span').dataset.mode === 'online');
    checks.push('offline/online recovery');
    await page.setViewportSize({width:390,height:844});
    await page.locator('#sheet-toggle').click(); await settled(page);
    assert(await page.evaluate(() => {const r=map.getContainer().getBoundingClientRect(),s=map.getSize();return Math.abs(r.width-s.x)<1&&Math.abs(r.height-s.y)<1}));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push('390px mobile sheet and map resize');
    await page.goto(base+'/app/'); await ready(page);
    assert.equal(await page.locator('.seoul-base-canvas, .leaflet-embeddedBase-pane').count(),0);
    await page.waitForFunction(() => document.querySelector('.map-source-control span').dataset.mode === 'online');
    checks.push('split source matches bundled HTML');
    // file:// keeps all data local and does not issue tile requests without Referer.
    const fileContext = await browser.newContext({viewport:{width:1440,height:1000}});
    const external = [];
    await fileContext.route(/^https?:/, route => {external.push(route.request().url());return route.abort()});
    const filePage = await fileContext.newPage(); filePage.on('pageerror',error=>errors.push(error.message));
    await filePage.goto(pathToFileURL(path.join(root,'동행길-최종.html')).href); await ready(filePage);
    await filePage.waitForFunction(() => document.querySelectorAll('.leaflet-tile-pane canvas.leaflet-tile').length > 0);
    assert.equal(await filePage.locator('.leaflet-tile-pane > .leaflet-layer').count(),1);
    await filePage.locator('.leaflet-control-zoom-out').click(); await settled(filePage);
    assert.equal(await filePage.evaluate(() => Object.values(map._layers).find(l=>l instanceof L.GridLayer)._tileZoom), await filePage.evaluate(() => map.getZoom()));
    assert.deepEqual(external,[]); checks.push('file mode single GridLayer, zoom and zero external requests');
    // Empty/missing fallback data must not prevent the graph from becoming usable.
    const badContext = await browser.newContext();
    await badContext.route(tilePattern, route=>route.abort());
    await badContext.route('**/data/accessibility/seoul/seoul-base.json',route=>route.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
    const badPage=await badContext.newPage();badPage.on('pageerror',error=>errors.push(error.message));
    await badPage.goto(base+'/app/');await ready(badPage);
    await badPage.waitForFunction(()=>document.querySelector('.map-source-control span').dataset.mode==='error');
    checks.push('empty fallback data leaves route controls usable');
    assert.deepEqual(errors,[]);
    const result={pass:true,actualTiles,cursorDriftPixels:drift,checks,pageErrors:errors};
    fs.writeFileSync(path.join(out,'map-tiles-results.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  } finally {await browser?.close();app.closeAllConnections();await new Promise(resolve=>app.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
