import axios from 'axios';

import { API_ORIGIN, authHeaders } from './auth';
import { createPush } from './chrome';

const SUBSCRIPTIONS_PATH = '/push/subscriptions';

const subscriptionHeaders = method => authHeaders(method, `${API_ORIGIN}${SUBSCRIPTIONS_PATH}`);

export const {
  isPushSupported,
  isPushEnabled,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
  syncSubscription,
  listenForSubscriptionChange,
} = createPush({
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
