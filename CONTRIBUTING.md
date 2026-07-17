# Contributing funding information

This directory is a static GitHub Pages site. GitHub Issues are its public contribution queue, so every proposed addition or correction remains visible and auditable without a paid database.

## Suggest an addition or correction

Use the **Add a grant** or **Suggest a correction** button on the site. Please link directly to an official funder or programme page and include the date you checked it.

A maintainer will:

1. Confirm the official source and current cycle.
2. Check for duplicates and misleading historical dates.
3. Update `data/grants.json` through a reviewed commit.
4. Close the issue with a link to the published change.

Community submissions do not publish automatically. Issue content is untrusted input and must never be copied into scripts or shell commands without review.

## Trust-state definitions

- `open_now`, `rolling`, and `upcoming` require a dated official source.
- `historically_recurring` means the programme repeated in past research, not that applications are currently open.
- `needs_verification` means a recent record lacks enough current official evidence.
- `historical_archive` preserves old research without implying present availability.
- `closed` and `invitation_only` describe confirmed limits on public applications.

Exact deadlines belong in `current_cycle` only when `verified_at` and `source_url` are present. Historical cycle months belong in `typical_cycle_months`.

## Local checks

Serve the repository over HTTP so the page can load its JSON file:

```sh
python3 -m http.server 4173
```

Then run the data validator:

```sh
node scripts/validate-data.mjs
node scripts/test-site.mjs
```
