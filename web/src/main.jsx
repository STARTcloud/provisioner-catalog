import 'bootstrap/dist/css/bootstrap.min.css';
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { NavbarSearchProvider } from './chrome';
import i18n, { i18nPromise } from './i18n';

const container = document.getElementById('root');
const root = createRoot(container);

i18nPromise.then(() => {
  root.render(
    <I18nextProvider i18n={i18n}>
      <Suspense fallback="Loading...">
        <NavbarSearchProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NavbarSearchProvider>
      </Suspense>
    </I18nextProvider>
  );
});
