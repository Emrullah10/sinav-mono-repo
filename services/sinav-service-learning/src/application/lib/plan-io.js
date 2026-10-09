import { loadActiveEnrollment, catalogOf } from './enroll.js';
import { regeneratePlan } from './plan-engine.js';
import { tierOf } from './session-io.js';

/** Etkin kayıt için planı yeniden üretir (kayıt yoksa sessizce atlar). */
export const regenActive = async (tx, ctx, reason, extra = {}) => {
  const enrollment = await loadActiveEnrollment(tx.query.bind(tx), ctx.userId);
  if (!enrollment) return null;
  const catalog = await catalogOf(enrollment);
  return regeneratePlan(tx, ctx, { enrollment, catalog, reason, tier: await tierOf(ctx.userId), ...extra });
};
