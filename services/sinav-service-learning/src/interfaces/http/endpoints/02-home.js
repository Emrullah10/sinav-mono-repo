import { PERMISSIONS as P } from 'app-shared';
import container from '../../../container.js';

const uc = () => container.useCases;
const b = (req) => req.body || {};

export default [
  { method: 'get', path: '/v1/today', permission: P.learningStudy, handler: (req, caller) => uc().plan.today({ caller }) },
  { method: 'get', path: '/v1/day-summary', permission: P.learningStudy, handler: (req, caller) => uc().plan.daySummary({ caller, date: req.query?.date }) },
  { method: 'post', path: '/v1/plan-tasks/{code}/start', permission: P.learningStudy, body: true, handler: (req, caller) => uc().plan.startTask({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/plan-tasks/{code}/postpone', permission: P.learningStudy, body: true, handler: (req, caller) => uc().plan.postponeTask({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/plan-tasks/{code}/skip', permission: P.learningStudy, body: true, handler: (req, caller) => uc().plan.skipTask({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/plan/adjust', permission: P.learningStudy, body: true, handler: (req, caller) => uc().plan.adjust({ caller, ...b(req) }) },
  { method: 'post', path: '/v1/activity/heartbeat', permission: P.learningStudy, body: true, handler: (req, caller) => uc().plan.heartbeat({ caller, ...b(req) }) },
  { method: 'get', path: '/v1/progress/overview', permission: P.learningStudy, handler: (req, caller) => uc().progress.overview({ caller, range: req.query?.range }) },
  { method: 'get', path: '/v1/usage/today', permission: P.learningStudy, handler: (req, caller) => uc().progress.usageToday({ caller }) },
  { method: 'post', path: '/v1/internal/activity', internal: true, body: true, handler: (req) => uc().progress.internalActivity(b(req)) },
];
