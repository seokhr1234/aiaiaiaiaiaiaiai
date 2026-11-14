// Server-owned, explicit service-date snapshots. No network requests, inferred
// weekday/holiday calendars, name matching, or client-supplied timetable data.
import {ServiceError} from '../expansion/contracts.mjs';

const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
  && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value));
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
function seconds(value) {
  if (typeof value !== 'string' || !/^(?:[0-3]\d|4[0-7]):[0-5]\d:[0-5]\d$/.test(value)) return null;
  const [h, m, s] = value.split(':').map(Number); return h * 3600 + m * 60 + s;
}
const unknown = reason => ({state: 'unknown', reason, realtimeVerified: false});
export function createLocalTimetable(snapshot, {now = () => Date.now()} = {}) {
  const invalid = () => {throw new ServiceError(503, 'invalid_timetable_snapshot', '시간표 자료의 출처·운행일·구간을 확인해 주세요.');};
  if (snapshot?.schema !== 'donghaeng-local-timetable-v1' || snapshot.timezone !== 'Asia/Seoul'
      || !id(snapshot.version) || typeof snapshot.source !== 'string' || !snapshot.source.trim()
      || !instant(snapshot.observedAt) || !instant(snapshot.expiresAt)
      || Date.parse(snapshot.expiresAt) <= Date.parse(snapshot.observedAt)
      || !Array.isArray(snapshot.trips) || snapshot.trips.length > 100000) invalid();
  // Copy and index once: callers cannot mutate a validated snapshot afterwards.
  const byLeg = new Map(), ids = new Set(), namespace=snapshot.idNamespace??'ODsay';
  if(!/^[a-zA-Z0-9:_-]{1,80}$/.test(namespace)) invalid();
  const key = (mode, line, from, to) => JSON.stringify([mode, line, from, to]);
  for (const row of snapshot.trips) {
    const dep = seconds(row?.departs), arr = seconds(row?.arrives);
    if (!id(row?.id) || ids.has(row.id) || !['bus', 'subway'].includes(row.mode)
        || row.idNamespace !== namespace || ![row.lineId, row.fromId, row.toId].every(id)
        || row.fromId === row.toId || !date(row.serviceDate) || dep === null || arr === null || arr <= dep) invalid();
    ids.add(row.id);
    const midnight = Date.parse(row.serviceDate + 'T00:00:00+09:00');
    const item = {id: row.id, serviceDate: row.serviceDate, dep: midnight + dep * 1000, arr: midnight + arr * 1000};
    const k = key(row.mode, row.lineId, row.fromId, row.toId);
    if (!byLeg.has(k)) byLeg.set(k, []); byLeg.get(k).push(item);
  }
  for (const trips of byLeg.values()) trips.sort((a, b) => a.dep - b.dep || a.arr - b.arr);
  const {version, source, observedAt, expiresAt} = snapshot;
  return async function boarding(leg, {earliestBoardingAt, signal} = {}) {
    signal?.throwIfAborted();
    if (!instant(earliestBoardingAt)) return unknown('boarding_time_unknown');
    const earliest = Date.parse(earliestBoardingAt), current = now();
    if (!Number.isFinite(current) || Date.parse(observedAt) > Math.min(current, earliest)
        || Date.parse(expiresAt) <= Math.max(current, earliest)) return unknown('timetable_missing_or_stale');
    if ((leg.idNamespace??'ODsay')!==namespace || !id(leg.fromId) || !id(leg.toId) || !Array.isArray(leg.lines)) return unknown('stop_or_line_id_unmapped');
    // Subway numeric codes and line names are not equivalent to ODsay line IDs.
    const lines = leg.lines.map(l => l.id).filter(id);
    let selected;
    for (const line of lines) {
      const trips = byLeg.get(key(leg.mode, line, leg.fromId, leg.toId)) || [];
      let lo = 0, hi = trips.length;
      while (lo < hi) {const mid = (lo + hi) >>> 1; if (trips[mid].dep < earliest) lo = mid + 1; else hi = mid;}
      const trip = trips[lo];
      if (trip && trip.arr < Date.parse(expiresAt) && (!selected || trip.arr < selected.arr)) selected = trip;
    }
    if (!selected) return unknown(lines.length ? 'no_service_in_snapshot' : 'stop_or_line_id_unmapped');
    return {state: 'satisfied', departsAt: new Date(selected.dep).toISOString(), arrivesAt: new Date(selected.arr).toISOString(),
      tripId: selected.id, serviceDate: selected.serviceDate, source, datasetVersion: version, observedAt, expiresAt,
      evidenceKind: 'scheduled_snapshot', realtimeVerified: false, notice: '자료에 기록된 운행 시각입니다. 실제 지연·운휴·승차 가능 여부는 미확인입니다.'};
  };
}
