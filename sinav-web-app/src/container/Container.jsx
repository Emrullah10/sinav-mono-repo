import { BrowserRouter } from 'react-router-dom';
import '@shared/translation/i18n';
import '@styles/index.scss';
import ThemeProvider from '@shared/providers/ThemeProvider';
import NotificationProvider from '@shared/providers/NotificationProvider';
import QueryProvider from '@shared/providers/QueryProvider';
import AuthBootstrap from './AuthBootstrap';

// Provider sırası: Theme → Notification → Query → Router → AuthBootstrap (şablon §16.3)
export default function Container({ children }) {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <QueryProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthBootstrap>{children}</AuthBootstrap>
          </BrowserRouter>
        </QueryProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
