import 'bootstrap/dist/css/bootstrap.min.css';
import { Suspense, useEffect, useState } from 'react';
import { Alert, Container, Spinner } from 'react-bootstrap';
import { createRoot } from 'react-dom/client';
import { I18nextProvider, useTranslation } from 'react-i18next';

import './css/styles.css';
import './css/fonts.css';
import { completeLogin, syncAccountPreferences } from './auth';
import { i18n, i18nPromise } from './chromeProps.jsx';

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
      .then(() => syncAccountPreferences())
      .then(() => window.location.replace('/'))
      .catch(loginError =>
        setError(
          loginError.code === 'invalid_dpop_proof' ? t('callback.clockSkew') : loginError.message
        )
      );
  }, [t]);

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

const container = document.getElementById('root');
const root = createRoot(container);

i18nPromise.then(() => {
  root.render(
    <I18nextProvider i18n={i18n}>
      <Suspense fallback="Loading...">
        <CallbackPage />
      </Suspense>
    </I18nextProvider>
  );
});
