// Adds Chamados routes and navigation while retaining the production Container and handlers.
import production from './preserved-production.mjs';
import { handleSuiteLauncher } from '../worker/suite-launcher.js';
import { handleChamadosIntegration } from '../worker/integration-router.js';
import { handleChamadosNavigation, injectChamadosNavigation,
  prepareChamadosNavigationRequest } from '../worker/navigation.js';
import { withPreservedChamadosApp } from '../worker/legacy-access-preservation.js';
export { CentroCustosApi } from './preserved-production.mjs';

const retained = Object.fromEntries(Object.entries(production).map(([name,value]) =>
  [name,typeof value === 'function' ? value.bind(production) : value]));
export default {
  ...retained,
  async fetch(request,env,ctx) {
    let integrated;
    try {
      integrated = handleSuiteLauncher(request)
        ?? handleChamadosNavigation(request,env)
        ?? await handleChamadosIntegration(request,env,ctx);
    } catch {
      return Response.json({ok:false,error:'Falha na integração Chamados.'},
        {status:500,headers:{'cache-control':'no-store'}});
    }
    if(integrated !== undefined) return integrated;
    const originalRequest = prepareChamadosNavigationRequest(request,env);
    const response = await withPreservedChamadosApp(originalRequest,env,
      (retainedRequest,retainedEnv) => production.fetch(retainedRequest,retainedEnv,ctx));
    return injectChamadosNavigation(request,response,env);
  },
};
