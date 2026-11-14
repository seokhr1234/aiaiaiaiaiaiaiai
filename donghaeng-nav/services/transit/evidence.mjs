// Only server-owned observations can satisfy a journey requirement. Client
// coordinates, names, OSM registration and missing fields never become proof.
const time = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;
export function evidenceState(record, {at, until = at, now = Date.now()} = {}) {
  const start = time(at), end = time(until), observed = time(record?.observedAt), expires = time(record?.expiresAt);
  if (![start,end,observed,expires,now].every(Number.isFinite) || end < start || observed > Math.min(start,now)
      || expires <= Math.max(end,now) || typeof record?.source !== 'string' || !record.source.trim()) return 'unknown';
  return ['satisfied','violated'].includes(record.state) ? record.state : 'unknown';
}
export function accessRequirements(leg, profile) {
  const keys = ['stop_connection'];
  if (leg.mode === 'subway') keys.push('indoor_connection');
  if (profile.wheelchair || profile.avoidSteps) keys.push('step_free_connection');
  if (profile.wheelchair && leg.mode === 'bus') keys.push('low_floor_vehicle');
  if (profile.wheelchair) keys.push('wheelchair_space');
  if (profile.avoidSlope || profile.maxSlope != null) keys.push('surface_slope');
  return keys;
}
export function createAccessEvidence(records = [], {now = () => Date.now()} = {}) {
  if (!Array.isArray(records) || records.length > 100000) throw Error('invalid access evidence');
  const rows = structuredClone(records);
  return async (leg, {profile, atTime, untilTime = atTime, tripId, signal} = {}) => {
    signal?.throwIfAborted();
    const matches = rows.filter(r => (r.idNamespace??'ODsay')===(leg.idNamespace??'ODsay') && r.mode === leg.mode && r.fromId === leg.fromId && r.toId === leg.toId
      && leg.lines?.some(l => l.id === r.lineId));
    const checks = accessRequirements(leg,profile).map(key => {
      const live = matches.flatMap(r => r.checks?.[key] ? [r.checks[key]] : [])
        .filter(r => !['low_floor_vehicle','wheelchair_space'].includes(key) || tripId && r.tripId === tripId);
      const states = live.map(r => {const state=evidenceState(r,{at:atTime,until:untilTime,now:now()});
        if(key==='surface_slope'&&state==='satisfied'&&(!Number.isFinite(r.maxSlope)||r.maxSlope<0||r.maxSlope>(profile.maxSlope??5)))return 'unknown';
        return state});
      // Conflicting current records cannot erase negative evidence.
      return {key,state:states.includes('violated')?'violated':states.includes('satisfied')?'satisfied':'unknown'};
    });
    return {state:checks.some(c=>c.state==='violated')?'violated':checks.every(c=>c.state==='satisfied')?'satisfied':'unknown',checks};
  };
}
// A rest stop is an explicit opportunity on this itinerary, not "sitting on a
// bus". Durations include previous waits/rides; breaks reset the fatigue clock.
export function validateRestSchedule(segments, opportunities, profile, {startTime,now = Date.now()} = {}) {
  if (!profile.rest && !profile.restMinutes) return {state:'not_required',breaks:[],maxContinuousMinutes:null};
  const limit = profile.restMinutes, breaks = [], unmet = []; let elapsed = 0, lastBreak = 0, longest = 0;
  if (!Array.isArray(segments) || !Array.isArray(opportunities) || !Number.isFinite(time(startTime)))
    return {state:'unknown',breaks,reason:'rest_timeline_unknown',maxContinuousMinutes:null};
  for (const segment of segments) {
    if (!Number.isFinite(segment.minutes) || segment.minutes < 0 || segment.timingKnown !== true)
      return {state:'unknown',breaks,reason:'rest_timeline_unknown',maxContinuousMinutes:null};
    const stops = opportunities.filter(r=>r.legId===segment.id).sort((a,b)=>a.offsetMinutes-b.offsetMinutes);
    let cursor = 0;
    for (const stop of stops) {
      const offset=stop.offsetMinutes,dwell=stop.durationMinutes;
      if (!Number.isFinite(offset) || offset < cursor || offset > segment.minutes || !(dwell >= 1 && dwell <= 120)) continue;
      const arrival = new Date(time(startTime)+(elapsed+offset)*60000).toISOString();
      const until = new Date(time(arrival)+dwell*60000).toISOString();
      if (typeof segment.routeVersion!=='string' || stop.routeVersion!==segment.routeVersion || stop.connectionVerified !== true || stop.eligible !== true || !['bench','shelter'].includes(stop.kind)
          || profile.restKind && profile.restKind!=='any' && stop.kind!==profile.restKind
          || evidenceState(stop,{at:arrival,until,now})!=='satisfied') continue;
      const continuous=elapsed+offset-lastBreak;longest=Math.max(longest,continuous);
      if (limit && continuous>limit) unmet.push(segment.id);
      breaks.push({id:stop.id,legId:segment.id,atMinutes:elapsed+offset,durationMinutes:dwell,kind:stop.kind});
      // Dwell shifts all subsequent absolute arrival times.
      elapsed+=dwell;lastBreak=elapsed+offset;cursor=offset;
    }
    elapsed+=segment.minutes;
  }
  longest=Math.max(longest,elapsed-lastBreak);
  if(limit&&longest>limit)unmet.push('journey');
  return {state:unmet.length?'violated':breaks.length?'satisfied':'unknown',breaks,
    maxContinuousMinutes:longest,reason:unmet.length?'rest_interval_exceeded':breaks.length?'explicit_rest_opportunities':'rest_opportunities_missing'};
}
