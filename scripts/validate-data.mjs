import { readFile } from 'node:fs/promises';

const dataUrl = new URL('../data/grants.json', import.meta.url);
const grants = JSON.parse(await readFile(dataUrl, 'utf8'));

const allowedStates = new Set([
  'open_now',
  'rolling',
  'upcoming',
  'historically_recurring',
  'invitation_only',
  'closed',
  'historical_archive',
  'needs_verification',
]);

const required = [
  'id',
  'name',
  'summary',
  'historical_context',
  'opportunity_type',
  'trust_state',
  'years_observed',
];

const errors = [];
const ids = new Set();
const today = new Date().toISOString().slice(0, 10);

function validWebUrl(value) {
  if (!value) return true;
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

for (const [index, grant] of grants.entries()) {
  for (const field of required) {
    if (grant[field] === undefined || grant[field] === null || grant[field] === '') {
      errors.push(`Record ${index + 1} (${grant.name || 'unnamed'}) is missing ${field}`);
    }
  }

  if (ids.has(grant.id)) errors.push(`Duplicate id: ${grant.id}`);
  ids.add(grant.id);

  if (!allowedStates.has(grant.trust_state)) {
    errors.push(`Invalid trust_state for ${grant.name}: ${grant.trust_state}`);
  }

  if (!validWebUrl(grant.official_url)) errors.push(`Invalid official_url for ${grant.name}`);

  if (!Array.isArray(grant.years_observed) || grant.years_observed.some(year => !Number.isInteger(year))) {
    errors.push(`Invalid years_observed for ${grant.name}`);
  }

  if (grant.current_cycle) {
    if (!grant.current_cycle.verified_at || !grant.current_cycle.source_url) {
      errors.push(`Current cycle for ${grant.name} lacks verified_at or source_url`);
    }
    if (!validWebUrl(grant.current_cycle.source_url)) errors.push(`Invalid current-cycle source URL for ${grant.name}`);
    if (grant.trust_state === 'open_now' && grant.current_cycle.closes_on && grant.current_cycle.closes_on < today) {
      errors.push(`Open-now deadline has passed for ${grant.name}: ${grant.current_cycle.closes_on}`);
    }
    if (!['open_now', 'rolling', 'upcoming', 'closed', 'invitation_only'].includes(grant.trust_state)) {
      errors.push(`Current cycle for ${grant.name} has incompatible trust_state ${grant.trust_state}`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const counts = Object.groupBy
  ? Object.groupBy(grants, grant => grant.trust_state)
  : grants.reduce((result, grant) => {
      (result[grant.trust_state] ??= []).push(grant);
      return result;
    }, {});

console.log(`Validated ${grants.length} grants with ${ids.size} unique ids.`);
for (const state of [...allowedStates]) {
  console.log(`${state}: ${counts[state]?.length || 0}`);
}
