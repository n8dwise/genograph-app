# Genograph v2 — Rebuild Plan

Status: **approved direction** (2026-10-15). Phases 0–4 done; trim/annotate freely.

## Goal

A clinical genogram tool for a therapist: map a client's family system quickly,
on desktop **or phone**, with data that never leaves the device. Cleaner UX,
more clinical notation, modular codebase that's easy to extend.

### Non-negotiables (carried from v1)
- 100% client-side; no backend, no accounts, no telemetry.
- Primary subject (client) is the anchor of every diagram.
- Auto-layout is the default; manual nudging is optional.
- JSON import/export (incl. the AI-assisted "notes → JSON" path).
- PNG export for reports.

---

## Why rebuild (summary of review)

- Parentage stored twice (union `children` **and** `familyRelations` parent/child) → layout has to reconcile two truths.
- Layout = one 780-line function: dagre + 8 corrective post-passes (3.5, 3.6, 3.7, 3.7b, 3.8…) that undo each other's work.
- Layout logic leaks into `main.ts` (peripheral placement, sibling brackets, y-row matching by pixel tolerance).
- Full graph teardown on every edit; any drag freezes *all* positions.
- Shared mutable state between `main.ts` and `editor.ts`; hand-built DOM forms ×4.
- No tests. Desktop-only form UI.

---

## Architecture

Four layers, one-way dependencies. Each is testable alone.

```
┌──────────────┐   commands    ┌──────────────┐
│  UI (Svelte) │ ────────────▶ │ Store        │  undo/redo, autosave, validation
└──────┬───────┘ ◀──────────── └──────┬───────┘
       │ renders                       │ FamilyData (immutable snapshots)
┌──────▼───────┐   positions   ┌──────▼───────┐
│ Renderer     │ ◀──────────── │ Layout       │  pure: data → geometry
│ (SVG)        │               │ engine       │  no DOM, no framework
└──────────────┘               └──────────────┘
```

| Layer | Responsibility | Knows about |
|---|---|---|
| `model/` | Types, schema validation, derived relations (half-sibling, aunt…), ID gen, v1→v2 migration | nothing |
| `store/` | Single source of truth; command-based edits (`addChild`, `addPartner`…); undo/redo; IndexedDB autosave | model |
| `layout/` | `layout(data, pins) → { nodes, edges, bounds }`; pure function | model |
| `render/` | Draw SVG from layout output; pan/pinch-zoom; hit-testing | layout output only |
| `ui/` | Toolbar, tap-on-person action menu, bottom-sheet editors, file list | store, render |
| `io/` | JSON import/export, PNG/PDF export | model, render |

### Stack (proposed)
- **TypeScript + Vite** (keep)
- **Svelte 5** for UI — small, fast, little boilerplate. (Alt: React if you prefer familiarity.)
- **Plain SVG** renderer — drop JointJS. We already override most of it; native SVG gives full control of clinical symbols and better touch.
- **vite-plugin-pwa** — installable, offline.
- **IndexedDB** (via `idb-keyval`) — autosave + multiple saved genograms, on-device only.
- **Zod** — validate imported/AI-generated JSON with readable errors.
- **Vitest** — unit + layout snapshot tests. **Playwright** — a few smoke tests incl. mobile viewport.
- Later, if an app-store app is wanted: **Capacitor** wrapper around the same build.

---

## Data model v2

Key change: **one way to express parentage** — the `Family` unit. Everything
else (siblings, half-siblings, aunts/uncles, cousins) is *derived*, not stored.

```ts
Person {
  id; name; sex: 'M'|'F'|'X'|'?';
  birthYear?; age?; deathYear?; deceased?;
  isIndexPerson?; notes?;
  flags?: { pregnancy?, miscarriage?, stillbirth?, substance?, mentalHealth?, ... }  // v1.x
}

Partnership {            // couple relationship (replaces Union, minus children)
  id; a; b;
  type: 'married'|'cohabiting'|'dating'|'affair'|'other';
  status: 'active'|'separated'|'divorced'|'widowed';
  startYear?; endYear?; quality?;
}

Family {                 // parentage unit (replaces union.children + parent/child relations)
  id;
  parents: personId[];   // 0, 1 or 2. 0/1 = unknown/off-chart parent(s) → "implied" node
  partnershipId?;        // when parents are a couple
  children: { id; kind: 'bio'|'adopted'|'foster'|'step'; twinGroup? }[];
}

Relationship {           // emotional/clinical line between any two people
  id; a; b;
  kind: 'close'|'enmeshed'|'distant'|'conflict'|'hostile'|'cutoff'|'abuse'|'support'|...;
  note?;
}

Bond {                   // non-family supports (counselor, mentor…) — kept from v1
  id; personId; supportId; type; label?;
}

Household { id; members: personId[]; label? }      // v1.x: dotted boundary

Genogram { meta: { title, created, updated, version: 2 }; persons; partnerships; families; relationships; bonds; households?; pins?: Record<personId, {dx,dy}> }
```

How v1 concepts map:
- "Sibling of Richard" with no parents on chart → both go in one `Family` with `parents: []` (renders an implied parent bar).
- Half-sibling → derived: two `Family` units sharing one parent.
- Aunt/uncle → sibling of a parent (derived). The "Add aunt" action creates/extends the parent's `Family`.
- Positions: store **offsets from auto-layout** per person (`pins`), not absolute coords — so dragging one person no longer freezes everyone, and relayout still works.
- v1 JSON files import via a migration function.

---

## Layout engine (the hard part)

Replace "dagre + fix-ups" with a **genogram-specific layout** that encodes the rules directly:

