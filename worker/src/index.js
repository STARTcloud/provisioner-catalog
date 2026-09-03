/* Cloudflare Worker: the private-catalog gate.
 *
 * Routed on provisioner-catalog.startcloud.com/private/* — every other path
 * on the domain passes straight through to GitHub Pages. Authorizes reads
 * with nothing but the caller's Bearer JWT:
 *
 *   1. verify RS256 signature via the IdP's JWKS (discovered from ISSUER)
 *   2. check iss === ISSUER, aud contains AUDIENCE, exp/nbf with 60s leeway
 *   3. the requested org uuid must appear in the token's organizations[] claim
 *
 * Membership = read access. On success the org's catalog.json is proxied from
 * the private store repo (STORE_REPO) via the GitHub contents API using the
 * GITHUB_PAT secret — a fine-grained, read-only, single-repo token.
 *
 * Vars (wrangler.toml): ISSUER, AUDIENCE, STORE_REPO, ALLOWED_ORIGINS
 * Secrets (wrangler secret put): GITHUB_PAT
 */

const PATH_RE =
  /^\/private\/(?<uuid>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(?<file>catalog|health)\.json$/i;
const LEEWAY_SECONDS = 60;

// JWKS cache, per isolate. Refetched when a kid is unknown (key rotation) or
// the entry is older than an hour.
let jwksCache = { keys: null, fetchedAt: 0 };

const b64urlToBytes = segment => {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const bytesToB64url = bytes => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const concatBytes = (...arrays) => {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
};

const NUL = new Uint8Array([0]);

const jsonResponse = (status, body, corsHeaders) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...corsHeaders,
    },
  });

const corsFor = (request, env) => {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(entry => entry.trim());
  const headers = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, DPoP';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
};

const fetchJwks = async env => {
  const discoveryUrl = `${env.ISSUER}/.well-known/openid-configuration`;
  const discovery = await fetch(discoveryUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!discovery.ok) {
    throw new Error(`OIDC discovery failed (${discovery.status})`);
  }
  const { jwks_uri: jwksUri } = await discovery.json();
  const jwksResponse = await fetch(jwksUri, { headers: { Accept: 'application/json' } });
  if (!jwksResponse.ok) {
    throw new Error(`JWKS fetch failed (${jwksResponse.status})`);
  }
  const { keys } = await jwksResponse.json();
  jwksCache = { keys: keys || [], fetchedAt: Date.now() };
  return jwksCache.keys;
};

const findKey = async (kid, env) => {
  const fresh = Date.now() - jwksCache.fetchedAt < 60 * 60 * 1000;
  if (jwksCache.keys && fresh) {
    const hit = jwksCache.keys.find(key => key.kid === kid);
    if (hit) {
      return hit;
    }
  }
  // Unknown kid or stale cache: refetch once — covers IdP key rotation.
  const keys = await fetchJwks(env);
  return keys.find(key => key.kid === kid) || null;
};

/* Verify the compact JWT; returns its payload or throws with a reason. */
const verifyJwt = async (token, env) => {
  const segments = token.split('.');
  if (segments.length !== 3) {
    throw new Error('malformed token');
  }
  const [headerB64, payloadB64, signatureB64] = segments;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
  if (header.alg !== 'RS256') {
    throw new Error(`unsupported alg '${header.alg}'`);
  }
  const jwk = await findKey(header.kid, env);
  if (!jwk) {
    throw new Error('no matching JWKS key');
  }
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    b64urlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) {
    throw new Error('bad signature');
  }

  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== env.ISSUER) {
    throw new Error('wrong issuer');
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.AUDIENCE)) {
    throw new Error('wrong audience');
  }
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_SECONDS < now) {
    throw new Error('token expired');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - LEEWAY_SECONDS > now) {
    throw new Error('token not yet valid');
  }
  return payload;
};

const PROOF_MAX_AGE_SECONDS = 60;
const JTI_TTL_SECONDS = 300;

const decodeSegment = segment => JSON.parse(new TextDecoder().decode(b64urlToBytes(segment)));

const jwkThumbprint = async jwk => {
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return bytesToB64url(new Uint8Array(digest));
};

