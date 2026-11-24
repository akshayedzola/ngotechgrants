# Source registry and data points

This file documents three data files and the fields in each:

| File | What it holds | Who reads it |
| --- | --- | --- |
| `data/taxonomy.json` | The one shared list of regions, EdZola markets and categories | Directory, scanner, edzola.com pricing zones, CRM region tags, chat routing |
| `data/sources.json` | Every place we watch for opportunities, and how to fetch it | The scanner |
| `data/funders.json` | Each funder stored once, derived from `sources.json` | Directory filters, CRM funder intelligence |
| `data/grants.json` | Individual opportunity records (unchanged, v1) | The public site |

A **source** is somewhere to watch: a funder's open-calls page, a programme page, an aggregator, a tender portal, an API or a feed. A **record** in `grants.json` is one opportunity found at a source. One funder can have several sources.

Run `node scripts/validate-sources.mjs` after any edit. Regenerate `schema/sources.schema.json` from the taxonomy rather than editing enums by hand.

## Scripts

| Script | What it does | When |
| --- | --- | --- |
| `scripts/validate-sources.mjs` | Checks every source against the taxonomy | After editing `sources.json` |
| `scripts/build-registry.mjs` | Re-derives `funders.json` and the `summary` block of `sources.json`. `--check` fails if either is stale | After editing `sources.json` |
| `scripts/refresh-freshness.mjs` | Applies the freshness rule below to `grants.json`. `--check` lists what would move; `--today YYYY-MM-DD` fixes the date | When a verified deadline passes |
| `scripts/build-grants-v2.mjs` | Builds `data/grants.v2.json` from `grants.json`, the taxonomy, funders, sources and `data/fx-rates.json`. `--check` fails if the file is stale | After editing `grants.json` or the taxonomy |
| `scripts/validate-grants-v2.mjs` | Checks every v2 record against the taxonomy and against its v1 record | CI |
| `scripts/test-registry.mjs` | Cross-file tests: one region per country, schema enums match the taxonomy, sources' countries sit in their regions, `next_check_due` follows `check_frequency`, no personal contact details, USD values match `data/fx-rates.json`, funders account for every source, golden v2 records, v2 amounts agree with the site's parser. Prints review warnings | CI |

All of them run in CI before every Pages deploy and in the monthly link check.

`data/fx-rates.json` holds the USD rate per currency used for `typical_award` and v2 `amount` values. Currencies
without a rate there (TZS, CAD) keep empty USD values.

## The shared regions list

Twelve regions, each with its ISO 3166-1 alpha-2 members, and one `country_to_region` lookup. No country sits in two regions.

`global`, `south_asia`, `southeast_asia`, `east_asia_pacific`, `east_africa`, `west_central_africa`, `southern_africa`, `mena`, `latin_america_caribbean`, `north_america`, `uk_ireland`, `europe_central_asia`

Eligibility that cuts across regions uses **country groups** instead of inventing regions: `LMIC`, `LDC`, `ODA_ELIGIBLE`, `SSA`, `EU27`, `COMMONWEALTH`, `SIDS`. LMIC membership changes every July, so resolve it at build time from the World Bank classification instead of hard-coding it.

**EdZola markets** sit on top of regions and map to site editions:

| Market | Regions | Countries | Site locales |
| --- | --- | --- | --- |
| india | south_asia | IN | en, hi-in, ta-in |
| east_africa | east_africa | KE, UG, TZ, RW | en, sw-ke |
| latin_america | latin_america_caribbean | Spanish-speaking LatAm | es |
| brazil | latin_america_caribbean | BR | pt-br |
| indonesia | southeast_asia | ID | id-id |
| uk | uk_ireland | GB | en |
| north_america | north_america | US, CA | en |
| global | global | * | en |

