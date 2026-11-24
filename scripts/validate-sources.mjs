// Validates data/sources.json against data/taxonomy.json. No dependencies, same style as validate-data.mjs.
import { readFile } from 'node:fs/promises';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const registry = await load('../data/sources.json');
const tax = await load('../data/taxonomy.json');

const ids = list => new Set(list.map(item => item.id));
const enums = {
  funder_type: ids(tax.funder_types),
  source_kind: ids(tax.source_kinds),
  opportunity_types: ids(tax.opportunity_types),
  eligible_org_types: ids(tax.eligible_org_types),
  org_stage: ids(tax.org_stages),
  org_size: ids(tax.org_sizes),
  regions: ids(tax.regions),
  country_groups: ids(tax.country_groups),
  edzola_markets: ids(tax.edzola_markets),
  themes: ids(tax.themes),
  tech_focus: ids(tax.tech_focus),
  registration_requirements: ids(tax.registration_requirements),
  application_mode: ids(tax.application_modes),
  deadline_pattern: ids(tax.deadline_patterns),
  method: ids(tax.fetch_methods),
  check_frequency: ids(tax.check_frequencies),
  outputs: ids(tax.outputs),
  priority: ids(tax.priorities),
  risk_flags: ids(tax.risk_flags),
};
const knownCountries = new Set(Object.keys(tax.country_to_region));
const months = new Set(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');
const isUrl = value => {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};

const errors = [];
const warnings = [];
const seenIds = new Set();
const seenListing = new Map();

for (const [index, s] of (registry.sources ?? []).entries()) {
  const where = `${s.id ?? `source ${index + 1}`}`;
  const err = message => errors.push(`${where}: ${message}`);
  const oneOf = (field, value) => { if (value !== null && !enums[field].has(value)) err(`invalid ${field} "${value}"`); };
  const allOf = (field, values) => {
    if (!Array.isArray(values)) return err(`${field} must be an array`);
    for (const value of values) if (!enums[field].has(value)) err(`invalid ${field} "${value}"`);
  };

  if (!slug.test(s.id ?? '')) err('id must be kebab-case');
  if (seenIds.has(s.id)) err('duplicate id');
  seenIds.add(s.id);
  if (!slug.test(s.funder_id ?? '')) err('funder_id must be kebab-case');
  if (!s.name) err('missing name');
  if (!s.description) err('missing description');
  else if (s.description.length > 400) err('description over 400 characters');

  oneOf('funder_type', s.funder?.funder_type);
  if (s.funder?.hq_country && !knownCountries.has(s.funder.hq_country)) err(`unknown hq_country ${s.funder.hq_country}`);
  oneOf('source_kind', s.source_kind);
  allOf('opportunity_types', s.opportunity_types);
  if (!s.opportunity_types?.length) err('needs at least one opportunity type');
  allOf('eligible_org_types', s.eligible_org_types);
  allOf('org_stage', s.org_stage);
  allOf('org_size', s.org_size);
  allOf('regions', s.geography?.regions);
  allOf('country_groups', s.geography?.country_groups);
  for (const c of [...(s.geography?.countries ?? []), ...(s.geography?.excluded_countries ?? [])]) {
    if (c !== '*' && !knownCountries.has(c)) err(`unknown country code ${c}`);
  }
  allOf('edzola_markets', s.edzola_markets);
  allOf('themes', s.themes);
  allOf('tech_focus', s.tech_focus);
  allOf('registration_requirements', s.registration_requirements);
  oneOf('application_mode', s.application_mode);
  oneOf('deadline_pattern', s.deadline_pattern);
  for (const m of s.typical_cycle_months ?? []) if (!months.has(m)) err(`invalid month ${m}`);

  const f = s.fetch ?? {};
  oneOf('method', f.method);
  if (!isUrl(f.listing_url)) err('listing_url must be a web URL');
  for (const key of ['feed_url', 'api_endpoint', 'api_docs_url', 'newsletter_url']) {
    if (f[key] && !isUrl(f[key])) err(`${key} must be a web URL`);
  }
  if (['rss', 'atom'].includes(f.method) && (!f.feed_url || f.feed_status !== 'ok')) err('feed method needs a verified feed_url');
  if (f.feed_status === 'ok' && !f.feed_url) err('feed_status ok without feed_url');
  if (f.method === 'api' && !(f.api_endpoint || f.api_docs_url)) err('api method needs api_endpoint or api_docs_url');

  oneOf('check_frequency', s.check_frequency);
  allOf('outputs', s.outputs);
  if (!s.outputs?.length) err('needs at least one output');
  if (s.opportunity_types?.includes('tender_rfp') && s.outputs?.includes('public_directory')
      && s.opportunity_types.length === 1) err('tender-only sources must not feed the public directory');
  oneOf('priority', s.priority);
  allOf('risk_flags', s.risk_flags);
  if (!isDate(s.verification?.checked_on)) err('verification.checked_on must be YYYY-MM-DD');
  if (!isDate(s.next_check_due)) err('next_check_due must be YYYY-MM-DD');
  if (s.verification?.url_status === 'failed') warnings.push(`${where}: listing URL failed at last check`);

  const listing = f.listing_url?.replace(/\/+$/, '').toLowerCase();
  if (listing && seenListing.has(listing)) warnings.push(`${where}: same listing_url as ${seenListing.get(listing)}`);
  else if (listing) seenListing.set(listing, s.id);
}

if (warnings.length) console.warn(`Warnings (${warnings.length}):\n${warnings.join('\n')}`);
if (errors.length) {
  console.error(`Errors (${errors.length}):\n${errors.join('\n')}`);
  process.exit(1);
}
const today = new Date().toISOString().slice(0, 10);
const due = registry.sources.filter(s => s.next_check_due <= today).length;
console.log(`Validated ${registry.sources.length} sources (${new Set(registry.sources.map(s => s.funder_id)).size} funders). ${due} due for a check today.`);
