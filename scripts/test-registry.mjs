// Cross-file tests for the source registry and the v2 records: things a per-file validator cannot see.
// Run after validate-sources.mjs and validate-grants-v2.mjs. Warnings are printed; failures exit 1.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [registry, fundersFile, tax, schema, fx, v2] = await Promise.all([
  load('../data/sources.json'), load('../data/funders.json'), load('../data/taxonomy.json'),
  load('../schema/sources.schema.json'), load('../data/fx-rates.json'), load('../data/grants.v2.json'),
]);
await import('../grant-utils.js');
const { amountValue } = globalThis.GrantUtils;

const sources = registry.sources;
const funders = fundersFile.funders;
const countryToRegion = tax.country_to_region;
const warnings = [];
const byId = new Map(sources.map(s => [s.id, s]));

// 1. Taxonomy: twelve regions, each country in exactly one, lookup matches region membership.
const seen = new Map();
for (const region of tax.regions) {
  for (const code of region.countries) {
    assert.ok(!seen.has(code), `${code} is in ${seen.get(code)} and ${region.id}`);
    seen.set(code, region.id);
    assert.equal(countryToRegion[code], region.id, `country_to_region disagrees for ${code}`);
  }
}
assert.equal(Object.keys(countryToRegion).length, seen.size, 'country_to_region lists countries outside every region');
for (const market of tax.edzola_markets) {
  for (const code of market.countries.filter(c => c !== '*')) {
    assert.ok(market.regions.includes(countryToRegion[code]), `market ${market.id}: ${code} is outside its regions`);
  }
}
for (const code of tax.country_group_members.EU27) assert.ok(countryToRegion[code], `EU27 member ${code} unknown`);
assert.equal(tax.country_group_members.EU27.length, 27, 'EU27 must list 27 members');

// 2. Schema enums are generated from the taxonomy, so every taxonomy-backed enum must match it exactly.
const taxonomyEnums = Object.values(tax).filter(Array.isArray)
  .filter(list => list[0]?.id).map(list => list.map(item => item.id).sort().join());
const schemaEnums = [];
(function walk(node) {
  if (Array.isArray(node)) return node.forEach(walk);
  if (node && typeof node === 'object') {
    if (Array.isArray(node.enum)) schemaEnums.push(node.enum.filter(v => v !== null).sort().join());
    Object.values(node).forEach(walk);
  }
}(schema));
for (const listName of ['funder_types', 'source_kinds', 'opportunity_types', 'regions', 'edzola_markets', 'themes', 'registration_requirements', 'risk_flags']) {
  const expected = tax[listName].map(item => item.id).sort().join();
  assert.ok(schemaEnums.includes(expected), `schema enum for ${listName} is out of step with the taxonomy; regenerate the schema`);
}
assert.ok(taxonomyEnums.length > 15, 'taxonomy lists missing');

// 3. Sources: geography agrees with the regions list, and the docs' rules hold.
const days = Object.fromEntries(tax.check_frequencies.map(f => [f.id, f.days]));
const PERSONAL = /[\w.+-]+@[\w-]+\.[a-z]{2,}|\+\d{1,3}[\s-]?\d{3,}[\s-]?\d{3,}/i;
for (const s of sources) {
  const g = s.geography;
  for (const code of g.countries.filter(c => c !== '*')) {
    assert.ok(g.regions.includes(countryToRegion[code]), `${s.id}: ${code} is in ${countryToRegion[code]}, not in its regions`);
  }
  for (const code of g.excluded_countries) assert.ok(!g.countries.includes(code), `${s.id}: ${code} both included and excluded`);
  if (g.scope === 'national') assert.equal(g.countries.length, 1, `${s.id}: national scope needs one country`);
  const checked = new Date(`${s.verification.checked_on}T00:00:00Z`);
  const due = new Date(`${s.next_check_due}T00:00:00Z`);
  assert.ok(due >= checked, `${s.id}: next_check_due before checked_on`);
  assert.ok((due - checked) / 864e5 <= days[s.check_frequency], `${s.id}: next_check_due later than ${s.check_frequency}`);
  if (s.source_kind === 'aggregator_listing') assert.ok(s.risk_flags.includes('aggregator_secondary_source'), `${s.id}: aggregator without aggregator_secondary_source`);
  for (const field of [s.description, s.notes, s.verification.evidence]) {
    assert.ok(!PERSONAL.test(field ?? ''), `${s.id}: looks like personal contact details`);
  }
  for (const market of s.edzola_markets.filter(m => m !== 'global')) {
    const m = tax.edzola_markets.find(item => item.id === market);
    const fits = g.countries.includes('*') || g.countries.some(c => m.countries.includes(c))
      || (!g.countries.some(c => m.regions.includes(countryToRegion[c])) && g.regions.some(r => m.regions.includes(r)));
    if (!fits) warnings.push(`${s.id}: market ${market} not implied by its geography`);
  }
  if (s.opportunity_types.includes('tender_rfp') && s.outputs.includes('public_directory')) {
    warnings.push(`${s.id}: mixes tenders with public opportunities; the scanner must route tender items to internal_bd`);
  }
  const award = s.typical_award;
  if (award) {
    const rate = fx.usd_per_unit[award.currency];
    for (const [raw, conv] of [['min', 'usd_min'], ['max', 'usd_max']]) {
      if (award[raw] === null || award[conv] === null) continue;
      assert.ok(rate !== undefined, `${s.id}: ${award.currency} has a USD value but no rate in data/fx-rates.json`);
      assert.ok(Math.abs(award[raw] * rate - award[conv]) <= Math.max(1, 0.005 * award[conv]), `${s.id}: ${conv} disagrees with data/fx-rates.json`);
    }
    if (award.min !== null && award.max !== null) assert.ok(award.min <= award.max, `${s.id}: typical_award min above max`);
  }
}

