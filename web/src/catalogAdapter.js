import axios from 'axios';

import { API_ORIGIN, authHeaders } from './auth';

let publicPromise = null;
const privatePromises = new Map();
let memberships = [];

export const setMemberships = list => {
  memberships = list;
  privatePromises.clear();
};

export const resetCatalogCache = () => {
  publicPromise = null;
  privatePromises.clear();
};

const membershipFor = name => memberships.find(org => org.name === name) || null;

const fetchPublic = () => {
  publicPromise ||= Promise.all([
    axios.get('/catalog.json'),
    axios.get('/health.json').catch(() => ({ data: null })),
  ]).then(([catalog, health]) => ({ catalog: catalog.data, health: health.data }));
  return publicPromise;
};

const fetchPrivate = async path =>
  axios.get(path, { headers: await authHeaders('GET', `${API_ORIGIN}${path}`) });

const fetchOrg = uuid => {
  if (!privatePromises.has(uuid)) {
    privatePromises.set(
      uuid,
      Promise.all([
        fetchPrivate(`/private/${uuid}/catalog.json`),
        fetchPrivate(`/private/${uuid}/health.json`).catch(() => ({ data: null })),
      ]).then(([catalog, health]) => ({ catalog: catalog.data, health: health.data }))
    );
  }
  return privatePromises.get(uuid);
};

const privateError = error => {
  const { status } = error.response || {};
  const failure = new Error(error.message);
  failure.status = status;
  if (status === 404) {
    failure.messageKey = 'errors.noPrivateCatalog';
  } else if (status === 401 || status === 403) {
    failure.messageKey = 'errors.accessDenied';
  }
  return failure;
};

const ownerOf = repo => repo.split('/')[0];
const ownerLogo = owner => `https://github.com/${owner}.png?size=64`;
const artifactName = url => url.split('/').pop();

const providerCoverage = versions => {
  const measured = Object.values(versions || {}).filter(entry => Array.isArray(entry?.providers));
  const counts = {};
  measured.forEach(entry => {
    entry.providers.forEach(provider => {
      counts[provider] = (counts[provider] || 0) + 1;
    });
  });
  return { counts, total: measured.length };
};

const toVersion = (entry, health) => ({
  version: entry.version,
  createdAt: entry.released_at || null,
  description: '',
  releaseNotes: null,
  deprecated: false,
  deprecationReason: null,
  providers: (health.versions?.[entry.version]?.providers || []).map(name => ({
    name,
    description: '',
    architectures: [],
  })),
  artifacts: entry.artifacts.map(artifact => ({
    name: artifactName(artifact.url),
    checksum: artifact.checksum,
    checksumType: artifact.checksum_type,
    downloadUrl: artifact.url,
  })),
});

const toItem = (provisioner, healthEntry, organization, isPrivate) => {
  const health = healthEntry?.health || {};
  const presentation = healthEntry?.presentation || {};
  return {
    id: `${organization.name}/${provisioner.name}`,
    organization,
    name: provisioner.name,
    label: presentation.label || provisioner.name,
    description: provisioner.description || '',
    icon: presentation.icon || '',
    artwork: '',
    isPublic: isPrivate ? false : null,
    published: null,
    createdAt: null,
    latestReleaseAt: health.latest_release_at || null,
    downloads: typeof health.downloads === 'number' ? health.downloads : null,
    os: null,
    metadata: null,
    readme: null,
    links: {
      repo: `https://github.com/${provisioner.repo}`,
      homepage: presentation.homepage || '',
      issues: `https://github.com/${provisioner.repo}/issues/new`,
    },
    extras: {
      repo: provisioner.repo,
      tier: healthEntry?.tier || 'unrated',
      failedRules: healthEntry?.failed_rules || [],
      artifactsOk: health.artifacts_ok !== false,
      sidecarsOk: health.sidecars_ok !== false,
      coverage: providerCoverage(health.versions),
    },
    versions: provisioner.versions.map(entry => toVersion(entry, health)),
  };
};

const itemsFrom = ({ catalog, health }, organizationFor, isPrivate) =>
  (catalog?.provisioners || []).map(provisioner =>
    toItem(
      provisioner,
      health?.provisioners?.[provisioner.name],
      organizationFor(provisioner),
      isPrivate
    )
  );

const publicItems = async () => {
  const data = await fetchPublic();
  return itemsFrom(
    data,
    provisioner => {
      const owner = ownerOf(provisioner.repo);
      return { name: owner, logo: ownerLogo(owner) };
    },
    false
  );
};

const organizationOf = (org, membership) =>
  membership
    ? {
        name: org,
        uuid: membership.uuid,
        logo: membership.logo || ownerLogo(org),
        description: membership.description || '',
      }
    : { name: org, logo: ownerLogo(org) };

const listOrg = async org => {
  const ownItems = (await publicItems()).filter(item => item.organization.name === org);
  const membership = membershipFor(org);
  if (!membership) {
    return ownItems;
  }
  let data;
  try {
    data = await fetchOrg(membership.uuid);
  } catch (error) {
    throw privateError(error);
  }
  const organization = organizationOf(org, membership);
  return [...itemsFrom(data, () => organization, true), ...ownItems];
};

const getItem = async (org, name) => {
  const items = await listOrg(org);
  const item = items.find(entry => entry.name === name);
  if (!item) {
    throw new Error(`${org}/${name} not found`);
  }
  return item;
};

const getVersion = async (org, name, version) => {
  const item = await getItem(org, name);
  const entry = item.versions.find(candidate => candidate.version === version);
  if (!entry) {
    throw new Error(`${org}/${name}@${version} not found`);
  }
  return entry;
};

const getProvider = async (org, name, version, provider) => {
  const entry = await getVersion(org, name, version);
  return { name: provider, description: '', architectures: entry.artifacts };
};

const getOrganization = org => Promise.resolve(organizationOf(org, membershipFor(org)));

export const catalogAdapter = {
  listAll: publicItems,
  listOrg,
  getItem,
  getItemSummary: getItem,
  getVersion,
  getProvider,
  getOrganization,
};
