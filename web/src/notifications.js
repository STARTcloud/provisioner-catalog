import { ISSUER, authHeaders } from './auth';
import { createNotificationsClient } from './chrome';

export const notificationsAdapter = createNotificationsClient({
  baseUrl: import.meta.env.DEV ? '' : ISSUER,
  headers: (method, path) => authHeaders(method, `${ISSUER}${path}`),
});
