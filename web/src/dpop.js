const DB_NAME = 'catalog-dpop';
const STORE_NAME = 'keys';
const KEY_ID = 'session';
const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

let keyPairPromise = null;

const base64url = buffer => {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const encodeJson = value => base64url(new TextEncoder().encode(JSON.stringify(value)));

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async (mode, operation) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
};

const loadKeyPair = async () => {
  const stored = await withStore('readonly', store => store.get(KEY_ID)).catch(() => null);
  if (stored?.privateKey && stored?.publicKey) {
    return stored;
  }
  const generated = await crypto.subtle.generateKey(ALGORITHM, false, ['sign', 'verify']);
  await withStore('readwrite', store => store.put(generated, KEY_ID)).catch(() => null);
  return generated;
};

export const getDpopKeyPair = () => {
  keyPairPromise ||= loadKeyPair();
  return keyPairPromise;
};

export const clearDpopKey = async () => {
  keyPairPromise = null;
  await withStore('readwrite', store => store.delete(KEY_ID)).catch(() => null);
};

const publicJwk = async keyPair => {
  const { crv, kty, x, y } = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return { crv, kty, x, y };
};

export const jwkThumbprint = async jwk => {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return base64url(digest);
};

export const htuOf = url => {
  const target = new URL(url, window.location.origin);
  return `${target.origin}${target.pathname}`;
};

export const dpopProof = async (method, url, accessToken = '') => {
  const keyPair = await getDpopKeyPair();
  const jwk = await publicJwk(keyPair);
  const jti = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = {
    jti,
    htm: method.toUpperCase(),
    htu: htuOf(url),
    iat: Math.floor(Date.now() / 1000),
  };
  if (accessToken) {
    payload.ath = base64url(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accessToken))
    );
  }
  const signingInput = `${encodeJson({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${encodeJson(payload)}`;
  const signature = await crypto.subtle.sign(
    SIGN,
    keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${base64url(signature)}`;
};