const sha256B64url = async text => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToB64url(new Uint8Array(digest));
};

const htuOf = url => {
  const target = new URL(url);
  return `${target.origin}${target.pathname}`;
};

const verifyProof = async (proof, request, token, boundJkt, env) => {
  const segments = proof.split('.');
  if (segments.length !== 3) {
    throw new Error('malformed DPoP proof');
  }
  const [headerB64, payloadB64, signatureB64] = segments;
  const header = decodeSegment(headerB64);
  if (header.typ !== 'dpop+jwt' || header.alg !== 'ES256') {
    throw new Error('unsupported DPoP proof');
  }
  const { jwk } = header;
  if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || jwk.d) {
    throw new Error('bad DPoP proof key');
  }
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  );
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64urlToBytes(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) {
    throw new Error('bad DPoP proof signature');
  }
  const payload = decodeSegment(payloadB64);
  if (payload.htm !== request.method) {
    throw new Error('DPoP htm mismatch');
  }
  if (payload.htu !== htuOf(request.url)) {
    throw new Error('DPoP htu mismatch');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.iat !== 'number' || Math.abs(now - payload.iat) > PROOF_MAX_AGE_SECONDS) {
    throw new Error('DPoP proof expired');
  }
  if (payload.ath !== (await sha256B64url(token))) {
    throw new Error('DPoP ath mismatch');
  }
  if ((await jwkThumbprint(jwk)) !== boundJkt) {
    throw new Error('DPoP key does not match the token binding');
  }
  if (typeof payload.jti !== 'string' || !payload.jti) {
    throw new Error('DPoP jti required');
  }
  const jtiKey = `jti:${payload.jti}`;
  if (await env.SUBS.get(jtiKey)) {
    throw new Error('DPoP proof replayed');
  }
  await env.SUBS.put(jtiKey, '1', { expirationTtl: JTI_TTL_SECONDS });
};

const authPayload = async (request, env) => {
  const authorization = request.headers.get('Authorization') || '';
  const [scheme, ...rest] = authorization.split(' ');
  const token = rest.join(' ').trim();
  if (!token || !['Bearer', 'DPoP'].includes(scheme)) {
    return null;
  }
  const payload = await verifyJwt(token, env);
  const boundJkt = payload.cnf?.jkt;
  if (scheme === 'Bearer') {
    if (boundJkt) {
      throw new Error('key-bound token presented as Bearer');
    }
    return payload;
  }
  if (!boundJkt) {
    throw new Error('token is not key-bound');
  }
  const proof = request.headers.get('DPoP') || '';
  if (!proof) {
    throw new Error('DPoP proof required');
  }
  await verifyProof(proof, request, token, boundJkt, env);
  return payload;
};

const fetchOrgFile = async (uuid, file, env) => {
  const url = `https://api.github.com/repos/${env.STORE_REPO}/contents/orgs/${uuid}/${file}.json`;
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: 'application/vnd.github.raw+json',
      'User-Agent': 'provisioner-catalog-gate',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
};

const handlePrivate = async (request, env, cors, match) => {
  const uuid = match.groups.uuid.toLowerCase();
  const file = match.groups.file.toLowerCase();

  let payload;
  try {
    payload = await authPayload(request, env);
  } catch (verifyError) {
    return jsonResponse(
      401,
      { error: `invalid token: ${verifyError.message}` },
      { ...cors, 'WWW-Authenticate': 'Bearer error="invalid_token"' }
    );
  }
  if (!payload) {
    return jsonResponse(
      401,
      { error: 'missing bearer token' },
      { ...cors, 'WWW-Authenticate': 'Bearer' }
    );
  }

  const organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
  const member = organizations.some(
    org => typeof org.uuid === 'string' && org.uuid.toLowerCase() === uuid
  );
  if (!member) {
    // Membership = read access; nothing else grants it. Never redirect.
    return jsonResponse(403, { error: 'not a member of this organization' }, cors);
  }

  const upstream = await fetchOrgFile(uuid, file, env);
  if (upstream.status === 404) {
    return jsonResponse(404, { error: `no ${file} published for this organization` }, cors);
  }
  if (!upstream.ok) {
    return jsonResponse(502, { error: `store fetch failed (${upstream.status})` }, cors);
  }
  const catalog = await upstream.text();
  return new Response(catalog, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...cors,
    },
  });
};

