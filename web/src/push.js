import axios from 'axios';

import { getAccessToken } from './auth';

const PUSH_ENABLED_KEY = 'catalog.push_enabled';

export const isPushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isPushEnabled = () => localStorage.getItem(PUSH_ENABLED_KEY) === 'true';

export const setPushEnabled = enabled => {
  if (enabled) {
    localStorage.setItem(PUSH_ENABLED_KEY, 'true');
  } else {
    localStorage.removeItem(PUSH_ENABLED_KEY);
  }
};

const urlBase64ToUint8Array = base64String => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};

const ensureServiceWorker = async () => {
  await navigator.serviceWorker.register('/notification-sw.js');
  return navigator.serviceWorker.ready;
};

const authHeaders = async () => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('not signed in');
  }
  return { Authorization: `Bearer ${token}` };
};

export const subscribePush = async () => {
  const registration = await ensureServiceWorker();
  const { data } = await axios.get('/push/vapid-key');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });
  await axios.post('/push/subscriptions', subscription.toJSON(), { headers: await authHeaders() });
  return subscription;
};

export const unsubscribePush = async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  await axios.delete('/push/subscriptions', {
    params: { endpoint: subscription.endpoint },
    headers: await authHeaders(),
  });
  await subscription.unsubscribe();
};

export const resyncPushSubscription = () => {
  if (!isPushEnabled() || !isPushSupported()) {
    return Promise.resolve(null);
  }
  return ensureServiceWorker()
    .then(registration => registration.pushManager.getSubscription())
    .then(async subscription => {
      if (!subscription) {
        setPushEnabled(false);
        return null;
      }
      await axios.post('/push/subscriptions', subscription.toJSON(), {
        headers: await authHeaders(),
      });
      return subscription;
    })
    .catch(() => null);
};
