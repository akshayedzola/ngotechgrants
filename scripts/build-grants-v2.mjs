// Builds data/grants.v2.json, the v2 opportunity records described in docs/SOURCES.md, from data/grants.json (v1,
// still the file people edit and the public site reads) plus the taxonomy, funders, sources and FX rates.
//
//   node scripts/build-grants-v2.mjs                     rebuild as of today (UTC)
//   node scripts/build-grants-v2.mjs --as-of 2026-11-23  rebuild as of a given date
//   node scripts/build-grants-v2.mjs --check             exit 1 if grants.v2.json is out of date (uses its as_of)
//
// v2 keeps every v1 field. Two v1 fields change shape because v2 reuses their names: `geography` becomes an
// object (the v1 text is kept in `geography.v1_text`) and `tech_focus` becomes a list (v1 text in `v1_tech_focus`).
// Fields the v1 data cannot answer stay empty and are listed in `review_flags` or left for review.
import { readFile, writeFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const check = args.includes('--check');
const read = async path => readFile(new URL(path, import.meta.url), 'utf8');
const outUrl = new URL('../data/grants.v2.json', import.meta.url);
const existing = await readFile(outUrl, 'utf8').catch(() => '');

let asOf = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : new Date().toISOString().slice(0, 10);
if (check) asOf = existing ? JSON.parse(existing).as_of : asOf;
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? '')) {
  console.error('--as-of needs a YYYY-MM-DD date');
  process.exit(2);
}

const grants = JSON.parse(await read('../data/grants.json'));
const tax = JSON.parse(await read('../data/taxonomy.json'));
const { funders } = JSON.parse(await read('../data/funders.json'));
const { sources } = JSON.parse(await read('../data/sources.json'));
const fx = JSON.parse(await read('../data/fx-rates.json'));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const uniq = list => [...new Set(list)];
const parts = text => String(text ?? '').split(',').map(part => part.trim()).filter(Boolean);
const maps = tax.v1_mappings;
const countryToRegion = tax.country_to_region;
const FOR_PROFIT = new Set(['social_enterprise_for_profit', 'social_enterprise_hybrid', 'tech_for_good_startup', 'private_vendor']);
const LMIC_MARKETS = ['india', 'east_africa', 'latin_america', 'brazil', 'indonesia'];

// ---------- geography ----------
function buildGeography(text) {
  const flags = [];
  let regions = [];
  let countries = [];
  let groups = [];
  const subnational = [];
  const unknown = [];
  let global = false;
  let specified = false;
  for (const part of parts(text)) {
    const spec = maps.geography[part];
    if (!spec) { unknown.push(part); continue; }
    if (spec.ignore) continue;
    if (spec.ambiguous) { flags.push('geography_ambiguous'); continue; }
    if (spec.scope === null) continue; // "Not Specified"
    specified = true;
    if (spec.scope === 'global') global = true;
    regions.push(...(spec.regions ?? []));
    countries.push(...(spec.countries ?? []));
    groups.push(...(spec.country_groups ?? []));
    if (spec.subnational) subnational.push(spec.subnational);
  }
  if (unknown.length) flags.push('geography_unmapped');
  countries = uniq(countries);
  const named = countries.filter(code => code !== '*');
  regions = uniq([...regions, ...named.map(code => countryToRegion[code])]);
  groups = uniq(groups);
  if (global && named.length) flags.push('geography_conflicting');
  if (!specified && !flags.includes('geography_ambiguous')) flags.push('geography_unknown');

  let scope = null;
  if (global) scope = 'global';
  else if (subnational.length && named.length === 1) scope = 'subnational';
  else if (named.length === 1 && regions.length === 1) scope = 'national';
  else if (regions.length === 1) scope = 'regional';
  else if (regions.length > 1 || groups.length) scope = 'multi_region';

  return {
    geography: {
      scope,
      regions: global ? uniq(['global', ...regions]) : regions,
      countries: global ? ['*'] : named,
      country_groups: groups,
      excluded_countries: [],
      subnational: uniq(subnational).join('; ') || null,
      v1_text: text ?? null,
      ...(unknown.length ? { unmapped_parts: unknown } : {}),
    },
    flags,
  };
}

function marketsFor(geo) {
  if (geo.countries.includes('*')) return ['global'];
  const out = [];
  for (const market of tax.edzola_markets) {
    if (market.id === 'global') continue;
    const byCountry = geo.countries.some(code => market.countries.includes(code));
    const regionOnly = !geo.countries.some(code => market.regions.includes(countryToRegion[code]))
      && geo.regions.some(region => market.regions.includes(region));
    const byGroup = geo.country_groups.some(group => ['LMIC', 'ODA_ELIGIBLE'].includes(group)) && LMIC_MARKETS.includes(market.id);
    if (byCountry || regionOnly || byGroup) out.push(market.id);
  }
  return out;
}

