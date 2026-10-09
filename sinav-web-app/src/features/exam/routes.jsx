import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Exams = lazy(() => import('./pages/Exams'));
const Intro = lazy(() => import('./pages/Intro'));
const Sitting = lazy(() => import('./pages/Sitting'));
const Result = lazy(() => import('./pages/Result'));
const Analysis = lazy(() => import('./pages/Analysis'));
const Review = lazy(() => import('./pages/Review'));

// Deneme yalnız kayıtlı öğrenciye açıktır (learning:exam). Sınav ekranı odak düzenindedir.
export default [
  { path: Routes.exams, element: <Exams />, layout: 'app', access: 'learner' },
  { path: Routes.examIntro, element: <Intro />, layout: 'app', access: 'learner' },
  { path: Routes.examSitting, element: <Sitting />, layout: 'focus', access: 'learner' },
  { path: Routes.examResult, element: <Result />, layout: 'app', access: 'learner' },
  { path: Routes.examAnalysis, element: <Analysis />, layout: 'app', access: 'learner' },
  { path: Routes.examReview, element: <Review />, layout: 'app', access: 'learner' },
];
