import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import { Alert, Container, Spinner } from 'react-bootstrap';
import { createRoot } from 'react-dom/client';
import { useTranslation } from 'react-i18next';

import { completeLogin } from './auth';

import './i18n';
import './styles.css';

let exchangeStarted = false;

const CallbackPage = () => {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  useEffect(() => {
    if (exchangeStarted) {
      return;
    }
    exchangeStarted = true;
    completeLogin()
      .then(() => window.location.replace('/'))
      .catch(loginError => setError(loginError.message));
  }, []);

  return (
    <Container className="py-5">
      {error ? (
        <Alert variant="danger">
          {t('callback.failed', { message: error })}{' '}
          <Alert.Link href="/">{t('callback.returnLink')}</Alert.Link> {t('callback.tryAgain')}
        </Alert>
      ) : (
        <p className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" role="status" />
          {t('callback.completing')}
        </p>
      )}
    </Container>
  );
};

createRoot(document.getElementById('root')).render(<CallbackPage />);
