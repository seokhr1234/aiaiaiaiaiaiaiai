import {walkingInput, jsonBody, point, ServiceError} from '../expansion/contracts.mjs';
import {cityWalk} from '../city-walk/router.mjs';

const fail = (status, code, message) => { throw new ServiceError(status, code, message); };
const same = (a, b) => a.every((v, i) => v === b[i]);
const invalid = () => fail(400, 'invalid_walk_review', '대중교통 도보 검토 요청의 구간·좌표를 확인해 주세요.');
const profileKeys = ['wheelchair', 'avoidSteps', 'avoidSlope', 'rest', 'short', 'restKind', 'restMinutes', 'maxSlope', 'speed'];
export function reviewInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(k => !['origin', 'destination', 'profile', 'atTime', 'candidate'].includes(k))) invalid();
  const {candidate, ...request} = value, input = walkingInput(request);
  if (!candidate || !/^T\d{1,3}$/.test(candidate.id) || Object.keys(candidate).some(k => !['id', 'legs'].includes(k))
      || !Array.isArray(candidate.legs) || !candidate.legs.length || candidate.legs.length > 20) invalid();
  const ids = new Set(), legs = candidate.legs.map(leg => {
    if (!leg || typeof leg !== 'object' || Object.keys(leg).some(k => !['id', 'mode', 'from', 'to', 'providerMinutes'].includes(k))
        || !/^T\d{1,3}-L\d{1,2}$/.test(leg.id) || !leg.id.startsWith(candidate.id + '-L') || ids.has(leg.id) || !['walk', 'bus', 'subway'].includes(leg.mode)
        || !point(leg.from) || !point(leg.to) || !Number.isFinite(leg.providerMinutes)
        || leg.providerMinutes < 0 || leg.providerMinutes > 1440) invalid();
    ids.add(leg.id); return {...leg, from: [...leg.from], to: [...leg.to]};
  });
  const vehicles = legs.map((leg, index) => ({...leg, index})).filter(l => l.mode !== 'walk');
  if (!vehicles.length || vehicles.length > 6) fail(400, 'walk_review_leg_limit', '도보 참고 계산은 승차 구간이 1~6개인 후보를 지원해요.');
  const tasks = [];
  for (let i = 0; i <= vehicles.length; i++) {
    const before = vehicles[i - 1], after = vehicles[i], from = before?.to ?? input.origin, to = after?.from ?? input.destination;
    const between = legs.slice(before ? before.index + 1 : 0, after ? after.index : legs.length);
    if (between.some(l => l.mode !== 'walk') || between.length && (!same(between[0].from, from)
        || !same(between.at(-1).to, to) || between.some((l, j) => j && !same(between[j - 1].to, l.from)))) invalid();
    tasks.push({id: 'W' + (i + 1), role: !before ? 'access' : !after ? 'egress' : 'transfer', from: [...from], to: [...to],
      providerLegIds: between.map(l => l.id), providerMinutes: between.length ? between.reduce((n, l) => n + l.providerMinutes, 0) : null,
      indoorTransferUnresolved: !!before && !!after && [before.mode, after.mode].includes('subway')});
  }
  return {...input, candidateId: candidate.id, tasks};
}

const messages = {
  same_reference_position: '같은 업체 참고 좌표입니다. 실제 승하차·환승 동선과 소요시간은 확인되지 않았어요.',
  indoor_connection_unresolved: '지하철이 포함된 환승의 출입구·역내·층위 연결이 미확인이라 도로 경로로 대체하지 않았어요.',
  walk_review_deadline: '이번 도보 계산의 시간 한도에 도달했어요. 계산하지 못한 구간은 미확인으로 남겼어요.',
  walking_geometry_limit: '도보 경로가 표시 한도를 넘어 이번 검토에 포함하지 못했어요.',
  walking_reference_unavailable: '등록 도로의 참고 경로를 계산하지 못했어요. 연결 가능 여부는 미확인입니다.'
};
const safeCodes = new Set(['outside_city_coverage', 'city_slope_evidence_required', 'city_rest_evidence_required',
  'city_endpoint_unresolved', 'city_no_connected_route', 'same_endpoint', 'city_route_timeout', 'city_graph_unavailable']);
const routeKeys = ['schema', 'state', 'datasetVersion', 'sourceMetadata', 'profile', 'origin', 'destination', 'coordinates',
  'sourceNodeIds', 'sourceSegments', 'distanceMeters', 'minutes', 'endpointGaps', 'unknownInclineMeters', 'registeredInclineMax',
  'stepsMeters', 'fieldVerified', 'accessibilityVerified', 'endpointConnectionsVerified', 'restVerified'];
