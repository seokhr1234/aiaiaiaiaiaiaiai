import {point, walkingInput, ServiceError} from '../expansion/contracts.mjs';

const profileKeys = ['wheelchair','avoidSteps','avoidSlope','rest','short','restKind','restMinutes','maxSlope','speed'];
const same = (a, b) => a.every((v, i) => v === b[i]);
const instant = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
// A reference duration may keep a diagnostic cursor moving, but cannot prove a
// later boarding or arrival. Unknown timing propagates through the whole trip.
export async function validateJourney(candidate, value, {walk, boarding, access, now = () => Date.now(), signal} = {}) {
  const input = walkingInput(value), ids = new Set();
  if (!candidate || !Array.isArray(candidate.legs) || !candidate.legs.length || candidate.legs.length > 60
      || candidate.legs.some(l => !l || typeof l.id !== 'string' || !l.id || ids.has(l.id) || !ids.add(l.id)
        || !['walk','bus','subway'].includes(l.mode) || !point(l.from) || !point(l.to)
        || !Number.isFinite(l.providerMinutes) || l.providerMinutes < 0 || l.providerMinutes > 1440))
    throw new ServiceError(502, 'invalid_journey', '여정 구간 형식을 확인하지 못했어요.');
  const checks = [], legs = [], profile = {...input.profile}, start = Date.parse(input.atTime);
  let at = start, timelineKnown = true, providerElapsed = 0, restConfirmed = false;
  const add = (key, state, leg, reason) => checks.push({key, state, legId: leg.id, reason});
  const attempt = async (callback, ...args) => {
    signal?.throwIfAborted();
    try {const result = await callback?.(...args); signal?.throwIfAborted(); return result;}
    catch (e) {signal?.throwIfAborted(); return null;}
  };
  for (const [i, leg] of candidate.legs.entries()) {
    signal?.throwIfAborted();
    // Do not inherit stale validation/arrival fields from a previous result.
    const {walking, departsAt, arrivesAt, estimatedEndsAt, ...next} = leg;
    const previous = i ? candidate.legs[i - 1].to : input.origin;
    if (!same(previous, leg.from)) {add('connection', 'unknown', leg, 'leg_connection_missing'); timelineKnown = false;}
    if (leg.mode === 'walk') {
      const r = await attempt(walk, {origin: [...leg.from], destination: [...leg.to], profile: {...profile},
        atTime: new Date(at).toISOString()}, {signal, timeVerified: timelineKnown});
      const matched = r?.profile && profileKeys.every(k => r.profile[k] === profile[k]);
      if (!matched || !Number.isFinite(r.minutes) || r.minutes < 0 || r.minutes > 1440) {
        add('walking', 'unknown', leg, 'walking_or_profile_not_verified'); timelineKnown = false; at += leg.providerMinutes * 60000;
      } else {
        next.walking = r;
        const state = ['satisfied','violated'].includes(r.state) ? r.state : 'unknown';
        add('walking', state, leg, 'walking_connection_and_conditions');
        if (state !== 'satisfied') timelineKnown = false;
        at += r.minutes * 60000;
        if (state === 'satisfied' && r.restWaypointEligible === true) restConfirmed = true;
      }
    } else {
      const earliest = at, knownBefore = timelineKnown;
      const evidence = await attempt(access, leg, {profile: {...profile}, atTime: new Date(at).toISOString(), signal});
      const departure = await attempt(boarding, leg, {earliestBoardingAt: knownBefore ? new Date(at).toISOString() : null,
        referenceEarliestBoardingAt: new Date(at).toISOString(), profile: {...profile}, signal});
      const dep = instant(departure?.departsAt) ? Date.parse(departure.departsAt) : NaN;
      const arr = instant(departure?.arrivesAt) ? Date.parse(departure.arrivesAt) : NaN;
      if (departure?.state === 'violated') {
        add('schedule', 'violated', leg, 'service_not_boardable'); timelineKnown = false; at += leg.providerMinutes * 60000;
      } else if (knownBefore && departure?.state === 'satisfied' && dep >= at && arr >= dep && arr - dep <= 86400000) {
        at = arr; next.departsAt = new Date(dep).toISOString(); next.arrivesAt = new Date(arr).toISOString();
        add('schedule', 'satisfied', leg, 'service_after_recomputed_walk');
        if (departure.realtimeVerified !== true) add('service_status', 'unknown', leg, 'delay_or_cancellation_unverified');
      } else {
        add('schedule', 'unknown', leg, knownBefore ? 'boarding_schedule_missing_or_departed' : 'upstream_timing_unknown');
        timelineKnown = false; at += leg.providerMinutes * 60000;
      }
      // Evidence must cover waiting and the entire ride/connection, not only the
      // instant at which the adapter was queried.
      const current = now(), observed = instant(evidence?.observedAt) ? Date.parse(evidence.observedAt) : NaN;
      const expires = instant(evidence?.expiresAt) ? Date.parse(evidence.expiresAt) : NaN;
      const fresh = knownBefore && Number.isFinite(current) && observed <= Math.min(current, earliest) && expires > Math.max(current, at);
      const requiresAccess = profile.wheelchair || profile.avoidSteps || profile.avoidSlope || profile.maxSlope != null;
      add(requiresAccess ? 'accessibility' : 'boarding_connection', fresh && ['satisfied','violated'].includes(evidence.state) ? evidence.state : 'unknown',
        leg, fresh ? 'boarding_and_indoor_connection' : 'accessibility_missing_or_stale');
    }
    providerElapsed += leg.providerMinutes * 60000;
    next.estimatedEndsAt = timelineKnown ? new Date(at).toISOString() : null;
    legs.push(next);
  }
  if (!same(candidate.legs.at(-1).to, input.destination)) {
    add('destination_connection', 'unknown', candidate.legs.at(-1), 'destination_connection_missing'); timelineKnown = false;
  }
  if (profile.rest) add('rest', restConfirmed ? 'satisfied' : 'unknown', {id:'journey'}, 'vehicle_riding_is_not_rest_confirmation');
  if (profile.restMinutes) add('rest_interval', 'unknown', {id:'journey'}, 'repeated_rest_schedule_not_implemented');
  const state = checks.some(c => c.state === 'violated') ? 'violated' : checks.some(c => c.state === 'unknown') ? 'unknown' : 'satisfied';
  const scheduleVerified = timelineKnown && !checks.some(c => ['schedule','service_status'].includes(c.key) && c.state !== 'satisfied');
  const arrivalKnown = scheduleVerified && state === 'satisfied';
  return {...candidate, profile, legs, checks, validationState: state, state: state === 'satisfied' ? 'validated_candidate' : 'review_only',
    fieldVerified: false, timeFeasibility: arrivalKnown ? 'verified_by_adapters' : 'unknown', timetableVerified: scheduleVerified,
    estimatedMinutes: arrivalKnown ? (at - start) / 60000 : null, providerLegMinutes: providerElapsed / 60000,
    estimatedArrival: arrivalKnown ? new Date(at).toISOString() : null,
    notice: state === 'satisfied' ? '기록된 조건·시각 검사 통과 · 현장 안전 인증 아님' : '보행·접근성·환승 시각의 미확인 항목이 있어요.'};
}
