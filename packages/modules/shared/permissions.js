// İzin kataloğu — tek doğruluk kaynağı. Biçim: <alan>:<eylem> ya da <alan>:<kaynak>:<eylem>.
// DB seed'i (00-enums-schema.sql) `npm run build-role-permission-seed` ile buradan üretilir;
// `npm run validate-auth-config` sapmayı yakalar. '*' = oturumu olan herkes.

export const PERMISSIONS = Object.freeze({
  accountRead:          'account:read',
  accountManage:        'account:manage',
  catalogRead:          'catalog:read',
  learningOnboard:      'learning:onboard',
  learningDiagnostic:   'learning:diagnostic',
  learningStudy:        'learning:study',
  learningExam:         'learning:exam',
  studyContentRead:     'study:content:read',
  contentReportCreate:  'content:report:create',
  tutorChat:            'tutor:chat',
  tutorTranslation:     'tutor:translation',
  billingRead:          'billing:read',
  billingPurchase:      'billing:purchase',
  billingManage:        'billing:manage',
  sessionSwitch:        'session:switch',
  contentRead:          'content:read',
  contentWrite:         'content:write',
  contentGenerate:      'content:generate',
  contentReview:        'content:review',
  contentReportManage:  'content:report:manage',
  platformUserRead:     'platform:user:read',
  platformAuditRead:    'platform:audit:read',
  platformMetricRead:   'platform:metric:read',
  platformSessionRevoke:'platform:session:revoke',
});

export const requirePermission = (permissionCode) => ({
  'x-serviceDiscovery': [{ permissionList: permissionCode }],
});
export const requireInternal = () => ({ 'x-internal': true });
export const ANY_AUTHENTICATED = '*';

export const ROLES = Object.freeze({
  superadmin: 'superadmin',
  platformSupport: 'platform_support',
  contentEditor: 'content_editor',
  contentReviewer: 'content_reviewer',
  learner: 'learner',
  guest: 'guest',
});

const P = PERMISSIONS;
const base = [P.accountRead, P.accountManage];
const learnerPerms = [
  ...base, P.catalogRead, P.learningOnboard, P.learningDiagnostic, P.learningStudy, P.learningExam,
  P.studyContentRead, P.contentReportCreate, P.tutorChat, P.tutorTranslation,
  P.billingRead, P.billingPurchase, P.billingManage, P.sessionSwitch,
];
const guestPerms = [...base, P.catalogRead, P.learningOnboard, P.learningDiagnostic];
const editorPerms = [...base, P.sessionSwitch, P.contentRead, P.contentWrite, P.contentGenerate, P.contentReportManage];
const reviewerPerms = [...base, P.sessionSwitch, P.contentRead, P.contentReview, P.contentReportManage];
const supportPerms = [
  ...base, P.sessionSwitch, P.contentRead, P.contentReportManage,
  P.platformUserRead, P.platformAuditRead, P.platformMetricRead, P.platformSessionRevoke,
];

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.superadmin]: Object.freeze(Object.values(PERMISSIONS)),
  [ROLES.platformSupport]: Object.freeze(supportPerms),
  [ROLES.contentEditor]: Object.freeze(editorPerms),
  [ROLES.contentReviewer]: Object.freeze(reviewerPerms),
  [ROLES.learner]: Object.freeze(learnerPerms),
  [ROLES.guest]: Object.freeze(guestPerms),
});