## Source data points (`sources.json`)

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | kebab-case string | Unique and stable. Never reuse a retired id. |
| `name` | string | Human-readable source name |
| `funder_id` | kebab-case string | Links to `funders.json`. Same funder, same id. |
| `funder.name` | string | Funder's name |
| `funder.funder_type` | enum | Private foundation, family philanthropy, corporate CSR, multilateral, bilateral agency, development bank, domestic government, tech company programme, accelerator, impact investor, crowdfunding platform, aggregator and others (see taxonomy) |
| `funder.hq_country` | ISO alpha-2 or null | Where the funder is based |
| `funder.funds_digital_capacity` | boolean or null | True when the funder pays for, or gives, grantees' own tech, data or digital capacity. This is the audience for "portfolio digital backbone". |
| `funder.accepts_unsolicited` | boolean or null | False for invitation-only funders |
| `source_kind` | enum | Open-calls page, programme page, funder news, aggregator listing, procurement portal, government portal, open data API, crowdfunding platform, in-kind catalogue, newsletter, network directory |
| `description` | string, max 400 | What a watcher finds here, in our own words |
| `opportunity_types` | enum list | Grant, recoverable grant, concessional loan, impact investment, prize, award, fellowship, accelerator, capacity building, in-kind software, cloud credits, AI credits, hardware or connectivity, pro bono, CSR partnership, government scheme, crowdfunding, matching funds, tender or RFP, research funding |
| `eligible_org_types` | enum list | Registered nonprofit, community-based organisation, for-profit social enterprise, hybrid social enterprise, tech-for-good startup, cooperative, academic, public sector, faith-based, individual, consortium, private vendor |
| `org_stage` | enum list | idea, early, growth, scale, any |
| `org_size` | enum list | micro (<USD 50k budget), small (50k-500k), medium (500k-5M), large (>5M), any |
| `geography.scope` | enum | global, multi_region, regional, national, subnational |
| `geography.regions` | region list | From the shared regions list |
| `geography.countries` | ISO alpha-2 list | `["*"]` means anywhere not excluded. An empty list means eligibility is set by `regions` and `country_groups` (used for pan-African and other regional programmes). |
| `geography.country_groups` | enum list | LMIC, LDC, ODA_ELIGIBLE, SSA, EU27, COMMONWEALTH, SIDS |
| `geography.excluded_countries` | ISO alpha-2 list | Explicit exclusions (common in tech programmes) |
| `geography.subnational` | string or null | State or city restriction |
| `edzola_markets` | enum list | Which EdZola markets this serves |
| `themes` | enum list | 26 themes. The first 16 replace v1 `sector` one-for-one; new ones include nonprofit digital capacity, data and AI for good, DPI, MEL, WASH, disability inclusion |
| `tech_focus` | enum list | Same values as v1 `tech_focus`, in snake_case, plus `none` |
| `registration_requirements` | enum list | IN_FCRA, IN_80G, IN_12A_12AB, IN_CSR1, IN_DARPAN, IN_SECTION8, IN_DPIIT_STARTUP, US_501C3, US_ED_OR_FISCAL_SPONSOR, UK_REGISTERED_CHARITY, UK_CIC, KE_NGO_PBO, BR_OSC_CNPJ, ID_YAYASAN, EU_PIC, UNGM_REGISTRATION, US_SAM_UEI, GOODSTACK_VALIDATION, TECHSOUP_VALIDATION, LOCAL_LEGAL_REGISTRATION, NONE_STATED |
| `languages` | ISO 639-1 list | Language of the application material |
| `typical_award` | object or null | `min`, `max`, `currency` (original, ISO 4217), `unit` (per_award, per_year, total_programme, credits, discount_percent, in_kind_value), `usd_min`, `usd_max`, `fx_as_of`, `note`. USD values use indicative mid-market rates from 23 Nov 2026 and are left empty where no rate was available (TZS). The scanner should refresh them on each build. |
| `application_mode` | enum | open_call, rolling_open, invitation_only, nomination, registration_portal, marketplace_listing |
| `deadline_pattern` | enum | fixed_annual, fixed_multiple_rounds, rolling, loi_then_invite, cohort_intake, always_open, ad_hoc_calls, invitation_only |
| `typical_cycle_months` | month list | Same format as v1 (`"Jan"`...`"Dec"`) |
| `fetch.method` | enum | api, rss, atom, sitemap, page_watch, newsletter, manual |
| `fetch.listing_url` | URL | The page that lists calls |
| `fetch.feed_url` / `feed_status` | URL / enum | Only `ok` when the feed was fetched and returned RSS or Atom items |
| `fetch.api_endpoint` / `api_docs_url` | URL | Only when documented |
| `fetch.auth` | enum | none, free_key, login, paid |
| `fetch.format` | enum | html, rss, atom, json, xml, csv, pdf |
| `fetch.change_signal` | string | What to diff for, e.g. a new entry in the open-calls list |
| `fetch.newsletter_url` | URL | Signup page for a shared inbox |
| `check_frequency` | enum | daily, weekly, fortnightly, monthly, quarterly |
| `next_check_due` | date | `checked_on` plus the frequency, pulled earlier to a month before the next usual cycle month |
| `outputs` | enum list | `public_directory` and/or `internal_bd`. Tender-only sources never feed the public directory. |
| `priority` | enum | p1 (open, relevant to India, Africa or digital capacity, checked often), p2 (narrower), p3 (watch or intelligence only) |
| `owner` | string or null | Person responsible. Empty until assigned. |
| `risk_flags` | enum list | programme_paused, closed_to_new_applicants, funding_cuts_2025, invitation_only, us_money_needs_fcra, policy_change, site_blocks_bots, low_signal, aggregator_secondary_source |
| `verification.url_status` | enum | ok, failed, redirected, blocked_by_tool |
| `verification.checked_on` | date | Last time a person or agent checked the listing URL |
| `verification.evidence` | string | What the check found, in our own words |
| `notes` | string or null | Anything a maintainer should know |
| `segment` | string | Which research batch added the source |

## Funder data points (`funders.json`)

