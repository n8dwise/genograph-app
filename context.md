# Genograph App — Context

Rebuild of `../genograph` (v1, JointJS) as a mobile-first, modular PWA.
Clinical genogram tool for a therapist; 100% client-side, data never leaves the device.

- **GitHub:** n8dwise/genograph-app (private)
- **Live:** not hosted yet (repo private). To deploy: enable Pages (source: GitHub Actions) and set repo variable `DEPLOY_PAGES=true`.
- **Plan & decisions:** `PLAN.md` — read it first
- **v1 reference:** `../genograph` (layout rules, sample families in `src/families/`)

## Stack
TypeScript · Svelte 5 · Vite · vite-plugin-pwa · Vitest · Zod · idb-keyval. All free; $0 budget.

## Commands
```
npm run dev     # dev server (localhost:5173)
npm test        # vitest
npm run check   # svelte-check + tsc
npm run build   # production build → dist/
npm run ci      # check + test + build (what CI runs)
```

## Layout (target — see PLAN.md → Architecture)
```
src/
  model/    types, validation, derived relations, migration (no deps)
  store/    commands, undo/redo, autosave            (→ model)
  layout/   pure data → geometry                     (→ model)
  render/   SVG drawing, pan/zoom                    (→ layout output)
  ui/       Svelte components                        (→ store, render)
  io/       JSON/PNG import/export                   (→ model, render)
```
Layers only depend downward. Layout must stay free of DOM/Svelte so it's unit-testable.

## Status
- **Phase 0 (scaffold):** done.
- **Phase 1 (model + layout):** done.
  - `model/`: types, Zod schema + `validateGenogram` (readable errors), `relations.ts`
    (parents/partners/siblings/half-siblings/aunts derived), `migrate.ts` (v1 app files
    and the old JointJS person-list format → v2).
  - `layout/`: custom genogram engine (no dagre/ELK). Pipeline: partner units →
    generation rows → ordering (sibling blocks in birth order, barycenter sweeps from two
    starting orders, transpose polish) → x via weighted isotonic regression (PAVA) →
    support row → pins → connectors. `check.ts` validates drawing rules.
  - Results: all 4 real samples have 0 crossings and 0 rule violations; ~1000-person
    benchmark lays out in ~150 ms.
  - `render/debugSvg.ts` + `App.svelte`: temporary debug viewer (dropdown of samples).
- **Phase 2 (store):** done.
  - `store/commands.ts`: every edit as a pure function (add parent(s)/partner/child/sibling/
    support person, partnerships, twins, relationships, bonds, nudge/reset layout, safe
    cascading delete). Keeps children in birth order; primary subject can't be deleted.
    Refusals throw `CommandError` with a user-facing message.
  - `store/history.ts`: undo/redo (100 steps), typing coalesced via a `coalesce` key.
  - `store/persistence.ts`: `DocLibrary` ("My Genograms") over a `KeyValue` interface —
    IndexedDB in the app, in-memory for tests.
  - `store/session.ts`: open document + history + debounced autosave; `autosave: false`
    writes nothing to the device until `save()` (for the shared-device question).
    Framework-free; UI subscribes via `session.subscribe`.
  - `io/json.ts`: import any supported format (v2 / v1 / person list) with validation; export.
- **Next: Phase 3** — real renderer (clinical symbols, connectors, pan/pinch-zoom, hit-testing).

## Layout conventions (decided in Phase 1)
- Partner lines are a "U" under the symbols; names sit below that band, so lines never cross names.
- Multi-partner: `[former…, person, current…]`; non-adjacent partner lines nest deeper,
  and each partnership's children hang from their own gap.
- Single parent: short stub out to the side; implied (off-chart) parents: dotted stub above the sibling bar.
- Birth order (oldest left) is enforced within each sibling group; someone who married
  into another sibling group sits with their partner.
- `family.children` order *is* birth order — the store must keep it sorted.
- Known gaps: emotional-relationship and bond lines are straight debug lines (Phase 6 curves them);
  in-law ancestors more than one generation up may get long connectors.

## Debugging layouts
`npm run dev` → pick a sample. For PNGs: write `debugSvg(...)` output to `.debug/` (git-ignored)
and screenshot with headless Chrome.
