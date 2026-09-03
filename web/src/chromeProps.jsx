import axios from 'axios';

import { API_ORIGIN, ISSUER, authHeaders } from './auth';
import { createI18n, createNotificationsClient, createPush } from './chrome';

export const APP_NAME = 'Provisioner Catalog';
export const REPO_URL = 'https://github.com/STARTcloud/provisioner-catalog';
export const POWERED_BY = { href: 'https://startcloud.com', logoSrc: '/startcloud-logo40.png' };
export const VIEW_ALL_URL = `${ISSUER}/notifications`;

const TICKET_BASE_URL = 'https://xd.prominic.net/app/apprequest.nsf/router?openagent';
const TICKET_REQ_TYPE = 'sso';
const TICKET_CONTEXT = `provisioner-catalog|${__APP_VERSION__}`;
const FALLBACK_CUSTOMER_ID = 'A55DF1';
const SUBSCRIPTIONS_PATH = '/push/subscriptions';

export const {
  i18n,
  ready: i18nPromise,
  getSupportedLanguages,
} = createI18n({ loadSupportedLanguages: () => __SUPPORTED_LOCALES__ });

export const notificationsAdapter = createNotificationsClient({
  baseUrl: import.meta.env.DEV ? '' : ISSUER,
  headers: (method, path) => authHeaders(method, `${ISSUER}${path}`),
});

const subscriptionHeaders = method => authHeaders(method, `${API_ORIGIN}${SUBSCRIPTIONS_PATH}`);

const push = createPush({
  storageKey: 'catalog.push_enabled',
  getVapidKey: () => axios.get('/push/vapid-key').then(({ data }) => data.publicKey),
  createSubscription: async subscription =>
    axios.post(SUBSCRIPTIONS_PATH, subscription, { headers: await subscriptionHeaders('POST') }),
  deleteSubscription: async endpoint =>
    axios.delete(SUBSCRIPTIONS_PATH, {
      params: { endpoint },
      headers: await subscriptionHeaders('DELETE'),
    }),
});

export const { isPushEnabled, syncSubscription, listenForSubscriptionChange } = push;

export const pushAdapter = {
  isSupported: push.isPushSupported,
  isEnabled: push.isPushEnabled,
  setEnabled: push.setPushEnabled,
  subscribe: push.subscribePush,
  unsubscribe: push.unsubscribePush,
};

export const fetchHealth = async () => {
  const response = await fetch(`${API_ORIGIN}/health`);
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return response.json();
};

export const buildTicketUrl = (user, userInfo, activeOrg) => {
  const params = new URLSearchParams({
    req: TICKET_REQ_TYPE,
    customerId: activeOrg?.customer_id || userInfo?.customer_id || FALLBACK_CUSTOMER_ID,
    user: user.name || '',
    email: user.email || '',
    context: TICKET_CONTEXT,
  });
  return `${TICKET_BASE_URL}&${params.toString()}`;
};
