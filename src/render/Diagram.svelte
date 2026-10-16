<script lang="ts">
  // Static SVG drawing of a laid-out genogram. No gestures or state of its own:
  // the interactive Canvas wraps it, and image export renders it directly.
  // Every tappable thing carries data-kind / data-id for hit-testing.
  import type { LayoutResult } from '../layout/types'
  import type { Genogram } from '../model/types'
  import {
    ageLabel, BOND_LABELS, bondOpacity, curveBetween, curveMidpoint, dropPath, dropStyle,
    familyTrunk, identicalTwinBars, partnerPath, partnerStyle, relationshipStyle, statusMarks,
    truncate, yearsLabel,
  } from './paths'
  import type { Selection } from './selection'

  interface Props {
    g: Genogram
    res: LayoutResult
    selected?: Selection | null
    /** Person being dragged: drawn offset until the drop re-runs layout. */
    drag?: { id: string; dx: number; dy: number } | null
  }
  let { g, res, selected = null, drag = null }: Props = $props()

  const partnerships = $derived(new Map(g.partnerships.map(p => [p.id, p])))
  const isSelected = (kind: Selection['kind'], id: string) => selected?.kind === kind && selected.id === id

  // Spread several relationship lines between the same pair so they don't overlap.
  const relationshipLines = $derived.by(() => {
    const seen = new Map<string, number>()
    return g.relationships.flatMap(r => {
      const a = res.boxes.get(r.a)
      const b = res.boxes.get(r.b)
      if (!a || !b) return []
      const key = [r.a, r.b].sort().join('|')
      const n = seen.get(key) ?? 0
      seen.set(key, n + 1)
      return [{ r, d: curveBetween(a, b, n * 12), style: relationshipStyle(r.kind) }]
    })
  })

  const bondLines = $derived(
    g.bonds.flatMap(b => {
      const a = res.boxes.get(b.personId)
      const s = res.boxes.get(b.supportId)
      if (!a || !s) return []
      return [{ b, d: curveBetween(a, s), mid: curveMidpoint(a, s), label: b.label || BOND_LABELS[b.type] }]
    }),
  )
</script>