1. **Generations** — assign each person a generation from `Family` links (parents = child − 1; partners share a row). Index person's row anchors.
2. **Units** — group each person with their partners into a horizontal unit, ordered `[former…, person, current…]` (v1 hub rule, now first-class).
3. **Subtree packing** — tidy-tree style (Walker/Reingold-Tilford variant): lay out each family's children under its parents, compact sibling subtrees, center parents over children.
4. **Ordering rules** (as constraints, not post-passes):
   - Siblings oldest → youngest, left → right (when ages/birth years known).
   - Children of current partnership sit right of former-partnership children.
   - Twins adjacent with shared fork point.
5. **Connectors** — T-bar routing: couple line → drop → sibling bar → child drops. Adopted/foster = dashed/dotted drop; twins fork; implied parents draw a bar with no couple.
6. **Overlays** — emotional relationships drawn as styled curves on top; bonds/support people placed in a support row below the tree (v1 rule).
7. **Pins** — apply user offsets last.

~~If the custom engine stalls, fallback: ELK.~~ **Decided (Phase 1): custom engine.** It converged — 0 crossings on all real samples, ~150 ms for 1000 people. See `context.md` → Layout conventions.

**Test fixtures** (reuse v1 sample files, migrated): `example.json`, `thompson.json`, `british-royals.json`, `benchmark.json` (~1000 people → perf budget: layout < 200 ms). Tests assert invariants: no overlapping boxes, partners on the same row, parents above children, sibling age order, no connector passing through a box.

---

## UX (mobile-first)

- **Canvas is the editor.** Tap a person → action sheet: *Add parent · partner · child · sibling · relationship · support person · Edit · Delete*. Correct `Family`/`Partnership` records are created automatically.
- **Bottom sheet** (phone) / **side panel** (desktop) for editing details — same component.
- Tap a line → edit that partnership/relationship.
- Pinch-zoom, pan, "fit to screen" button. Long-press + drag to nudge a person.
- **Undo/redo** buttons + Ctrl/Cmd-Z.
- **My Genograms** home screen: list of autosaved diagrams (IndexedDB), new / duplicate / delete / import / export.
- First run: "Who's the client?" (kept from v1) → lands on canvas with the client and a pulsing "+".
- Legend: toggleable overlay that shows only notation actually used in the current diagram.
- Optional: list view of people for quick text editing / search on large families.

---

## Feature scope

**v1 (rebuild parity + core upgrades)**
- People, partnerships (type/status/quality), families with bio/adopted/foster children
- Derived siblings, half-siblings, aunts/uncles
- Twins
- Emotional relationship lines (full standard set — see Decisions)
- Support people / bonds + support row
- Deceased marker, index person marker, age/birth-death years display
- Autosave + My Genograms list
- Undo/redo
- JSON import (v1 + v2, validated) / export; PNG export
- PWA install + offline
- Updated JSON guide for AI-assisted entry

**v1.x**
- Pregnancy / miscarriage / stillbirth symbols
- Household boundaries
- Condition flags (substance use, mental health, etc.) with symbol fill quadrants
- PDF export (letter/A4, with title + legend)
- Search / list view
- Display settings (show ages vs. years, compact mode)

**Later / maybe**
- Capacitor app-store build
- Encrypted export / app passcode (shared-device privacy)
- Timeline view, print layouts, theming

---

## Build phases

| # | Phase | Output | Done when |
|---|---|---|---|
| 0 | Scaffold | Vite + Svelte + TS + Vitest + PWA + CI (lint, test, build, Pages deploy) | Blank app deploys |
| 1 | Model + layout spike | `model/`, v1→v2 migration, layout engine on fixtures, SVG debug render | All fixtures lay out, invariant tests pass, benchmark < 200 ms |
| 2 | Store | Commands, undo/redo, IndexedDB autosave, My Genograms | Unit tests for every command |
| 3 | Renderer | Clinical symbols, connectors, pan/zoom, hit-testing | Visual parity with v1 sample |
| 4 | Editing UX | Action sheet, bottom sheet/panel forms, drag-to-pin | Can build `example.json` from scratch on a phone |
| 5 | I/O | JSON import/export with validation, PNG export, JSON guide v2 | Round-trip tests pass |
| 6 | Clinical extras | Relationship lines, twins, adoption/foster, legend | Notation reviewed by the therapist |
| 7 | Polish + ship | Mobile QA, a11y pass, user guide, deploy | Therapist uses it for real |

Phases 1 is the riskiest — do it first and stop to reassess if the custom layout isn't converging.

---

## Decisions (2026-10-15)

- **Repo:** new repo, fresh history (not a v2 branch). v1 stays as-is for reference.
- **Cost:** $0. Everything in the stack is free/open-source (Svelte, Vite, Vitest, Playwright, Zod, idb-keyval, vite-plugin-pwa — all MIT/Apache); hosting on GitHub Pages (free). No paid services.
- **UI framework:** Svelte 5.
- **Symbols:** standard McGoldrick notation — square = male, circle = female (plus standard symbols for other/unknown).
- **Workflow:** all of them — live in session, afterward, and AI/JSON import. Editor UX and import are both first-class.
- **Relationship lines:** full standard emotional-relationship set (see below), in v1.
- **Device privacy:** TBD — design autosave so a passcode / "don't autosave" mode can be added later.
- **Output audience:** the user only. PNG export is enough for v1; PDF/print layouts stay low priority.

### Emotional relationship types (v1)
Standard genogram set: harmony/close, very close/fused, enmeshed, distant, poor/cutoff, discord/conflict, hostile, close-hostile, violence/abuse (physical, emotional, sexual), neglect, focused-on, distrust, admiration/love, indifferent. Final glyph set confirmed during Phase 6.
