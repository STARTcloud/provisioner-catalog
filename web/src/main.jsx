import 'bootstrap/dist/css/bootstrap.min.css';

import App from './App';
import { configureLogger, mountApp, reportRenderError } from './chrome';
import { i18n, i18nPromise } from './chromeProps.jsx';

configureLogger({ defaults: { enabled: true, level: import.meta.env.DEV ? 'debug' : 'info' } });

mountApp({
  App,
  i18n,
  ready: i18nPromise,
  showErrorDetails: import.meta.env.DEV,
  onError: reportRenderError,
});
