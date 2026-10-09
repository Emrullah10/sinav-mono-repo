import { PERMISSIONS as P } from 'app-shared';
import container from '../../../container.js';

const uc = () => container.useCases;
const b = (req) => req.body || {};
const E = P.learningExam;

export default [
  { method: 'get', path: '/v1/exams/overview', permission: E, handler: (req, caller) => uc().exams.overview({ caller }) },
  { method: 'get', path: '/v1/exam-forms/{code}', permission: E, handler: (req, caller) => uc().exams.formDetail({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/exam-sittings', permission: E, body: true, handler: (req, caller) => uc().exams.start({ caller, formCode: b(req).formCode, mode: b(req).mode }) },
  { method: 'get', path: '/v1/exam-sittings/{code}', permission: E, handler: (req, caller) => uc().exams.getSitting({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/exam-sittings/{code}/questions', permission: E, handler: (req, caller) => uc().exams.questions({ caller, code: req.params.code, from: req.query?.from, to: req.query?.to }) },
  { method: 'put', path: '/v1/exam-sittings/{code}/answers/{n}', permission: E, body: true, handler: (req, caller) => uc().exams.putAnswer({ caller, code: req.params.code, position: req.params.n, ...b(req) }) },
  { method: 'post', path: '/v1/exam-sittings/{code}/pause', permission: E, body: true, handler: (req, caller) => uc().exams.pause({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/exam-sittings/{code}/resume', permission: E, body: true, handler: (req, caller) => uc().exams.resume({ caller, code: req.params.code }) },
  { method: 'post', path: '/v1/exam-sittings/{code}/submit', permission: E, body: true, handler: (req, caller) => uc().exams.submit({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/exam-sittings/{code}/result', permission: E, handler: (req, caller) => uc().exams.result({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/exam-sittings/{code}/analysis', permission: E, handler: (req, caller) => uc().exams.analysis({ caller, code: req.params.code }) },
  { method: 'get', path: '/v1/exam-sittings/{code}/review', permission: E, handler: (req, caller) => uc().exams.review({ caller, code: req.params.code, filter: req.query?.filter }) },
  { method: 'get', path: '/v1/exam-sittings/{code}/review/{n}', permission: E, handler: (req, caller) => uc().exams.reviewItem({ caller, code: req.params.code, position: req.params.n }) },
];