const handleRebuild = async (request, env, cors) => {
  let payload;
  try {
    payload = await authPayload(request, env);
  } catch (verifyError) {
    return jsonResponse(401, { error: `invalid token: ${verifyError.message}` }, cors);
  }
  if (!payload) {
    return jsonResponse(401, { error: 'missing bearer token' }, cors);
  }
  const authorities = Array.isArray(payload.authorities) ? payload.authorities : [];
  if (!authorities.includes('ROLE_ADMIN')) {
    return jsonResponse(403, { error: 'admin role required' }, cors);
  }
  if (!env.DISPATCH_PAT) {
    return jsonResponse(503, { error: 'dispatch not configured' }, cors);
  }
  const url = `https://api.github.com/repos/${env.DISPATCH_REPO}/actions/workflows/${env.DISPATCH_WORKFLOW}/dispatches`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.DISPATCH_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'provisioner-catalog-gate',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        requested_by: String(payload.UUID || payload.sub || ''),
        forceRepositoryUpdate: 'true',
      },
    }),
  });
  if (upstream.status !== 204) {
    return jsonResponse(502, { error: `dispatch failed (${upstream.status})` }, cors);
  }
  return jsonResponse(202, { status: 'queued' }, cors);
};

const handleRebuildStatus = async (request, env, cors) => {
  let payload;
  try {
    payload = await authPayload(request, env);
  } catch (verifyError) {
    return jsonResponse(401, { error: `invalid token: ${verifyError.message}` }, cors);
  }
  if (!payload) {
    return jsonResponse(401, { error: 'missing bearer token' }, cors);
  }
  const authorities = Array.isArray(payload.authorities) ? payload.authorities : [];
  if (!authorities.includes('ROLE_ADMIN')) {
    return jsonResponse(403, { error: 'admin role required' }, cors);
  }
  if (!env.DISPATCH_PAT) {
    return jsonResponse(503, { error: 'dispatch not configured' }, cors);
  }
  const url = `https://api.github.com/repos/${env.DISPATCH_REPO}/actions/workflows/${env.DISPATCH_WORKFLOW}/runs?per_page=1`;
  const upstream = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.DISPATCH_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'provisioner-catalog-gate',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!upstream.ok) {
    return jsonResponse(502, { error: `status fetch failed (${upstream.status})` }, cors);
  }
  const data = await upstream.json();
  const run = Array.isArray(data.workflow_runs) ? data.workflow_runs[0] : null;
  return jsonResponse(
    200,
    { status: run?.status || 'unknown', conclusion: run?.conclusion || null },
    cors
  );
};

const subscriptionKey = async endpoint => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return `sub:${bytesToB64url(new Uint8Array(digest))}`;
};

const isValidSubscription = body =>
  typeof body?.endpoint === 'string' &&
  body.endpoint.startsWith('https://') &&
  body.endpoint.length <= 512 &&
  typeof body?.keys?.p256dh === 'string' &&
  typeof body?.keys?.auth === 'string';

const handleSubscribe = async (request, env, cors) => {
  let payload;
  try {
    payload = await authPayload(request, env);
  } catch (verifyError) {
    return jsonResponse(401, { error: `invalid token: ${verifyError.message}` }, cors);
  }
  if (!payload) {
    return jsonResponse(401, { error: 'missing bearer token' }, cors);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'invalid subscription' }, cors);
  }
  if (!isValidSubscription(body)) {
    return jsonResponse(400, { error: 'invalid subscription' }, cors);
  }
  const organizations = Array.isArray(payload.organizations) ? payload.organizations : [];
  const record = {
    endpoint: body.endpoint,
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
    uuid: String(payload.UUID || payload.sub || ''),
    orgs: organizations.map(org => String(org.uuid || '').toLowerCase()).filter(Boolean),
  };
  await env.SUBS.put(await subscriptionKey(body.endpoint), JSON.stringify(record));
  return new Response(null, { status: 204, headers: cors });
};

