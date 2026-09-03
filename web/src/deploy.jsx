import { API_ORIGIN } from './chromeProps.jsx';
import { createDeployControls, deployableVersion } from './pages';

export { deployableVersion };

const fetchHyperweaverUrl = () =>
  fetch(`${API_ORIGIN}/config`)
    .then(response => (response.ok ? response.json() : null))
    .then(data => data?.hyperweaver?.url || '')
    .catch(() => '');

export const hasHyperweaverEntitlement = user =>
  Array.isArray(user?.entitlements) &&
  user.entitlements.some(
    entitlement =>
      typeof entitlement.value === 'string' && entitlement.value.startsWith('hyperweaver')
  );

const artifactUrl = (item, version) =>
  item.versions.find(entry => entry.version === version)?.artifacts[0]?.downloadUrl || '';

const hrefFor = ({ hyperweaverUrl, item, version }) =>
  `${hyperweaverUrl}/?create=machine&provisioner=${encodeURIComponent(`${item.organization.name}/${item.name}`)}&provisioner_version=${encodeURIComponent(version)}&provisioner_url=${encodeURIComponent(artifactUrl(item, version))}`;

export const {
  DeployButton,
  DeployGlyph,
  ItemQuickActions: ProvisionerQuickActions,
} = createDeployControls({
  fetchHyperweaverUrl,
  canDeploy: hasHyperweaverEntitlement,
  hrefFor,
});
