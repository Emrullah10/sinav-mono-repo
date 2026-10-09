import { lazy } from 'react';
import Routes from '@shared/constant/route-paths';

const Hub = lazy(() => import('./pages/Hub'));
const StudyType = lazy(() => import('./pages/StudyType'));
const StudySkill = lazy(() => import('./pages/StudySkill'));
const Note = lazy(() => import('./pages/Note'));
const PracticeSetup = lazy(() => import('./pages/PracticeSetup'));
const Session = lazy(() => import('./pages/Session'));
const SessionResult = lazy(() => import('./pages/SessionResult'));
const Vocab = lazy(() => import('./pages/Vocab'));
const VocabReview = lazy(() => import('./pages/VocabReview'));
const VocabWord = lazy(() => import('./pages/VocabWord'));
const Mistakes = lazy(() => import('./pages/Mistakes'));
const MistakeReview = lazy(() => import('./pages/MistakeReview'));

export default [
  { path: Routes.study, element: <Hub />, layout: 'app', access: 'learner' },
  { path: Routes.studyType, element: <StudyType />, layout: 'app', access: 'learner' },
  { path: Routes.studySkill, element: <StudySkill />, layout: 'app', access: 'learner' },
  { path: Routes.note, element: <Note />, layout: 'app', access: 'learner' },
  { path: Routes.practiceSetup, element: <PracticeSetup />, layout: 'app', access: 'learner' },
  { path: Routes.session, element: <Session />, layout: 'focus', access: 'learner' },
  { path: Routes.sessionResult, element: <SessionResult />, layout: 'app', access: 'learner' },
  { path: Routes.vocab, element: <Vocab />, layout: 'app', access: 'learner' },
  { path: Routes.vocabReview, element: <VocabReview />, layout: 'focus', access: 'learner' },
  { path: Routes.vocabWord, element: <VocabWord />, layout: 'app', access: 'learner' },
  { path: Routes.mistakes, element: <Mistakes />, layout: 'app', access: 'learner' },
  { path: Routes.mistakeReview, element: <MistakeReview />, layout: 'focus', access: 'learner' },
];
