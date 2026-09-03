import PropTypes from 'prop-types';
import { FaCircleUser } from 'react-icons/fa6';

import { API_ORIGIN, ISSUER } from './auth';
import {
  deleteNotification,
  fetchNotifications,
  fetchUnreadCount,
  markAllRead,
  markRead,
} from './notifications';
import {
  isPushEnabled,
  isPushSupported,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
} from './push';

export const APP_NAME = 'Provisioner Catalog';
export const REPO_URL = 'https://github.com/STARTcloud/provisioner-catalog';
export const POWERED_BY = { href: 'https://startcloud.com', logoSrc: '/startcloud-logo40.png' };
export const VIEW_ALL_URL = `${ISSUER}/notifications`;

const TICKET_BASE_URL = 'https://xd.prominic.net/app/apprequest.nsf/router?openagent';
const TICKET_REQ_TYPE = 'sso';
const TICKET_CONTEXT = `provisioner-catalog|${__APP_VERSION__}`;
const FALLBACK_CUSTOMER_ID = 'A55DF1';

export const notificationsAdapter = {
  list: fetchNotifications,
  unreadCount: fetchUnreadCount,
  markRead,
  markAllRead,
  remove: deleteNotification,
};

export const pushAdapter = {
  isSupported: isPushSupported,
  isEnabled: isPushEnabled,
  setEnabled: setPushEnabled,
  subscribe: subscribePush,
  unsubscribe: unsubscribePush,
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

export const Avatar = ({ picture = '', size }) =>
  picture ? (
    <img src={picture} alt="" width={size} height={size} className="rounded-circle flex-shrink-0" />
  ) : (
    <FaCircleUser size={size} className="flex-shrink-0" aria-hidden />
  );

Avatar.propTypes = {
  picture: PropTypes.string,
  size: PropTypes.number.isRequired,
};
