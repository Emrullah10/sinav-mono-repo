import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Container from '@container/Container';
import App from '@router/App';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Container>
      <App />
    </Container>
  </StrictMode>
);