// ---------- amounts ----------
const SYMBOLS = [['£', 'GBP'], ['€', 'EUR'], ['₹', 'INR'], ['Rs', 'INR'], ['$', 'USD']];
const toNumber = (digits, suffix) => {
  const base = Number(digits.replaceAll(',', ''));
  const s = (suffix ?? '').toLowerCase();
  return base * (s.startsWith('b') ? 1e9 : s === 'm' || s.startsWith('million') ? 1e6 : s === 'k' ? 1e3 : 1);
};
const usd = (value, currency) => {
  const rate = fx.usd_per_unit[currency];
  return value === null || rate === undefined ? null : Math.round(value * rate);
};

function parseAmount(text) {
  const display = text || null;
  const empty = { min: null, max: null, currency: null, unit: null, usd_min: null, usd_max: null, fx_as_of: null, display };
  if (!text) return { amount: null, flags: [] };
  if (!/\d/.test(text)) {
    const inKind = /pro bono|tech|mentorship/i.test(text);
    return { amount: { ...empty, unit: inKind ? 'in_kind_value' : null }, flags: [] };
  }
  const currency = SYMBOLS.find(([symbol]) => text.includes(symbol))?.[1] ?? null;
  // Only the cash part before any "+ ... software/tech/credits" add-on is parsed; the add-on stays in `display`.
  // Duration multipliers such as "x 3 yrs" are not amounts.
  const cash = text.split('+ ')[0].replace(/\bx\s*\d+\s*(yrs?|years?)\b/gi, '');
  const number = /([\d][\d,]*(?:\.\d+)?)\s*(k|m|b|million|billion)?\b/gi;
  const values = [...cash.matchAll(number)].map(match => ({
    value: toNumber(match[1], match[2]),
    suspect: (match[1].includes(',') && Boolean(match[2])) || toNumber(match[1], match[2]) < 100,
  }));
  if (!values.length || !currency) return { amount: empty, flags: ['amount_unparsed'] };
  // A likely typo ("$2", "$100,000K") keeps its text for review but gets no numbers, so it cannot skew sorting.
  if (values.some(v => v.suspect)) return { amount: { ...empty, currency }, flags: ['amount_suspect'] };
  const upTo = /\bup to\b/i.test(cash);
  const range = /[–-]/.test(cash) && values.length >= 2;
  const min = upTo ? null : values[0].value;
  const max = range ? values[1].value : values[0].value;
  const unit = /\/\s*yr|per year|annual/i.test(text) ? 'per_year' : 'per_award';
  return {
    amount: { min, max, currency, unit, usd_min: usd(min, currency), usd_max: usd(max, currency), fx_as_of: fx.as_of, display },
    flags: [],
  };
}

// ---------- funders ----------
const SECOND_LEVEL = new Set(['co', 'or', 'org', 'ac', 'gov', 'com', 'net', 'edu', 'go', 'ne']);
function registrableDomain(url) {
  try {
    const labels = new URL(url).hostname.toLowerCase().replace(/^www\./, '').split('.');
    const n = SECOND_LEVEL.has(labels.at(-2)) && labels.at(-1).length === 2 ? 3 : 2;
    return labels.slice(-n).join('.');
  } catch {
    return null;
  }
}
const normalise = name => String(name).toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(the|inc|llc|ltd)\b/g, ' ').replace(/\s+/g, ' ').trim();
// Aggregators, platforms and directories share domains with many programmes, so they never match on domain.
const NO_DOMAIN_MATCH = new Set(['aggregator', 'crowdfunding_platform', 'network_association', 'validation_service', 'pro_bono_marketplace']);
const funderById = new Map(funders.map(f => [f.id, f]));
const domainFunders = new Map();
for (const source of sources) {
  if (NO_DOMAIN_MATCH.has(source.funder.funder_type)) continue;
  const domain = registrableDomain(source.fetch.listing_url);
  if (!domain) continue;
  if (!domainFunders.has(domain)) domainFunders.set(domain, new Set());
  domainFunders.get(domain).add(source.funder_id);
}
const nameFunders = new Map();
for (const f of funders) {
  const key = normalise(f.name);
  nameFunders.set(key, nameFunders.has(key) ? null : f.id); // null marks a name shared by two funders
}

function matchFunder(record) {
  const byName = nameFunders.get(normalise(record.name));
  if (byName) return { funder_id: byName, funder_match: 'name' };
  const ids = domainFunders.get(registrableDomain(record.official_url));
  if (ids?.size === 1) return { funder_id: [...ids][0], funder_match: 'domain' };
  return { funder_id: null, funder_match: null };
}

