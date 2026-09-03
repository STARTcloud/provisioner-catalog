import { createApiClient, createI18n, createNotificationsClient, createPush } from './chrome';
import { createBrowserOidc, createReturnTo, createSessionEvents } from './session';

export const APP_NAME = 'Provisioner Catalog';
export const REPO_URL = 'https://github.com/STARTcloud/provisioner-catalog';
export const POWERED_BY = { href: 'https://startcloud.com', logoSrc: '/startcloud-logo40.png' };
export const ISSUER = 'https://dev-auth.startcloud.com';
export const API_ORIGIN = __API_ORIGIN__ || window.location.origin;
export const VIEW_ALL_URL = `${ISSUER}/notifications`;
export const ACTIVE_ORG_KEY = 'activeOrganization';

const CLIENT_ID = 'provisioner-catalog';
const SCOPES = 'openid profile email organizations notifications entitlements';
const TICKET_BASE_URL = 'https://xd.prominic.net/app/apprequest.nsf/router?openagent';
const TICKET_REQ_TYPE = 'sso';
const TICKET_CONTEXT = `provisioner-catalog|${__APP_VERSION__}`;
const FALLBACK_CUSTOMER_ID = 'A55DF1';
const SUBSCRIPTIONS_PATH = '/push/subscriptions';

const requestOriginFor = origin => (import.meta.env.DEV ? '' : origin);

export const {
  i18n,
  ready: i18nPromise,
  getSupportedLanguages,
} = createI18n({ loadSupportedLanguages: () => __SUPPORTED_LOCALES__ });

export const events = createSessionEvents();

export const returnTo = createReturnTo({
  storageKey: 'catalog.intended_url',
  authPaths: ['/callback'],
});

export const session = createBrowserOidc({
  issuer: ISSUER,
  clientId: CLIENT_ID,
  scopes: SCOPES,
  storagePrefix: 'catalog',
  events,
  apiBase: requestOriginFor(ISSUER),
});

export const client = createApiClient({
  baseUrl: API_ORIGIN,
  requestOrigin: requestOriginFor(API_ORIGIN),
  session,
});

export const notificationsAdapter = createNotificationsClient({
  client: createApiClient({
    baseUrl: ISSUER,
    requestOrigin: requestOriginFor(ISSUER),
    session,
  }),
});

export const push = createPush({
  storageKey: 'catalog.push_enabled',
  serviceWorkerUrl: `/notification-sw.js?app=${encodeURIComponent(APP_NAME)}`,
  getVapidKey: () => client.get('/push/vapid-key', { auth: false }).then(data => data.publicKey),
  createSubscription: subscription => client.post(SUBSCRIPTIONS_PATH, subscription),
  deleteSubscription: endpoint => client.delete(SUBSCRIPTIONS_PATH, { params: { endpoint } }),
});

export const pushAdapter = {
  isSupported: push.isPushSupported,
  isEnabled: push.isPushEnabled,
  setEnabled: push.setPushEnabled,
  subscribe: push.subscribePush,
  unsubscribe: push.unsubscribePush,
};

export const fetchHealth = () => client.get('/health', { auth: false });

export const buildTicketUrl = (user, claims, activeOrg) => {
  const params = new URLSearchParams({
    req: TICKET_REQ_TYPE,
    customerId: activeOrg?.customer_id || claims?.customer_id || FALLBACK_CUSTOMER_ID,
    user: user.name || '',
    email: user.email || '',
    context: TICKET_CONTEXT,
  });
  return `${TICKET_BASE_URL}&${params.toString()}`;
};
