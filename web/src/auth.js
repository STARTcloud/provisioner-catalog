/* OIDC authorization-code + PKCE (S256) against the STARTcloud IdP.
 *
 * Public client — no secret. The IdP allows CORS on the token endpoint from
 * *.startcloud.com and the registered localhost dev callback. Registered
 * redirect URIs (exact match):
 *   https://provisioner-catalog.startcloud.com/callback
 *   http://localhost:8080/callback
 */
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

const ISSUER = 'https://dev-auth.startcloud.com';
const CLIENT_ID = 'provisioner-catalog';
const SCOPES = 'openid profile email organizations';
const REDIRECT_URI = `${window.location.origin}/callback`;

const STORE = {
  access: 'catalog.access_token',
  refresh: 'catalog.refresh_token',
  expires: 'catalog.expires_at',
  verifier: 'catalog.pkce_verifier',
  state: 'catalog.pkce_state',
  discovery: 'catalog.oidc_discovery',
};

const base64url = buffer => {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const randomUrlSafe = byteCount => {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
};

const s256 = async text => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64url(digest);
};

const discover = async () => {
  const cached = sessionStorage.getItem(STORE.discovery);
  if (cached) {
    return JSON.parse(cached);
  }
  const { data } = await axios.get(`${ISSUER}/.well-known/openid-configuration`);
  sessionStorage.setItem(STORE.discovery, JSON.stringify(data));
  return data;
};

const storeTokens = tokens => {
  localStorage.setItem(STORE.access, tokens.access_token);
  if (tokens.refresh_token) {
    localStorage.setItem(STORE.refresh, tokens.refresh_token);
  }
  const ttlSeconds = typeof tokens.expires_in === 'number' ? tokens.expires_in : 3600;
  localStorage.setItem(STORE.expires, String(Date.now() + ttlSeconds * 1000));
};

const clearTokens = () => {
  localStorage.removeItem(STORE.access);
  localStorage.removeItem(STORE.refresh);
  localStorage.removeItem(STORE.expires);
};

const tokenRequest = async params => {
  const { token_endpoint } = await discover();
  try {
    const { data } = await axios.post(token_endpoint, new URLSearchParams(params));
    return data;
  } catch (requestError) {
    const body = requestError.response?.data;
    throw new Error(
      body?.error_description || body?.error || `token request failed (${requestError.message})`
    );
  }
};

/* Redirect to the IdP's authorization endpoint with a fresh PKCE pair. */
export const beginLogin = async () => {
  const verifier = randomUrlSafe(48);
  const state = randomUrlSafe(24);
  sessionStorage.setItem(STORE.verifier, verifier);
  sessionStorage.setItem(STORE.state, state);
  const [{ authorization_endpoint }, challenge] = await Promise.all([discover(), s256(verifier)]);
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${authorization_endpoint}?${query.toString()}`);
};

/* Finish the code exchange on /callback. Throws with a readable message on
 * any denial, stale state, or token-endpoint failure. */
export const completeLogin = async () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('error')) {
    throw new Error(params.get('error_description') || params.get('error'));
  }
  const code = params.get('code');
  const state = params.get('state');
  const expectedState = sessionStorage.getItem(STORE.state);
  const verifier = sessionStorage.getItem(STORE.verifier);
  sessionStorage.removeItem(STORE.state);
  sessionStorage.removeItem(STORE.verifier);
  if (!code) {
    throw new Error('no authorization code in callback');
  }
  if (!expectedState || state !== expectedState) {
    throw new Error('state mismatch — stale or forged callback');
  }
  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: verifier,
  });
  storeTokens(tokens);
};

const refreshTokens = async () => {
  const refresh = localStorage.getItem(STORE.refresh);
  if (!refresh) {
    throw new Error('no refresh token');
  }
  const tokens = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: CLIENT_ID,
  });
  storeTokens(tokens);
};

/* A live access token, refreshing when within a minute of expiry; null when
 * signed out or the refresh grant fails. */
export const getAccessToken = async () => {
  const token = localStorage.getItem(STORE.access);
  if (!token) {
    return null;
  }
  const expiresAt = Number(localStorage.getItem(STORE.expires) || 0);
  if (Date.now() < expiresAt - 60 * 1000) {
    return token;
  }
  try {
    await refreshTokens();
    return localStorage.getItem(STORE.access);
  } catch {
    clearTokens();
    return null;
  }
};

/* Decoded access-token claims (organizations, name, email, …) or null. */
export const getClaims = () => {
  const token = localStorage.getItem(STORE.access);
  if (!token) {
    return null;
  }
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};

export const signOut = clearTokens;
