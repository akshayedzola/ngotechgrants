import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, app, grants] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../data/grants.json', import.meta.url), 'utf8').then(JSON.parse),
]);

assert.match(html, /<script src="app\.js" defer><\/script>/, 'index must load app.js');
assert.match(html, /template=add-grant\.yml/, 'add-grant issue form must be linked');
assert.match(html, /template=correct-grant\.yml/, 'correction issue form must be linked');
assert.doesNotMatch(`${html}\n${app}`, /Times Spotted|times_mentioned|for_profit_eligible|f-fp/, 'removed fields must not return');
// Records are added as opportunities are verified, so guard against duplicates rather than pinning a count.
assert.ok(grants.length >= 646, 'records were removed unexpectedly');
const seenUrls = new Map();
for (const grant of grants.filter(item => item.trust_state !== 'historical_archive' && item.official_url)) {
  const key = `${grant.name.toLowerCase()}|${grant.official_url.replace(/\/+$/, '').toLowerCase()}`;
  assert.ok(!seenUrls.has(key), `${grant.name} duplicates ${seenUrls.get(key)}`);
  seenUrls.set(key, grant.id);
}

// The number of current records changes as deadlines pass (scripts/refresh-freshness.mjs), so test the rules,
// not a fixed count.
const current = grants.filter(grant => ['open_now', 'rolling', 'upcoming'].includes(grant.trust_state));
for (const grant of current) {
  assert.ok(grant.current_cycle?.verified_at, `${grant.name} needs a verification date`);
  assert.ok(grant.current_cycle?.source_url, `${grant.name} needs an official evidence URL`);
  assert.ok(grant.current_cycle?.closes_on || grant.trust_state === 'rolling', `${grant.name} needs a deadline or rolling status`);
}

const archivedWithCurrentCycle = grants.filter(grant => grant.trust_state === 'historical_archive' && grant.current_cycle);
assert.equal(archivedWithCurrentCycle.length, 0, 'historical records cannot imply a current cycle');

// Records moved by the freshness job keep their evidence.
for (const grant of grants.filter(item => item.previous_cycle)) {
  assert.equal(grant.trust_state, 'historically_recurring', `${grant.name}: previous_cycle is only for recurring records`);
  assert.equal(grant.current_cycle, null, `${grant.name}: cannot have both a current and a previous cycle`);
  assert.ok(grant.previous_cycle.verified_at && grant.previous_cycle.source_url, `${grant.name}: previous cycle lost its evidence`);
}
for (const grant of grants.filter(item => item.trust_state === 'closed' && item.current_cycle)) {
  assert.equal(grant.current_cycle.status, 'closed', `${grant.name}: closed record with a non-closed cycle`);
}
// A record the freshness job moved must not still describe itself as open.
const OPEN_WORDING = /currently accepting|is accepting|are accepting|applications are open|window is open|is open for|cycle is open|now open|accepting submissions/i;
for (const grant of grants) {
  const cycle = grant.current_cycle ?? grant.previous_cycle;
  if (cycle?.status !== 'closed') continue;
  assert.doesNotMatch(grant.summary, OPEN_WORDING, `${grant.name}: closed cycle but the summary still reads as open`);
  assert.ok(cycle.summary_when_open || !/freshness job/.test(cycle.note ?? ''), `${grant.name}: freshness job must keep the original summary`);
}
// The modal only calls a summary "current" for current records.
assert.match(html, /id="modal-desc-title"/, 'modal summary heading needs an id');
assert.match(app, /modal-desc-title'\)\.textContent = CURRENT_STATES\.has/, 'modal summary heading must depend on the trust state');

// Headline counts are filled from the data, not typed into the page.
for (const id of ['hs-total', 'hs-recurring', 'k-recurring', 'hp-recurring', 'hp-total']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} must exist in the page`);
  assert.match(app, new RegExp(`'${id}'`), `${id} must be set from the data in app.js`);
}

// edzola.com/resources/ngo-tech-grants/ reads data/grants.json from GitHub Pages. It needs these fields on every record.
for (const grant of grants) {
  for (const field of ['id', 'name', 'trust_state', 'opportunity_type']) assert.ok(grant[field], `${grant.id || grant.name}: ${field} is required by the edzola.com finder`);
}
assert.match(html, /rel="canonical" href="https:\/\/www\.edzola\.com\/resources\/ngo-tech-grants\/"/, 'the canonical must point at the edzola.com finder');

console.log('Static site contract tests passed.');
