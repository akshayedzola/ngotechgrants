// Moves records whose verified deadline has passed out of the current states, instead of letting the build fail
// (docs/SOURCES.md, "Freshness rule"). A past-deadline `open_now` or `upcoming` record becomes:
//   - `historically_recurring` when `is_recurring` is true. Its cycle moves to `previous_cycle`, because the
//     current-cycle rules do not allow a current cycle on that state.
//   - `closed` otherwise. Its cycle stays as `current_cycle` with status `closed`, so the closing date stays visible.
//
//   node scripts/refresh-freshness.mjs                     apply, using today's date (UTC)
//   node scripts/refresh-freshness.mjs --today 2026-11-23  apply as of a given date
//   node scripts/refresh-freshness.mjs --check             exit 1 if anything needs moving (no writes)
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const check = args.includes('--check');
const todayArg = args[args.indexOf('--today') + 1];
const today = args.includes('--today') ? todayArg : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today ?? '')) {
  console.error('--today needs a YYYY-MM-DD date');
  process.exit(2);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dataUrl = new URL('../data/grants.json', import.meta.url);
const grants = JSON.parse(await readFile(dataUrl, 'utf8'));
const moved = [];

for (const grant of grants) {
  const cycle = grant.current_cycle;
  if (!['open_now', 'upcoming'].includes(grant.trust_state) || !cycle?.closes_on || cycle.closes_on >= today) continue;
  const from = grant.trust_state;
  const year = cycle.year ?? cycle.closes_on.slice(0, 4);
  const note = `${year} cycle closed on ${cycle.closes_on}; moved from ${from} by the freshness job on ${today}.`;
  // The summary was written while the cycle was open ("is accepting applications"). Replace it so the page never
  // says "open" next to a closed label, and keep the old wording on the cycle for reference.
  const [y, m, d] = cycle.closes_on.split('-').map(Number);
  const closedOn = `${d} ${MONTHS[m - 1]} ${y}`;
  const closed = { ...cycle, status: 'closed', note, summary_when_open: grant.summary };
  grant.summary = grant.is_recurring
    ? `The ${year} cycle closed on ${closedOn}. This programme has run in more than one year; check the official page for the next call.`
    : `The ${year} cycle closed on ${closedOn}. Check the official page for any future call.`;
  if (grant.is_recurring) {
    grant.trust_state = 'historically_recurring';
    grant.previous_cycle = closed;
    grant.current_cycle = null;
  } else {
    grant.trust_state = 'closed';
    grant.current_cycle = closed;
  }
  moved.push(`${grant.id}: ${from} -> ${grant.trust_state} (closed ${cycle.closes_on})`);
}

if (check) {
  if (moved.length) {
    console.error(`${moved.length} record(s) need the freshness job as of ${today}:\n${moved.join('\n')}`);
    process.exit(1);
  }
  console.log(`No past-deadline current records as of ${today}.`);
} else {
  if (moved.length) await writeFile(dataUrl, `${JSON.stringify(grants, null, 2)}\n`);
  console.log(moved.length ? `Moved ${moved.length} record(s) as of ${today}:\n${moved.join('\n')}` : `Nothing to move as of ${today}.`);
}
