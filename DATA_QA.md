# Data QA and trust policy

Last full classification: **17 July 2026**

The directory contains **646 deduplicated records** consolidated from EdZola’s historical funding research, including opportunities surfaced in Fast Forward funding emails. Every record has a trust state; a historical record is never presented as currently open without dated official evidence.

## Classification results

| Trust state | Records | Meaning |
| --- | ---: | --- |
| Open now | 8 | Checked against an official source on 17 July 2026 |
| Historically recurring | 106 | Repeated in past research; current applications are not implied |
| Needs verification | 148 | Recent or potentially relevant, but current official evidence is incomplete |
| Historical archive | 380 | Older one-time or unclear opportunity retained for research context |
| Closed | 3 | No open public cycle confirmed, or the programme ended |
| Invitation-only | 1 | No public application process |

No records are currently classified as `rolling` or `upcoming` because the audit did not find enough dated official evidence to use those labels confidently.

## Officially verified current opportunities

| Opportunity | Verified current deadline | Official evidence |
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
