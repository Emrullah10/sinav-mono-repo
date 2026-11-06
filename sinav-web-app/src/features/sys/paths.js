// System admin paths (kept out of the shared route-paths.js). Legacy Turkish paths redirect to these.
export const SYS = { status: '/sys', plans: '/sys/plans', sessions: '/sys/sessions', account: '/sys/account' };
export const SYS_LEGACY = [['/sys/planlar', SYS.plans], ['/sys/oturumlar', SYS.sessions], ['/sys/hesap', SYS.account]];
