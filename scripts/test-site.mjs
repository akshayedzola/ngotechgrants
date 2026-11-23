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
assert.equal(grants.length, 646, 'deduplicated record count changed unexpectedly');

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

// Headline counts are filled from the data, not typed into the page.
for (const id of ['hs-total', 'hs-recurring', 'k-recurring', 'hp-recurring', 'hp-total']) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} must exist in the page`);
  assert.match(app, new RegExp(`'${id}'`), `${id} must be set from the data in app.js`);
}

console.log('Static site contract tests passed.');
