import axios from 'axios';

import { getAccessToken, ISSUER } from './auth';

const base = import.meta.env.DEV ? '' : ISSUER;

const authed = async () => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('not signed in');
  }
  return { headers: { Authorization: `Bearer ${token}` } };
};

export const fetchNotifications = async params => {
  const config = await authed();
  const { data } = await axios.get(`${base}/api/notifications`, { ...config, params });
  return data;
};

export const fetchUnreadCount = async () => {
  const config = await authed();
  const { data } = await axios.get(`${base}/api/notifications/unread-count`, config);
  return data;
};

export const markRead = async id => {
  await axios.post(
    `${base}/api/notifications/${encodeURIComponent(id)}/read`,
    null,
    await authed()
  );
};

export const markAllRead = async () => {
  await axios.post(`${base}/api/notifications/read-all`, null, await authed());
};