// 4. Funders: one per funder_id, consistent across its sources, and every source accounted for.
assert.equal(new Set(funders.map(f => f.id)).size, funders.length, 'duplicate funder ids');
assert.deepEqual(funders.flatMap(f => f.source_ids).sort(), sources.map(s => s.id).sort(), 'funders do not account for every source exactly once');
for (const f of funders) {
  for (const id of f.source_ids) {
    const s = byId.get(id);
    assert.equal(s.funder_id, f.id, `${id} is listed under ${f.id} but points at ${s.funder_id}`);
    assert.equal(s.funder.name, f.name, `${f.id}: funder name differs in ${id}`);
    assert.equal(s.funder.funder_type, f.funder_type, `${f.id}: funder type differs in ${id}`);
  }
}
const nameKey = name => name.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const names = new Map();
for (const f of funders) {
  const key = nameKey(f.name);
  if (names.has(key)) warnings.push(`funders ${names.get(key)} and ${f.id} share the name "${f.name}"`);
  names.set(key, f.id);
}

// 5. v2 records: golden cases for each mapping path.
const record = id => v2.records.find(r => r.id === id);
const golden = [
  ['d-prize-global-competition', r => {
    assert.equal(r.geography.scope, 'global');
    assert.deepEqual(r.edzola_markets, ['global']);
    assert.deepEqual(r.amount, { min: 20000, max: 20000, currency: 'USD', unit: 'per_award', usd_min: 20000, usd_max: 20000, fx_as_of: fx.as_of, display: '$20,000' });
    assert.equal(r.funder_id, 'd-prize');
    assert.deepEqual(r.opportunity_types, ['prize_challenge']);
  }],
  ['100x-impact-accelerator', r => {
    assert.equal(r.amount.currency, 'GBP');
    assert.equal(r.amount.usd_max, Math.round(150000 * fx.usd_per_unit.GBP));
  }],
  ['turn-io', r => {
    assert.deepEqual(r.geography.countries.sort(), ['IN', 'KE', 'NG', 'SN', 'ZA']);
    assert.deepEqual(r.edzola_markets, ['india', 'east_africa']);
    assert.equal(r.geography.scope, 'multi_region');
  }],
  ['banner-bank-community-support-program', r => {
    assert.equal(r.geography.scope, 'subnational');
    assert.equal(r.geography.subnational, 'California; Idaho; Oregon; Washington State');
    assert.deepEqual(r.edzola_markets, ['north_america']);
  }],
  ['mercy-corps-ventures', r => {
    assert.deepEqual(r.geography.country_groups, ['LMIC']);
    assert.ok(r.edzola_markets.includes('india') && r.edzola_markets.includes('east_africa'));
  }],
  ['ribbons-of-hope-invest-in-women', r => assert.ok(r.review_flags.includes('geography_ambiguous'))],
  ['imagine', r => {
    assert.equal(r.geography.scope, null);
    assert.ok(r.review_flags.includes('geography_unknown'), '"Event" is not geography');
  }],
  ['soros-justice-fellowship', r => {
    assert.ok(r.review_flags.includes('amount_suspect'));
    assert.equal(r.amount.usd_max, null);
  }],
  ['the-david-prize', r => {
    assert.equal(r.amount.unit, 'per_year');
    assert.equal(r.amount.max, 100000);
    assert.ok(!r.review_flags.includes('amount_suspect'), '"x 2 yrs" is a duration, not an amount');
  }],
  ['morgan-stanley-alliance-for-childrens-mental-health', r => {
    assert.equal(r.trust_state, 'historically_recurring');
    assert.equal(r.current_cycle, null);
    assert.equal(r.previous_cycle.closes_on, '2026-07-24');
    assert.equal(r.last_verified_at, '2026-07-17');
  }],
  ['rise-up', r => {
    assert.equal(r.trust_state, 'closed');
    assert.deepEqual(r.eligible_org_types, ['individual']);
    assert.deepEqual(r.edzola_markets, ['east_africa']);
  }],
];
for (const [id, expect] of golden) {
  const r = record(id);
  assert.ok(r, `golden record ${id} missing`);
  try { expect(r); } catch (error) { error.message = `${id}: ${error.message}`; throw error; }
}

// 6. v2 amounts agree with the site's own parser wherever both read one plain cash figure.
let compared = 0;
for (const r of v2.records) {
  const a = r.amount;
  if (!a || a.currency !== 'USD' || a.max === null || /\+|x \d/.test(a.display)) continue;
  assert.equal(a.max, amountValue(a.display), `${r.id}: v2 max ${a.max} vs site parser ${amountValue(a.display)} for "${a.display}"`);
  compared += 1;
}
assert.ok(compared > 350, `only ${compared} amounts compared`);

// 7. Funder links from v1 records point at a funder whose name or website matches.
for (const r of v2.records.filter(item => item.funder_id)) {
  const f = funders.find(item => item.id === r.funder_id);
  assert.ok(['name', 'domain'].includes(r.funder_match), `${r.id}: unexplained funder link`);
  if (r.funder_match === 'domain') assert.ok(r.official_url, `${r.id}: domain match without a URL`);
  assert.ok(f, `${r.id}: funder ${r.funder_id} missing`);
}

if (warnings.length) console.warn(`Warnings for review (${warnings.length}):\n${warnings.join('\n')}`);
console.log(`Registry cross-file tests passed: ${sources.length} sources, ${funders.length} funders, ${golden.length} golden v2 records, ${compared} amounts cross-checked.`);
