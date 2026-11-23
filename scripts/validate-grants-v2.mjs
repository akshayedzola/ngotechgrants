// Validates data/grants.v2.json against data/taxonomy.json and the v1 file it is built from.
// No dependencies, same style as validate-data.mjs and validate-sources.mjs.
import { readFile } from 'node:fs/promises';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [v2, v1, tax, fundersFile, fx] = await Promise.all([
  load('../data/grants.v2.json'), load('../data/grants.json'), load('../data/taxonomy.json'),
  load('../data/funders.json'), load('../data/fx-rates.json'),
]);

const ids = list => new Set(list.map(item => item.id));
const enums = {
  regions: ids(tax.regions),
  country_groups: ids(tax.country_groups),
  edzola_markets: ids(tax.edzola_markets),
  opportunity_types: ids(tax.opportunity_types),
  eligible_org_types: ids(tax.eligible_org_types),
  org_stage: ids(tax.org_stages),
  org_size: ids(tax.org_sizes),
  themes: ids(tax.themes),
  tech_focus: ids(tax.tech_focus),
  registration_requirements: ids(tax.registration_requirements),
  application_mode: ids(tax.application_modes),
  deadline_pattern: ids(tax.deadline_patterns),
  source_kind: ids(tax.source_kinds),
  outputs: ids(tax.outputs),
  trust_state: ids(tax.trust_states),
};
const SCOPES = new Set(['global', 'multi_region', 'regional', 'national', 'subnational']);
const UNITS = new Set(['per_award', 'per_year', 'total_programme', 'credits', 'discount_percent', 'in_kind_value']);
const FLAGS = new Set(['geography_unknown', 'geography_unmapped', 'geography_ambiguous', 'geography_conflicting', 'amount_unparsed', 'amount_suspect']);
const FOR_PROFIT = new Set(['social_enterprise_for_profit', 'social_enterprise_hybrid', 'tech_for_good_startup', 'private_vendor']);
const countryToRegion = tax.country_to_region;
const funderIds = ids(fundersFile.funders);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '');

const errors = [];
const records = v2.records ?? [];
if (v2.schema_version !== '2.0.0') errors.push(`unexpected schema_version ${v2.schema_version}`);
if (!isDate(v2.as_of)) errors.push('as_of must be YYYY-MM-DD');
if (records.length !== v1.length) errors.push(`v2 has ${records.length} records, v1 has ${v1.length}`);

