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
- **Phase 0 (scaffold):** done locally — app shell, PWA, Vitest, CI/Pages workflow, `model/types.ts`.
- **Next: Phase 1** — model validation + v1→v2 migration, layout engine against v1 fixtures.
