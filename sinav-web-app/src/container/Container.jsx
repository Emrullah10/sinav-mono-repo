import { BrowserRouter } from 'react-router-dom';
import '@shared/translation/i18n';
import '@styles/index.scss';
import ThemeProvider from '@shared/providers/ThemeProvider';
import NotificationProvider from '@shared/providers/NotificationProvider';
import QueryProvider from '@shared/providers/QueryProvider';
import { LexiconProvider } from '@features/lexicon/LexiconProvider';
import FeedbackDialog from '@features/feedback/FeedbackDialog';
import AuthBootstrap from './AuthBootstrap';

// Provider sırası: Theme → Notification → Query → Router → AuthBootstrap → dokun-çevir (şablon §16.3); geri bildirim penceresi kökte
export default function Container({ children }) {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <QueryProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthBootstrap>
              <LexiconProvider>{children}</LexiconProvider>
              <FeedbackDialog />
            </AuthBootstrap>
          </BrowserRouter>
        </QueryProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