Derived from `sources.json` by the merge step, one entry per `funder_id`: `id`, `name`, `funder_type`, `hq_country`, `funds_digital_capacity`, `accepts_unsolicited`, `regions_funded`, `edzola_markets`, `opportunity_types`, `source_ids`. This is the record the CRM and the "portfolio data for funders" work should read.

## Opportunity record v2 data points (`grants.v2.json`)

`data/grants.v2.json` is generated by `scripts/build-grants-v2.mjs`; `data/grants.json` (v1) stays the file people
edit and the public site reads. The file carries `schema_version`, `as_of` (the date `next_check_due` is computed
from), a `summary` and `records`.

Keep every v1 field, including the `trust_state` model and `current_cycle` rules. Two v1 fields change shape because v2
reuses their names: `geography` becomes the object below, with the v1 text kept as `geography.v1_text` (and any part
with no mapping in `geography.unmapped_parts`), and `tech_focus` becomes a list, with the v1 text kept as
`v1_tech_focus`. v1 geography text is split on commas and each part looked up in `v1_mappings.geography` in the
taxonomy (`v1_mappings.geography_rules`). Add:

| New field | Type | Notes | Filled from v1 by |
| --- | --- | --- | --- |
| `source_id` | id | Links the record to the source it came from | Blank for historical records |
| `funder_id` | id | Links to `funders.json` | Match on funder name |
| `opportunity_types` | enum list | Replaces `opportunity_type` | `v1_mappings.opportunity_type` |
| `eligible_org_types` | enum list | Replaces `eligibility_type` | `v1_mappings.eligibility_type` |
| `for_profit_eligible` | boolean, derived | True if any for-profit, hybrid or startup type is eligible | Derived |
| `org_stage`, `org_size` | enum lists | | Blank, fill on review |
| `geography` | object | Same shape as sources | `v1_mappings.geography` |
| `edzola_markets` | enum list | | Derived from countries |
| `themes`, `tech_focus` | enum lists | Replace `sector` and `tech_focus` strings | `v1_mappings.sector`, `v1_mappings.tech_focus` |
| `registration_requirements` | enum list | | Blank, fill on review |
| `amount` | object | `min`, `max`, `currency`, `unit`, `usd_min`, `usd_max`, `fx_as_of`, `display` (keeps the v1 `grant_amount` text) | Parse `grant_amount` |
| `languages` | ISO 639-1 list | | `["en"]` |
| `deadline_pattern` | enum | fixed, rolling, LOI and the rest of the list above | From `is_recurring` and `opportunity_type` |
| `application_mode` | enum | | From `trust_state` (`invitation_only`) |
| `source_kind` | enum | Where the evidence came from | `aggregator_listing` for Fast Forward-sourced records |
| `last_verified_at` | date | Last dated check of the official page | `current_cycle.verified_at` when present |
| `next_check_due` | date | Freshness job uses this | From `typical_cycle_months` |
| `outputs` | enum list | | `["public_directory"]` |

Also generated:

| Field | Meaning |
| --- | --- |
| `funder_match` | How `funder_id` was found: `name` (exact normalised name) or `domain` (official URL on a website that belongs to exactly one non-aggregator funder). Both are left empty rather than guessed. |
| `review_flags` | What a person should check: `geography_unknown` ("Not Specified" or only non-geography text such as "Event"), `geography_ambiguous` (e.g. "Georgia"), `geography_conflicting` (e.g. "Global, US Only"), `geography_unmapped`, `amount_suspect` (a likely typo such as "$2"; no numbers are kept), `amount_unparsed`. |
| `amount.display` | The v1 `grant_amount` text, unchanged. Only the cash part before a "+ software/credits" add-on is parsed, and "x 3 yrs" multipliers are not amounts. |

`next_check_due` is the first day of the month before the next `typical_cycle_months` entry after `as_of` (or `as_of`
itself if that day has passed). Without cycle months it is `as_of` + 30 days for `needs_verification`, + 90 days
otherwise, and empty for `historical_archive`.

**Freshness rule.** `scripts/refresh-freshness.mjs` moves a past-deadline `open_now` or `upcoming` record to `historically_recurring` (if `is_recurring`) or `closed`, instead of failing the build. A recurring record's cycle moves to `previous_cycle`, because a current cycle is not allowed on that state; a closed record keeps its cycle as `current_cycle` with status `closed`. Rebuild `grants.v2.json` afterwards so `next_check_due` moves to a month before the next `typical_cycle_months` entry. Running it on a schedule (a workflow that opens a pull request for review) is a separate decision; until then, run it by hand.

## Rules for adding a source

1. Link the funder's own page. Aggregators are allowed as sources but carry `aggregator_secondary_source`, and anything they surface is confirmed on the funder's page before it reaches the directory.
2. Mark a feed `ok` only after fetching it and seeing items.
3. Write descriptions and evidence in our own words. No personal contact details.
4. Tenders and procurement notices go to `internal_bd` only.
5. Invitation-only and paused funders stay in the registry as `p3` intelligence, flagged.
