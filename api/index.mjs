import {createCityWalkHandler} from '../donghaeng-nav/services/city-walk/router.mjs';
import {createConditionHandler, DEFAULT_GEMINI_MODEL} from '../donghaeng-nav/scripts/condition-api.mjs';
import {createExpansionProxy} from '../donghaeng-nav/services/expansion/proxy.mjs';
import {expansionPaths} from '../donghaeng-nav/services/expansion/routes.mjs';
import {createTransitEdgeHandler} from '../donghaeng-nav/services/transit/edge.mjs';
import publicCoverage from '../donghaeng-nav/services/expansion/public-coverage.mjs';
import {createReviewPointsHandler} from '../donghaeng-nav/services/expansion/review-points.mjs';

const expansion=createExpansionProxy({getConfig:()=>({baseUrl:process.env.DONGHAENG_BACKEND_URL||'',token:process.env.DONGHAENG_BACKEND_TOKEN||''})});
const transit=createTransitEdgeHandler({getConfig:()=>({apiKey:process.env.ODSAY_API_KEY||'',enabled:process.env.DONGHAENG_TRANSIT_ENABLED!=='false',dailyLimit:Number(process.env.ODSAY_DAILY_LIMIT||20)})});
const review=createReviewPointsHandler();
const city=createCityWalkHandler();

const handle = createConditionHandler({
  getConfig: () => ({
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
  })
});

export default function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // Rewrites carry the route when Vercel supplies the destination URL.
  const route = ['/api/routes/city-walk','/api/city/coverage','/api/status', '/api/analyze-condition', '/api/select-route',...expansionPaths].includes(url.pathname)
    ? url.pathname
    : url.pathname === '/api/index' ? `/api/${url.searchParams.get('route') || ''}` : '';
  if(['/api/routes/city-walk','/api/city/coverage'].includes(route))return city(req,res,route);
  if(['/api/routes/transit','/api/transit/status'].includes(route))return transit(req,res,route);
  if(route==='/api/features'&&url.searchParams.get('layer')==='osm-review')return review(req,res);
  if(route==='/api/coverage'&&!process.env.DONGHAENG_BACKEND_URL){
    if(req.method!=='GET'){res.statusCode=405;res.end();return}
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    return res.end(JSON.stringify({...publicCoverage,transit:{...publicCoverage.transit,state:process.env.ODSAY_API_KEY&&process.env.DONGHAENG_TRANSIT_ENABLED!=='false'?'reference_candidates_only':'not_configured'}}));
  }
  return expansionPaths.includes(route)?expansion(req,res,route):handle(req, res, route);
}
