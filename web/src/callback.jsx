import 'bootstrap/dist/css/bootstrap.min.css';
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';

import './css/styles.css';
import './css/fonts.css';
import { i18n, i18nPromise, returnTo, session } from './chromeProps.jsx';
import { CallbackPage } from './session';

const onDone = () => window.location.replace(returnTo.consume() || '/');

i18nPromise.then(() => {
  createRoot(document.getElementById('root')).render(
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={i18n.t('loading')}>
        <CallbackPage complete={session.complete} onDone={onDone} />
      </Suspense>
    </I18nextProvider>
  );
});
