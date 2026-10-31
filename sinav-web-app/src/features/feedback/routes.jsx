import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import Routes from '@shared/constant/route-paths';
import { useFeedbackStore } from './feedbackStore';

// /geri-bildirim (mobille ortak derin bağlantı): web'de ayrı sayfa yok, pencere açılır ve Bugün'e dönülür.
function OpenFeedback() {
  const show = useFeedbackStore((s) => s.show);
  useEffect(() => {
    show();
  }, [show]);
  return <Navigate to={Routes.today} replace />;
}

export default [{ path: Routes.feedback, element: <OpenFeedback />, layout: 'app', access: 'session' }];
