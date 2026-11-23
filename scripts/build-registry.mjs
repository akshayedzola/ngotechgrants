// Derives data/funders.json and the `summary` block of data/sources.json from the sources themselves, so the
// two never drift from the registry. Run after any edit to data/sources.json:
//
//   node scripts/build-registry.mjs           rewrite funders.json and the sources summary
//   node scripts/build-registry.mjs --check   exit 1 if either file is out of date (used in CI)
//
// Funders appear in the order their first source appears. List fields are unions in first-seen order.
// A funder's booleans are true if any of its sources says true, false if any says false, otherwise null.
import { readFile, writeFile } from 'node:fs/promises';

const check = process.argv.includes('--check');
const sourcesUrl = new URL('../data/sources.json', import.meta.url);
const fundersUrl = new URL('../data/funders.json', import.meta.url);
const stringify = value => `${JSON.stringify(value, null, 2)}\n`;

const sourcesText = await readFile(sourcesUrl, 'utf8');
const fundersText = await readFile(fundersUrl, 'utf8').catch(() => '');
const registry = JSON.parse(sourcesText);
const sources = registry.sources;

const union = lists => [...new Set(lists.flat())];
const tri = values => (values.includes(true) ? true : values.includes(false) ? false : null);
// Count values and order them by count, highest first; ties keep first-seen order.
const tally = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
};

const groups = new Map();
for (const source of sources) {
  if (!groups.has(source.funder_id)) groups.set(source.funder_id, []);
  groups.get(source.funder_id).push(source);
}

const funders = [...groups].map(([id, group]) => ({
  id,
  name: group[0].funder.name,
  funder_type: group[0].funder.funder_type,
  hq_country: group.map(s => s.funder.hq_country).find(Boolean) ?? null,
  funds_digital_capacity: tri(group.map(s => s.funder.funds_digital_capacity)),
  accepts_unsolicited: tri(group.map(s => s.funder.accepts_unsolicited)),
  regions_funded: union(group.map(s => s.geography.regions)),
  edzola_markets: union(group.map(s => s.edzola_markets)),
  opportunity_types: union(group.map(s => s.opportunity_types)),
  source_ids: group.map(s => s.id),
}));

const summary = {
  sources: sources.length,
  funders: funders.length,
  by_priority: tally(sources.map(s => s.priority)),
  by_segment: tally(sources.map(s => s.segment)),
  by_fetch_method: tally(sources.map(s => s.fetch.method)),
  verified_feeds: sources.filter(s => s.fetch.feed_status === 'ok').length,
  documented_apis: sources.filter(s => s.fetch.api_endpoint || s.fetch.api_docs_url).length,
  listing_url_ok: sources.filter(s => s.verification.url_status === 'ok').length,
  by_output: tally(sources.flatMap(s => s.outputs)),
  by_edzola_market: tally(sources.flatMap(s => s.edzola_markets)),
  by_region: tally(sources.flatMap(s => s.geography.regions)),
  by_opportunity_type: tally(sources.flatMap(s => s.opportunity_types)),
  by_eligible_org_type: tally(sources.flatMap(s => s.eligible_org_types)),
  by_funder_type: tally(sources.map(s => s.funder.funder_type)),
  funds_digital_capacity: funders.filter(f => f.funds_digital_capacity === true).length,
};

const nextSources = stringify({ ...registry, summary });
const nextFunders = stringify({ generated_on: registry.generated_on, funders });

if (check) {
  const stale = [];
  if (nextSources !== sourcesText) stale.push('data/sources.json summary');
  if (nextFunders !== fundersText) stale.push('data/funders.json');
  if (stale.length) {
    console.error(`Out of date: ${stale.join(', ')}. Run node scripts/build-registry.mjs and commit the result.`);
    process.exit(1);
  }
  console.log(`Registry derivations are up to date (${sources.length} sources, ${funders.length} funders).`);
} else {
  await writeFile(sourcesUrl, nextSources);
  await writeFile(fundersUrl, nextFunders);
  console.log(`Wrote data/funders.json (${funders.length} funders) and the sources summary.`);
}
