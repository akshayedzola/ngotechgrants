# Data QA and trust policy

Last full classification: **17 July 2026** · Freshness update: **23 November 2026**

The directory contains **646 deduplicated records** consolidated from EdZola’s historical repository, including opportunities surfaced in Fast Forward funding emails. The repository accumulated through years of working alongside nonprofits; it was not created as a funding research project. Every record has a trust state, and a historical record is never presented as currently open without dated official evidence.

## Classification results

| Trust state | Records | Meaning |
| --- | ---: | --- |
| Open now | 0 | Checked against an official source, with a deadline still ahead |
| Historically recurring | 108 | Repeated in historical source material; current applications are not implied |
| Needs verification | 148 | Recent or potentially relevant, but current official evidence is incomplete |
| Historical archive | 380 | Older one-time or unclear opportunity retained for historical context |
| Closed | 9 | No open public cycle confirmed, the verified cycle has closed, or the programme ended |
| Invitation-only | 1 | No public application process |

No records are currently classified as `rolling` or `upcoming` because the audit did not find enough dated official evidence to use those labels confidently.

## Freshness update, 23 November 2026

All eight opportunities verified on 17 July 2026 had passed their deadlines, which stopped the data validator and the
Pages deploy. `scripts/refresh-freshness.mjs` moved them out of `open_now` (docs/SOURCES.md, "Freshness rule"):

- Recurring (`is_recurring: true`) → `historically_recurring`, with the closed cycle kept as `previous_cycle`:
  Morgan Stanley Alliance for Children’s Mental Health, Climatebase Fellowship.
- Not marked recurring → `closed`, with the closed cycle kept as `current_cycle` (status `closed`): Tech Forward,
  Rise Up, Nasdaq Foundation, Norm Hardy Prize, Clif Family Foundation, One Young World.

Several of the six appear in more than one year (Nasdaq Foundation in five). Their `is_recurring` flag should be
reviewed, and each programme re-verified when its next cycle opens, before anything returns to `open_now`.

## Previously verified opportunities (2026 cycles, now closed)

| Opportunity | Verified deadline | Official evidence |
| --- | --- | --- |
| Morgan Stanley Alliance for Children’s Mental Health | 24 July 2026 | [Programme FAQ](https://www.morganstanley.com/about-us/giving-back/childrens-mental-health-awards-faqs) |
| Tech Forward Technology Innovation Awards | 24 July 2026 | [Tech Impact](https://techimpact.org/techforward/awards) |
| Rise Up Kenya Leadership and Advocacy Accelerator | 19 July 2026 | [Rise Up Together](https://www.riseuptogether.org/call-for-applications-rise-up-together-launches-leadership-advocacy-program-in-kenya/) |
| Nasdaq Foundation Economic Opportunity Grant Program | 31 July 2026 | [Nasdaq Foundation](https://www.nasdaq.com/nasdaq-foundation/grant-program) |
| Norm Hardy Prize | 31 July 2026 | [Foresight Institute](https://foresight.org/prizes/norm-hardy-prize/) |
| Clif Family Foundation Open Call | 3 August 2026 | [Clif Family Foundation](https://cliffamilyfoundation.org/) |
| Climatebase Fellowship | 24 August 2026 | [Climatebase](https://climatebase.org/fellowship) |
| One Young World Leading Scholarship | 31 October 2026 | [One Young World](https://upsun.oneyoungworld.com/scholarship/leading-scholarship-2026) |

## QA performed

- Removed 10 duplicate records across six known duplicate groups.
- Removed `times spotted`, `first seen`, and the nearly empty for-profit eligibility field from the public schema.
- Separated historical cycle months from current verified deadlines.
- Normalised repeated geography, sector, and technology-focus values.
- Checked all 41 unique official-source URLs; all returned a reachable response.
- Added schema and static-site contract tests that run before every GitHub Pages deployment.

## Community review

Corrections and new grants are submitted through GitHub Issue Forms. Submissions require an official source and remain public for review. They do not publish automatically.

This audit does not claim that all 646 historical entries are currently active. It makes the opposite distinction explicit: only records with a dated official source receive a current-cycle label.
