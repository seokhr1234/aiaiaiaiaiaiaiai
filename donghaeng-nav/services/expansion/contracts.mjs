export class ServiceError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new ServiceError(status, code, message); };
export function point(value) {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180;
}
export function bbox(value) {
  if (typeof value !== 'string') fail(400, 'invalid_bbox', '지도 범위를 지정해 주세요.');
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some(v => !v.trim())) fail(400, 'invalid_bbox', '범위는 서쪽,남쪽,동쪽,북쪽 순서예요.');
  const [west, south, east, north] = parts.map(Number);
  if (![west,south,east,north].every(Number.isFinite) || west >= east || south >= north || west < -180 || east > 180 || south < -90 || north > 90)
    fail(400, 'invalid_bbox', '지도 범위를 확인해 주세요.');
  if (east-west > .3 || north-south > .3) fail(413, 'area_too_large', '지도를 확대해서 자료를 요청해 주세요.');
  return {west,south,east,north};
}
export function integer(value, fallback, max) {
  if (value === null || value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) > max) fail(400, 'invalid_limit', '요청 건수·페이지를 확인해 주세요.');
  return Number(value);
}
export function walkingInput(input) {
  if (!input || Array.isArray(input) || Object.keys(input).some(k => !['origin','destination','profile','atTime'].includes(k)) || !point(input.origin) || !point(input.destination))
    fail(400, 'invalid_route', '출발·목적지 좌표를 확인해 주세요.');
  const p = input.profile ?? {};
  const flags = ['wheelchair','avoidSteps','avoidSlope','rest','short','recognized'];
  const keys = [...flags,'raw','source','restKind','restMinutes','maxSlope','speed'];
  if (!p || Array.isArray(p) || typeof p !== 'object' || Object.keys(p).some(k => !keys.includes(k))
      || flags.some(k => k in p && typeof p[k] !== 'boolean')
      || ['raw','source'].some(k => k in p && (typeof p[k] !== 'string' || p[k].length > 500))
      || p.restKind !== undefined && !['any','bench','shelter'].includes(p.restKind)
      || p.maxSlope != null && (!Number.isFinite(p.maxSlope) || p.maxSlope < 0 || p.maxSlope > 45)
      || p.restMinutes != null && (!Number.isInteger(p.restMinutes) || p.restMinutes < 1 || p.restMinutes > 120)
      || p.speed !== undefined && (!Number.isFinite(p.speed) || p.speed < 20 || p.speed > 120))
    fail(400, 'invalid_profile', '이동 조건 형식을 확인해 주세요.');
  const atTime = input.atTime ?? new Date().toISOString();
  if (typeof atTime !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(atTime) || !Number.isFinite(Date.parse(atTime)))
    fail(400, 'invalid_time', '시간대가 포함된 출발 시각이 필요해요.');
  const profile={wheelchair:false,avoidSteps:false,avoidSlope:false,rest:false,short:false,restKind:'any',restMinutes:null,maxSlope:null,speed:p.wheelchair?55:65,...p};
  // Same conservative wheelchair policy as the existing browser engine; this
  // normalizes the effective constraints before transit/worker comparisons.
  if(profile.wheelchair){profile.avoidSteps=true;profile.avoidSlope=true;profile.short=false;profile.maxSlope=Math.min(profile.maxSlope??5,5)}
  return {origin:[...input.origin],destination:[...input.destination],atTime,profile};
}
export async function jsonBody(req, limit = 8192) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, 'json_required', 'JSON 요청을 사용해 주세요.');
  if (req.body !== undefined) {
    const raw=Buffer.isBuffer(req.body)?req.body.toString('utf8'):req.body;
    if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > limit) fail(413, 'body_too_large', '요청이 너무 커요.');
    try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { fail(400, 'invalid_json', 'JSON 형식을 확인해 주세요.'); }
  }
  let size = 0; const parts = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) fail(413, 'body_too_large', '요청이 너무 커요.'); parts.push(chunk); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { fail(400, 'invalid_json', 'JSON 형식을 확인해 주세요.'); }
}