const handleUnsubscribe = async (request, env, cors) => {
  let payload;
  try {
    payload = await authPayload(request, env);
  } catch (verifyError) {
    return jsonResponse(401, { error: `invalid token: ${verifyError.message}` }, cors);
  }
  if (!payload) {
    return jsonResponse(401, { error: 'missing bearer token' }, cors);
  }
  const endpoint = new URL(request.url).searchParams.get('endpoint') || '';
  if (!endpoint) {
    return jsonResponse(400, { error: 'endpoint required' }, cors);
  }
  await env.SUBS.delete(await subscriptionKey(endpoint));
  return new Response(null, { status: 204, headers: cors });
};

const hkdfExtract = async (salt, ikm) => {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, ikm));
};

const hkdfExpand = async (prk, info, length) => {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const input = concatBytes(info, new Uint8Array([1]));
  const output = new Uint8Array(await crypto.subtle.sign('HMAC', key, input));
  return output.slice(0, length);
};

const encryptPayload = async (subscription, payload) => {
  const uaPublic = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256)
  );
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const prkKey = await hkdfExtract(authSecret, ecdh);
  const keyInfo = concatBytes(new TextEncoder().encode('WebPush: info'), NUL, uaPublic, asPublic);
  const ikm = await hkdfExpand(prkKey, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm);
  const cek = await hkdfExpand(
    prk,
    concatBytes(new TextEncoder().encode('Content-Encoding: aes128gcm'), NUL),
    16
  );
  const nonce = await hkdfExpand(
    prk,
    concatBytes(new TextEncoder().encode('Content-Encoding: nonce'), NUL),
    12
  );
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concatBytes(new TextEncoder().encode(payload), new Uint8Array([2]));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record)
  );
  return concatBytes(
    salt,
    new Uint8Array([0, 0, 16, 0]),
    new Uint8Array([asPublic.length]),
    asPublic,
    cipher
  );
};

const importVapidPrivateKey = async env => {
  const pub = b64urlToBytes(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: env.VAPID_PRIVATE_KEY,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
};

const vapidAuthHeader = async (endpoint, env) => {
  const { origin } = new URL(endpoint);
  const header = bytesToB64url(
    new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  );
  const claims = bytesToB64url(
    new TextEncoder().encode(
      JSON.stringify({
        aud: origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: env.VAPID_SUBJECT,
      })
    )
  );
  const key = await importVapidPrivateKey(env);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  return `vapid t=${header}.${claims}.${bytesToB64url(new Uint8Array(signature))}, k=${env.VAPID_PUBLIC_KEY}`;
};

const sendPush = async (subscription, payload, env) => {
  const body = await encryptPayload(subscription, payload);
  const authorization = await vapidAuthHeader(subscription.endpoint, env);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });
};

const listSubscriptions = async env => {
  const records = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    for (const key of page.keys) {
      const value = await env.SUBS.get(key.name);
      if (value) {
        records.push({ key: key.name, record: JSON.parse(value) });
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return records;
};

const eventTargets = (event, subscriptions) => {
  if (event.scope === 'org') {
    const orgUuid = String(event.org_uuid || '').toLowerCase();
    return subscriptions.filter(({ record }) => (record.orgs || []).includes(orgUuid));
  }
  if (event.scope === 'user') {
    const uuid = String(event.uuid || '');
    return subscriptions.filter(({ record }) => record.uuid === uuid);
  }
  return subscriptions;
};

const handleDispatch = async (request, env, cors) => {
  const dispatchKey = request.headers.get('X-Dispatch-Key') || '';
  if (!env.DISPATCH_KEY || dispatchKey !== env.DISPATCH_KEY) {
    return jsonResponse(401, { error: 'bad dispatch key' }, cors);
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return jsonResponse(503, { error: 'push not configured' }, cors);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'invalid body' }, cors);
  }
  const events = Array.isArray(body?.events) ? body.events : [];
  if (events.length === 0) {
    return jsonResponse(200, { delivered: 0 }, cors);
  }
  const subscriptions = await listSubscriptions(env);
  let delivered = 0;
  for (const event of events) {
    const payload = JSON.stringify({
      title: String(event.title || ''),
      body: String(event.body || ''),
      tag: String(event.tag || 'catalog-update'),
      data: { navigate: String(event.navigate || '') },
    });
    for (const { key, record } of eventTargets(event, subscriptions)) {
      try {
        const response = await sendPush(record, payload, env);
        if ([403, 404, 410].includes(response.status)) {
          await env.SUBS.delete(key);
        } else if (response.ok || response.status === 201) {
          delivered += 1;
        }
      } catch {
        delivered += 0;
      }
    }
  }
  return jsonResponse(200, { delivered }, cors);
};

