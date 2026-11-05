(function(root){'use strict';
function attach(graph,data){
 if(data?.version!==1||data.graph_sha256!==graph.meta.graphSha256||data.routing_eligible!==false||data.field_verified!==false||data.new_slope_values_promoted!==0||!data.edges)throw Error('추가 지형 근거의 버전·도로망을 확인하지 못했어요.');
 for(const item of Object.values(data.edges))if(!Number.isFinite(item.nearestSpotMeters)||item.nearestSpotMeters<0||!Number.isInteger(item.spotsWithin100m)||item.spotsWithin100m<0||!Array.isArray(item.supports)||item.supports.length>3||item.supports.some(s=>!Number.isFinite(s.distanceMeters)||s.distanceMeters<0||s.distanceMeters>100||!Number.isFinite(s.sourceHeight)))throw Error('추가 표고 근거 형식이 올바르지 않아요.');
 graph.meta.terrainEvidence=data;return data;
}
function describe(graph,edge){const item=graph.meta.terrainEvidence?.edges[edge.parentKey||edge.key];if(!item)return '추가 표고 근거 없음';if(item.structureExcluded)return '구조물 구간 · 주변 지형을 노면 고도로 사용할 수 없음';return item.spotsWithin100m?'구간 중앙 주변 100m 내 표고점 '+item.spotsWithin100m+'개 · 가장 가까운 표고점 '+Math.round(item.nearestSpotMeters)+'m · 보도 실측 아님':'구간 중앙 주변 100m 내 표고점 없음 · 지형 근거 부족'}
const api={attach,describe};if(typeof module!=='undefined')module.exports=api;else root.TerrainEvidence=api;
})(typeof globalThis==='undefined'?this:globalThis);