export function createWalkReviewService({walk = (input, options) => cityWalk.route(input, options), budgetMs = 12000} = {}) {
  return {async review(value, {signal} = {}) {
    const input = reviewInput(value), started = Date.now(), controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) fail(499, 'cancelled', '계산을 취소했어요.');
    signal?.addEventListener('abort', abort, {once: true});
    const timer = setTimeout(abort, budgetMs), walkingLegs = []; let points = 0;
    try {
      for (const task of input.tasks) {
        if (signal?.aborted) fail(499, 'cancelled', '계산을 취소했어요.');
        const item = {...task, state: 'unresolved', endpointMappingVerified: false};
        const remaining = budgetMs - (Date.now() - started);
        let code = controller.signal.aborted || remaining <= 0 ? 'walk_review_deadline'
          : task.indoorTransferUnresolved ? 'indoor_connection_unresolved'
          : same(task.from, task.to) ? 'same_reference_position' : null;
        if (!code) {
          try {
            const route = await walk({origin: task.from, destination: task.to, profile: {...input.profile}, atTime: input.atTime},
              {signal: controller.signal, timeoutMs: Math.min(8000, remaining)});
            if (signal?.aborted) fail(499, 'cancelled', '계산을 취소했어요.');
            if (controller.signal.aborted || Date.now() - started >= budgetMs) code = 'walk_review_deadline';
            else if (route?.schema !== 'donghaeng-city-walk-v1' || route.state !== 'reference_route'
                || route.fieldVerified !== false || route.accessibilityVerified !== false || route.endpointConnectionsVerified !== false || route.restVerified !== false
                || profileKeys.some(k => route.profile?.[k] !== input.profile[k])
                || !point(route.origin) || !point(route.destination) || !same(route.origin, task.from) || !same(route.destination, task.to)
                || !Number.isFinite(route.minutes) || route.minutes < 0 || !Number.isFinite(route.distanceMeters) || route.distanceMeters <= 0
                || !Array.isArray(route.coordinates) || route.coordinates.length < 2 || !route.coordinates.every(point)
                || route.sourceNodeIds?.length !== route.coordinates.length || route.sourceSegments?.length !== route.coordinates.length - 1
                || !Array.isArray(route.endpointGaps) || route.endpointGaps.length !== 2 || route.endpointGaps.some(v => !Number.isFinite(v) || v < 0 || v > 80)) code = 'walking_reference_unavailable';
            else if (route.coordinates.length > 4000 || points + route.coordinates.length > 12000) code = 'walking_geometry_limit';
            else {points += route.coordinates.length; item.state = 'reference_route'; item.route = Object.fromEntries(routeKeys.map(k => [k, route[k]]));}
          } catch (e) {
            if (signal?.aborted) fail(499, 'cancelled', '계산을 취소했어요.');
            code = controller.signal.aborted ? 'walk_review_deadline' : safeCodes.has(e.code) ? e.code : 'walking_reference_unavailable';
            // Only local, known city-service errors have public messages. Never forward arbitrary exception text.
            if (safeCodes.has(e.code) && e instanceof ServiceError) item.notice = e.message;
          }
        }
        if (code) {item.code = code; item.notice ||= messages[code] || messages.walking_reference_unavailable;}
        walkingLegs.push(item);
      }
      const calculated = walkingLegs.filter(l => l.state === 'reference_route');
      return {schema: 'donghaeng-transit-walk-review-v1', candidateId: input.candidateId, state: 'review_only',
        referenceSource: 'client_supplied_provider_reference_points', origin: input.origin, destination: input.destination,
        profile: input.profile, requestedAtTime: input.atTime, observedAt: new Date().toISOString(), walkingLegs,
        summary: {total: walkingLegs.length, calculated: calculated.length, unresolved: walkingLegs.length - calculated.length,
          estimatedWalkingMinutes: calculated.length === walkingLegs.length ? calculated.reduce((n, l) => n + l.route.minutes, 0) : null},
        stopMappingVerified: false, timetableVerified: false, accessibilityVerified: false, restVerified: false, fieldVerified: false,
        notice: '등록 도로의 도보 참고 계산입니다. 업체 승하차 위치와 실제 출입구·역내 연결, 운행편·환승 가능 여부는 미확인입니다.'};
    } finally {clearTimeout(timer); signal?.removeEventListener('abort', abort);}
  }};
}

export function createWalkReviewHandler({service = createWalkReviewService()} = {}) {
  let active = 0;
  return async (req, res) => {
    const controller = new AbortController(), abort = () => controller.abort(); let acquired = false;
    const send = (status, value) => {if (res.destroyed) return; res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}); res.end(JSON.stringify(value));};
    try {
      if (req.headers.origin && !['http://' + req.headers.host, 'https://' + req.headers.host].includes(req.headers.origin)) fail(403, 'origin_not_allowed', '이 서비스 화면에서 다시 시도해 주세요.');
      if (req.method !== 'POST') fail(405, 'method_not_allowed', 'POST 요청을 사용해 주세요.');
      const input = await jsonBody(req, 32768); reviewInput(input);
      if (active) fail(429, 'walk_review_busy', '다른 대중교통 도보 구간을 계산하고 있어요. 잠시 후 다시 시도해 주세요.');
      active++; acquired = true; req.once('aborted', abort); res.once('close', abort);
      send(200, await service.review(input, {signal: controller.signal}));
    } catch (e) {send(e.status || 503, {code: e.status ? e.code : 'walking_reference_unavailable', error: e.status ? e.message : messages.walking_reference_unavailable});}
    finally {if (acquired) active--; req.removeListener('aborted', abort); res.removeListener('close', abort);}
  };
}