<g class="diagram">
  <!-- Emotional relationships (behind everything) -->
  <g class="relationships" fill="none">
    {#each relationshipLines as { r, d, style } (r.id)}
      <g data-kind="relationship" data-id={r.id} class:selected={isSelected('relationship', r.id)}>
        <path class="hit" {d} />
        <path
          class="line"
          {d}
          style:stroke={style.color}
          style:stroke-width={style.width}
          style:stroke-dasharray={style.dash}
        />
      </g>
    {/each}
  </g>

  <!-- Parent → children -->
  <g class="families" fill="none">
    {#each res.families as f (f.familyId)}
      <g data-family={f.familyId}>
        {#if f.implied}
          <path class="line implied" d="M{f.anchorX} {f.anchorY}V{f.barY}" />
          {#if f.barX2 > f.barX1}<path class="line" d="M{f.barX1} {f.barY}H{f.barX2}" />{/if}
        {:else}
          <path class="line" d={familyTrunk(f)} />
        {/if}
        {#each f.drops as drop (drop.childId)}
          {@const s = dropStyle(drop)}
          <path class="line" d={dropPath(f, drop)} style:stroke={s.color} style:stroke-dasharray={s.dash} />
        {/each}
        {#if f.drops.some(d => d.identicalTwin)}
          <path class="line" d={identicalTwinBars(f)} />
        {/if}
      </g>
    {/each}
  </g>

  <!-- Partners -->
  <g class="partners" fill="none">
    {#each res.partnerLines as l (l.id)}
      {@const p = l.partnershipId ? partnerships.get(l.partnershipId) : undefined}
      {@const s = partnerStyle(p?.type, p?.quality)}
      {@const d = partnerPath(l)}
      <g
        data-kind={p ? 'partnership' : undefined}
        data-id={p?.id}
        class:selected={!!p && isSelected('partnership', p.id)}
      >
        {#if p}<path class="hit" {d} />{/if}
        <path class="line" {d} style:stroke={s.color} style:stroke-dasharray={s.dash} />
        {#if p}<path class="line" d={statusMarks(l, p.status)} style:stroke={s.color} />{/if}
      </g>
    {/each}
  </g>

  <!-- Support bonds -->
  <g class="bonds" fill="none">
    {#each bondLines as { b, d, mid, label } (b.id)}
      <g data-kind="bond" data-id={b.id} class:selected={isSelected('bond', b.id)} opacity={bondOpacity(b.quality)}>
        <path class="hit" {d} />
        <path class="line bond" {d} />
        <text class="bond-label" x={mid.x} y={mid.y} text-anchor="middle" dominant-baseline="middle">{label}</text>
      </g>
    {/each}
  </g>

  <!-- People -->
  <g class="people">
    {#each g.persons as p (p.id)}
      {@const b = res.boxes.get(p.id)}
      {#if b}
        {@const s = b.size}
        {@const age = ageLabel(p)}
        {@const years = yearsLabel(p)}
        <g
          class="person"
          class:support={b.support}
          class:selected={isSelected('person', p.id)}
          class:dragging={drag?.id === p.id}
          transform={drag?.id === p.id ? `translate(${drag.dx} ${drag.dy})` : undefined}
          data-kind="person"
          data-id={p.id}
          role="button"
          tabindex="0"
          aria-label={[p.name || 'Unnamed', age && `age ${age}`, p.deceased && 'deceased'].filter(Boolean).join(', ')}
        >
          <!-- Invisible tap targets: symbol and name label. The band between them
               stays free so partner lines and spines remain tappable. -->
          <rect class="hit-area" x={b.x - 8} y={b.y - 8} width={s + 16} height={s + 14} />
          <rect class="hit-area" x={b.cx - 44} y={b.labelY - 2} width="88" height="32" />

          {#if isSelected('person', p.id)}
            <rect class="selection-ring" x={b.x - 9} y={b.y - 9} width={s + 18} height={s + 18} rx="10" />
          {/if}

          {#if p.sex === 'F'}
            {#if p.isIndexPerson}<circle class="index-ring" cx={b.cx} cy={b.cy} r={s / 2 + 4} />{/if}
            <circle class="symbol" cx={b.cx} cy={b.cy} r={s / 2} />
          {:else if p.sex === 'X'}
            {#if p.isIndexPerson}
              <path class="index-ring" d="M{b.cx} {b.y - 6}L{b.x + s + 6} {b.cy}L{b.cx} {b.y + s + 6}L{b.x - 6} {b.cy}Z" />
            {/if}
            <path class="symbol" d="M{b.cx} {b.y}L{b.x + s} {b.cy}L{b.cx} {b.y + s}L{b.x} {b.cy}Z" />
          {:else}
            {#if p.isIndexPerson}<rect class="index-ring" x={b.x - 4} y={b.y - 4} width={s + 8} height={s + 8} />{/if}
            <rect class="symbol" x={b.x} y={b.y} width={s} height={s} rx={p.sex === '?' ? 8 : 0} />
          {/if}

          {#if p.deceased}
            {@const i = p.sex === 'M' ? 4 : 8}
            <path class="deceased" d="M{b.x + i} {b.y + i}L{b.x + s - i} {b.y + s - i}M{b.x + s - i} {b.y + i}L{b.x + i} {b.y + s - i}" />
          {:else if age}
            <text class="age" x={b.cx} y={b.cy} text-anchor="middle" dominant-baseline="central">{age}</text>
          {:else if p.sex === '?'}
            <text class="age unknown-mark" x={b.cx} y={b.cy} text-anchor="middle" dominant-baseline="central">?</text>
          {/if}

          <text class="name" x={b.cx} y={b.labelY + 11} text-anchor="middle">{truncate(p.name || 'Unnamed', 15)}</text>
          {#if years}
            <text class="years" x={b.cx} y={b.labelY + 25} text-anchor="middle">{years}</text>
          {/if}
        </g>
      {/if}
    {/each}
  </g>
</g>

<style>
  .line {
    stroke: var(--ink);
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .families .line {
    stroke-linecap: butt;
  }

  .implied {
    stroke-dasharray: 2 3;
  }

  /* Fat transparent strokes make thin lines easy to tap. */
  .hit {
    stroke: transparent;
    stroke-width: 16;
    pointer-events: stroke;
  }

  [data-kind] {
    cursor: pointer;
  }

  .selected .line {
    stroke: var(--select);
  }

  .bond {
    stroke: var(--bond);
    stroke-width: 1.5;
    stroke-dasharray: 8 3 2 3;
  }

  .bond-label {
    font-size: 10px;
    fill: var(--bond);
    paint-order: stroke;
    stroke: var(--paper);
    stroke-width: 4px;
  }

  .hit-area {
    fill: transparent;
  }

  .symbol {
    fill: var(--paper);
    stroke: var(--ink);
    stroke-width: 2;
  }

  .support .symbol {
    fill: var(--support-fill);
  }

  .index-ring {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.5;
  }

  .selection-ring {
    fill: var(--select-fill);
    stroke: var(--select);
    stroke-width: 2;
  }

  .deceased {
    stroke: var(--ink);
    stroke-width: 1.75;
  }

  .age {
    font-size: 14px;
    fill: var(--ink);
  }

  .name {
    font-size: 12px;
    font-weight: 500;
    fill: var(--ink);
  }

  .years {
    font-size: 10px;
    fill: var(--ink-muted);
  }

  .dragging {
    opacity: 0.8;
    cursor: grabbing;
  }

  .person.selected {
    cursor: grab;
  }

  /* Tapping focuses the person; keyboard focus gets the symbol highlight below instead. */
  .person:focus {
    outline: none;
  }

  .person:focus-visible .symbol {
    stroke: var(--select);
    stroke-width: 3;
  }
</style>
