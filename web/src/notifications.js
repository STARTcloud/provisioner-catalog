import axios from 'axios';

import { authHeaders, ISSUER } from './auth';

const base = import.meta.env.DEV ? '' : ISSUER;

const authed = async (method, path) => ({
  headers: await authHeaders(method, `${ISSUER}${path}`),
});

export const fetchNotifications = async params => {
  const path = '/api/notifications';
  const { data } = await axios.get(`${base}${path}`, { ...(await authed('GET', path)), params });
  return data;
};

export const fetchUnreadCount = async () => {
  const path = '/api/notifications/unread-count';
  const { data } = await axios.get(`${base}${path}`, await authed('GET', path));
  return data;
};

export const markRead = async id => {
  const path = `/api/notifications/${encodeURIComponent(id)}/read`;
  await axios.post(`${base}${path}`, null, await authed('POST', path));
};

export const markAllRead = async () => {
  const path = '/api/notifications/read-all';
  await axios.post(`${base}${path}`, null, await authed('POST', path));
};

export const deleteNotification = async id => {
  const path = `/api/notifications/${encodeURIComponent(id)}`;
  await axios.delete(`${base}${path}`, await authed('DELETE', path));
};