const HEALTH_TTL_MS = 60 * 1000;
let healthCache = { at: 0, body: null };

const probe = async (url, headers = {}) => {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return 'ok';
    }
    if (response.status === 429) {
      return `warning (${response.status})`;
    }
    return `error (${response.status})`;
  } catch {
    return 'error (unreachable)';
  }
};

const overallStatus = services => {
  const values = Object.values(services);
  if (values.some(value => value.startsWith('error'))) {
    return 'error';
  }
  if (values.some(value => value.startsWith('warning'))) {
    return 'warning';
  }
  return 'ok';
};

const handleHealth = async (request, env, cors) => {
  if (Date.now() - healthCache.at > HEALTH_TTL_MS) {
    const [idp, pages, store] = await Promise.all([
      probe(`${env.ISSUER}/.well-known/openid-configuration`),
      probe(new URL('/catalog.json', request.url).toString()),
      env.GITHUB_PAT
        ? probe(`https://api.github.com/repos/${env.STORE_REPO}`, {
            Authorization: `Bearer ${env.GITHUB_PAT}`,
            'User-Agent': 'provisioner-catalog-gate',
            'X-GitHub-Api-Version': '2022-11-28',
          })
        : Promise.resolve('error (not configured)'),
    ]);
    const services = { worker: 'ok', idp, pages, store };
    healthCache = {
      at: Date.now(),
      body: { status: overallStatus(services), timestamp: new Date().toISOString(), services },
    };
  }
  return jsonResponse(200, healthCache.body, cors);
};

const WORKER_PREFIXES = ['/private/', '/push/', '/admin/'];

const isPageRequest = (request, pathname) =>
  request.method === 'GET' &&
  !/\.[a-z0-9]+$/i.test(pathname) &&
  (request.headers.get('Accept') || '').includes('text/html');

const handleSite = async (request, pathname) => {
  const upstream = await fetch(request);
  if (upstream.status !== 404 || !isPageRequest(request, pathname)) {
    return upstream;
  }
  const index = await fetch(new URL('/index.html', request.url), {
    headers: { Accept: 'text/html' },
  });
  const headers = new Headers(index.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(index.body, { status: 200, headers });
};

export default {
  async fetch(request, env) {
    const cors = corsFor(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/health' && request.method === 'GET') {
      return handleHealth(request, env, cors);
    }
    if (pathname === '/admin/rebuild' && request.method === 'POST') {
      return handleRebuild(request, env, cors);
    }
    if (pathname === '/admin/rebuild/status' && request.method === 'GET') {
      return handleRebuildStatus(request, env, cors);
    }
    if (pathname === '/push/vapid-key' && request.method === 'GET') {
      if (!env.VAPID_PUBLIC_KEY) {
        return jsonResponse(503, { error: 'push not configured' }, cors);
      }
      return jsonResponse(200, { publicKey: env.VAPID_PUBLIC_KEY }, cors);
    }
    if (pathname === '/push/subscriptions' && request.method === 'POST') {
      return handleSubscribe(request, env, cors);
    }
    if (pathname === '/push/subscriptions' && request.method === 'DELETE') {
      return handleUnsubscribe(request, env, cors);
    }
    if (pathname === '/push/dispatch' && request.method === 'POST') {
      return handleDispatch(request, env, cors);
    }

    const match = PATH_RE.exec(pathname);
    if (!match) {
      if (WORKER_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        return jsonResponse(404, { error: 'not found' }, cors);
      }
      return handleSite(request, pathname);
    }
    if (request.method !== 'GET') {
      return jsonResponse(405, { error: 'method not allowed' }, cors);
    }
    return handlePrivate(request, env, cors, match);
  },
};
