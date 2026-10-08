import { getCaller } from 'app-shared';
import appConfig from 'app-config';
import handleErrors from 'app-errors';
import faker from '../test/helpers/index.js';
import controllers from '../src/interfaces/http/index.js';

const { routeFunctionErrorHandler, HTTP_STATUS } = handleErrors;

const base = async (req, res, next, callerName, serviceFunction, isPublic = false) => {
  try {
    if (typeof serviceFunction !== 'function') throw new Error('Invalid service function provided');
    const caller = getCaller(req.headers, isPublic);
    const response = await serviceFunction(req, caller);
    res.status(HTTP_STATUS.OK).json(response);
  } catch (error) {
    routeFunctionErrorHandler({ callerName, path: req.path, method: req.method }, error, next);
  }
};

const routeResponse = appConfig.nodeEnv === 'fake' ? faker : base;
const routes = {};

for (const ctrl of Object.values(controllers)) {
  if (!ctrl || typeof ctrl.read !== 'function' || typeof ctrl.upsert !== 'function') continue;
  const getName = `get${ctrl.name}`;
  const postName = `post${ctrl.name}`;
  routes[getName] = (req, res, next) => routeResponse(req, res, next, getName, ctrl.read);
  routes[postName] = (req, res, next) => routeResponse(req, res, next, postName, ctrl.upsert);
}

export default routes;
