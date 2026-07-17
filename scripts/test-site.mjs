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

const current = grants.filter(grant => ['open_now', 'rolling', 'upcoming'].includes(grant.trust_state));
assert.equal(current.length, 8, 'verified current opportunity count changed unexpectedly');
for (const grant of current) {
  assert.ok(grant.current_cycle?.verified_at, `${grant.name} needs a verification date`);
  assert.ok(grant.current_cycle?.source_url, `${grant.name} needs an official evidence URL`);
  assert.ok(grant.current_cycle?.closes_on || grant.trust_state === 'rolling', `${grant.name} needs a deadline or rolling status`);
}

const archivedWithCurrentCycle = grants.filter(grant => grant.trust_state === 'historical_archive' && grant.current_cycle);
assert.equal(archivedWithCurrentCycle.length, 0, 'historical records cannot imply a current cycle');

console.log('Static site contract tests passed.');
