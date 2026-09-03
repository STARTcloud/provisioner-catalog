import 'bootstrap/dist/css/bootstrap.min.css';

import App from './App';
import { mountApp } from './chrome';
import i18n, { i18nPromise } from './i18n';

mountApp({ App, i18n, ready: i18nPromise, showErrorDetails: import.meta.env.DEV });