for (const [index, r] of records.entries()) {
  const err = message => errors.push(`${r.id ?? `record ${index + 1}`}: ${message}`);
  const allOf = (field, values) => {
    if (!Array.isArray(values)) return err(`${field} must be an array`);
    for (const value of values) if (!enums[field].has(value)) err(`invalid ${field} "${value}"`);
  };
  const oneOf = (field, value) => { if (!enums[field].has(value)) err(`invalid ${field} "${value}"`); };
  const original = v1[index];

  // Same records, same order, and every v1 field carried over unchanged (except the two reshaped ones).
  if (r.id !== original?.id) { err(`id out of step with v1 (${original?.id})`); continue; }
  for (const [key, value] of Object.entries(original)) {
    if (key === 'geography') { if (r.geography?.v1_text !== value) err('geography.v1_text differs from v1'); continue; }
    if (key === 'tech_focus') { if (r.v1_tech_focus !== value) err('v1_tech_focus differs from v1'); continue; }
    if (JSON.stringify(r[key]) !== JSON.stringify(value)) err(`v1 field ${key} changed`);
  }

  const g = r.geography ?? {};
  if (g.scope !== null && !SCOPES.has(g.scope)) err(`invalid scope ${g.scope}`);
  allOf('regions', g.regions);
  allOf('country_groups', g.country_groups);
  for (const code of [...(g.countries ?? []), ...(g.excluded_countries ?? [])]) {
    if (code !== '*' && !countryToRegion[code]) err(`unknown country ${code}`);
    if (code !== '*' && !g.regions.includes(countryToRegion[code])) err(`country ${code} outside listed regions`);
  }
  if (g.scope === 'global' && (!g.regions.includes('global') || g.countries.join() !== '*')) err('global scope needs region global and countries ["*"]');
  if (g.scope === 'national' && g.countries.length !== 1) err('national scope needs exactly one country');
  if (g.scope === 'subnational' && !g.subnational) err('subnational scope needs a subnational value');
  if (g.scope === null && !r.review_flags.some(flag => flag.startsWith('geography_'))) err('unknown scope must carry a geography review flag');

  allOf('edzola_markets', r.edzola_markets);
  if (g.scope === 'global' && r.edzola_markets.join() !== 'global') err('global records belong to the global market only');
  for (const market of r.edzola_markets) {
    if (market === 'global') continue;
    const m = tax.edzola_markets.find(item => item.id === market);
    if (!g.regions.some(region => m.regions.includes(region)) && !g.country_groups.length) err(`market ${market} not supported by geography`);
  }

  allOf('opportunity_types', r.opportunity_types);
  if (!r.opportunity_types.length) err('needs an opportunity type');
  allOf('eligible_org_types', r.eligible_org_types);
  if (r.for_profit_eligible !== r.eligible_org_types.some(type => FOR_PROFIT.has(type))) err('for_profit_eligible does not match eligible_org_types');
  allOf('org_stage', r.org_stage);
  allOf('org_size', r.org_size);
  allOf('themes', r.themes);
  if (!r.themes.length) err('needs a theme');
  allOf('tech_focus', r.tech_focus);
  allOf('registration_requirements', r.registration_requirements);
  oneOf('application_mode', r.application_mode);
  oneOf('deadline_pattern', r.deadline_pattern);
  oneOf('source_kind', r.source_kind);
  oneOf('trust_state', r.trust_state);
  allOf('outputs', r.outputs);
  if (r.outputs.join() !== 'public_directory') err('v1-derived records feed the public directory only');
  if (r.trust_state === 'invitation_only' && r.application_mode !== 'invitation_only') err('invitation_only state needs invitation_only mode');

  if (r.funder_id !== null && !funderIds.has(r.funder_id)) err(`unknown funder_id ${r.funder_id}`);
  if ((r.funder_id === null) !== (r.funder_match === null)) err('funder_id and funder_match must be set together');

  const a = r.amount;
  if (a !== null) {
    if (a.display !== (original.grant_amount || null)) err('amount.display must keep the v1 grant_amount text');
    if (a.unit !== null && !UNITS.has(a.unit)) err(`invalid amount unit ${a.unit}`);
    if (a.min !== null && a.max !== null && a.min > a.max) err('amount min above max');
    if (a.currency && !/^[A-Z]{3}$/.test(a.currency)) err('currency must be ISO 4217');
    for (const [raw, conv] of [['min', 'usd_min'], ['max', 'usd_max']]) {
      const rate = fx.usd_per_unit[a.currency];
      if (a[raw] === null || rate === undefined) { if (a[conv] !== null) err(`${conv} set without an amount and rate`); continue; }
      if (a[conv] !== Math.round(a[raw] * rate)) err(`${conv} does not match ${raw} x rate`);
    }
    if (a.max !== null && a.fx_as_of !== fx.as_of) err('fx_as_of must match data/fx-rates.json');
    if (r.review_flags.includes('amount_suspect') && (a.min !== null || a.max !== null)) err('suspect amounts must not carry numbers');
  } else if (original.grant_amount) err('grant_amount present but amount is null');

  // Trust-state rules carry over from v1: no current cycle without evidence, none past its deadline.
  if (['open_now', 'upcoming'].includes(r.trust_state) && r.current_cycle?.closes_on && r.current_cycle.closes_on < v2.as_of) {
    err(`${r.trust_state} deadline ${r.current_cycle.closes_on} passed before as_of ${v2.as_of}; run the freshness job`);
  }
  if (r.last_verified_at !== null && !isDate(r.last_verified_at)) err('last_verified_at must be a date or null');
  if (r.trust_state === 'historical_archive' ? r.next_check_due !== null : !isDate(r.next_check_due)) err('next_check_due must be a date (null only for archive)');
  if (r.next_check_due && r.next_check_due < v2.as_of) err('next_check_due earlier than as_of');
  for (const flag of r.review_flags) if (!FLAGS.has(flag)) err(`unknown review flag ${flag}`);
}

if (errors.length) {
  console.error(`Errors (${errors.length}):\n${errors.slice(0, 200).join('\n')}`);
  process.exit(1);
}
console.log(`Validated ${records.length} v2 records as of ${v2.as_of}. ${v2.summary.linked_to_funder} linked to a funder; ${records.filter(r => r.review_flags.length).length} carry review flags.`);