// ---------- dates ----------
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// First day of the month before the next cycle month after `asOf`; `asOf` itself if that day has passed.
function nextCheckDue(record) {
  if (record.trust_state === 'historical_archive') return null;
  const months = (record.typical_cycle_months ?? []).map(m => MONTHS.indexOf(m)).filter(i => i >= 0);
  if (!months.length) return addDays(asOf, record.trust_state === 'needs_verification' ? 30 : 90);
  const [year, month] = asOf.split('-').map(Number);
  const candidates = months.map(m => {
    const cycleYear = m + 1 > month ? year : year + 1;
    const due = new Date(Date.UTC(cycleYear, m - 1, 1)).toISOString().slice(0, 10);
    return due < asOf ? asOf : due;
  });
  return candidates.sort()[0];
}

function deadlinePattern(record, typeMap) {
  if (record.trust_state === 'invitation_only') return 'invitation_only';
  if (record.trust_state === 'rolling') return 'rolling';
  if (typeMap.deadline_pattern) return typeMap.deadline_pattern;
  return record.is_recurring ? 'fixed_annual' : 'ad_hoc_calls';
}

// ---------- build ----------
const records = grants.map(record => {
  const flags = [];
  const typeMap = maps.opportunity_type[record.opportunity_type];
  if (!typeMap) throw new Error(`No v1 mapping for opportunity_type "${record.opportunity_type}" (${record.id})`);
  const { geography, flags: geoFlags } = buildGeography(record.geography);
  flags.push(...geoFlags);

  const eligibleParts = parts(record.eligibility_type);
  for (const part of eligibleParts) if (!maps.eligibility_type[part]) throw new Error(`No v1 mapping for eligibility "${part}" (${record.id})`);
  const eligible = uniq(eligibleParts.flatMap(part => maps.eligibility_type[part]));

  const themes = uniq(parts(record.sector).map(part => {
    if (!maps.sector[part]) throw new Error(`No v1 mapping for sector "${part}" (${record.id})`);
    return maps.sector[part];
  }));
  const techFocus = uniq(parts(record.tech_focus).map(part => {
    if (!maps.tech_focus[part]) throw new Error(`No v1 mapping for tech_focus "${part}" (${record.id})`);
    return maps.tech_focus[part];
  }));

  const { amount, flags: amountFlags } = parseAmount(record.grant_amount);
  flags.push(...amountFlags);
  const funder = matchFunder(record);
  const cycle = record.current_cycle ?? record.previous_cycle ?? null;

  const { geography: _geo, tech_focus: v1TechFocus, ...v1 } = record;
  return {
    ...v1,
    geography,
    tech_focus: techFocus,
    v1_tech_focus: v1TechFocus,
    source_id: null,
    funder_id: funder.funder_id,
    funder_match: funder.funder_match,
    opportunity_types: typeMap.opportunity_types,
    eligible_org_types: eligible,
    for_profit_eligible: eligible.some(type => FOR_PROFIT.has(type)),
    org_stage: [],
    org_size: [],
    edzola_markets: marketsFor(geography),
    themes,
    registration_requirements: [],
    amount,
    languages: ['en'],
    deadline_pattern: deadlinePattern(record, typeMap),
    application_mode: record.trust_state === 'invitation_only' ? 'invitation_only' : (typeMap.application_mode ?? 'open_call'),
    source_kind: 'aggregator_listing',
    last_verified_at: cycle?.verified_at ?? null,
    next_check_due: nextCheckDue(record),
    outputs: ['public_directory'],
    review_flags: uniq(flags),
  };
});

const tally = values => {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]));
};
const output = {
  schema_version: '2.0.0',
  as_of: asOf,
  derived_from: ['data/grants.json', 'data/taxonomy.json', 'data/funders.json', 'data/sources.json', 'data/fx-rates.json'],
  note: 'Generated by scripts/build-grants-v2.mjs. Edit data/grants.json and rebuild; do not edit this file by hand.',
  summary: {
    records: records.length,
    by_trust_state: tally(records.map(r => r.trust_state)),
    by_scope: tally(records.map(r => r.geography.scope ?? 'unknown')),
    by_edzola_market: tally(records.flatMap(r => r.edzola_markets)),
    by_region: tally(records.flatMap(r => r.geography.regions)),
    linked_to_funder: records.filter(r => r.funder_id).length,
    with_usd_amount: records.filter(r => r.amount?.usd_max !== null && r.amount?.usd_max !== undefined).length,
    for_profit_eligible: records.filter(r => r.for_profit_eligible).length,
    due_for_check: records.filter(r => r.next_check_due && r.next_check_due <= asOf).length,
    review_flags: tally(records.flatMap(r => r.review_flags)),
  },
  records,
};
const text = `${JSON.stringify(output, null, 2)}\n`;

if (check) {
  if (text !== existing) {
    console.error('data/grants.v2.json is out of date. Run node scripts/build-grants-v2.mjs and commit the result.');
    process.exit(1);
  }
  console.log(`data/grants.v2.json is up to date (${records.length} records, as of ${asOf}).`);
} else {
  await writeFile(outUrl, text);
  console.log(`Wrote data/grants.v2.json: ${records.length} records as of ${asOf}.`);
  console.log(JSON.stringify(output.summary, null, 2));
}
