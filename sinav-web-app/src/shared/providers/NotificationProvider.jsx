import { useEffect } from 'react';
import { SnackbarProvider, useSnackbar } from 'notistack';
import { bindNotify } from '@shared/utils/notify';

function Bridge() {
  const { enqueueSnackbar } = useSnackbar();
  useEffect(() => {
    bindNotify(enqueueSnackbar);
    return () => bindNotify(null);
  }, [enqueueSnackbar]);
  return null;
}

export default function NotificationProvider({ children }) {
  return (
    <SnackbarProvider maxSnack={3} preventDuplicate autoHideDuration={4000} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Bridge />
      {children}
    </SnackbarProvider>
  );
}
