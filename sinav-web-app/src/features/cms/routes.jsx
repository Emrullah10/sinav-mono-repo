import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const ItemList = lazy(() => import('./pages/ItemList'));
const ItemNew = lazy(() => import('./pages/ItemNew'));
const ItemDetail = lazy(() => import('./pages/ItemDetail'));
const ReviewQueue = lazy(() => import('./pages/ReviewQueue'));
const Reports = lazy(() => import('./pages/Reports'));
const AiJobs = lazy(() => import('./pages/AiJobs'));
const ExamBuilder = lazy(() => import('./pages/ExamBuilder'));
const CalendarImports = lazy(() => import('./pages/CalendarImports'));

const cms = (p, element, permission) => ({ path: p, element, layout: 'cms', access: 'permission', permission });

export default [
  cms(Routes.cms, <ItemList />, 'content:read'),
  cms(Routes.cmsNew, <ItemNew />, 'content:write'),
  cms(Routes.cmsItem, <ItemDetail />, 'content:read'),
  cms(Routes.cmsExamBuilder, <ExamBuilder />, 'content:read'),
  cms(Routes.cmsReview, <ReviewQueue />, 'content:review'),
  cms(Routes.cmsReviewItem, <ReviewQueue />, 'content:review'),
  cms(Routes.cmsReports, <Reports />, 'content:report:manage'),
  cms(Routes.cmsAi, <AiJobs />, 'content:generate'),
  cms(Routes.cmsCalendar, <CalendarImports />, 'content:read'),
];
