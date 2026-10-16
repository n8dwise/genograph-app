<script lang="ts">
  // Phase 1 debug viewer: renders the v1 sample families through the new
  // layout engine. Replaced by the real app shell in Phase 3/4.
  import { checkLayout, type LayoutReport } from './layout/check'
  import { layout } from './layout'
  import { debugSvg } from './render/debugSvg'

  const loading = import('./fixtures').then(m => m.fixtures)

  let name = $state('example')
  let svg = $state('')
  let report = $state<LayoutReport | null>(null)
  let ms = $state(0)
  let people = $state(0)

  $effect(() => {
    const current = name
    loading.then(fixtures => {
      const g = fixtures[current]()
      const t0 = performance.now()
      const res = layout(g)
      ms = performance.now() - t0
      people = g.persons.length
      report = checkLayout(g, res)
      svg = debugSvg(g, res)
    })
  })
</script>

<header>
  <strong>Genograph</strong>
  <span class="muted">layout debug</span>
  {#await loading then fixtures}
    <select bind:value={name} aria-label="Sample family">
      {#each Object.keys(fixtures) as key (key)}
        <option value={key}>{key}</option>
      {/each}
    </select>
  {/await}
  {#if report}
    <span class="muted">
      {people} people · {ms.toFixed(0)} ms · {report.crossings} crossings ·
      {report.violations.length} rule violations
    </span>
  {/if}
</header>

{#if report?.violations.length}
  <ul class="violations">
    {#each report.violations as v, i (i)}<li>{v}</li>{/each}
  </ul>
{/if}

<main>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- generated locally from sample data -->
  {@html svg}
</main>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  select {
    font: inherit;
    padding: 0.25rem 0.5rem;
  }

  .violations {
    margin: 0;
    padding: 0.5rem 2rem;
    color: #b91c1c;
    font-size: 0.875rem;
  }

  main {
    overflow: auto;
    height: calc(100% - 3.25rem);
    touch-action: pan-x pan-y pinch-zoom;
  }

  main :global(svg) {
    display: block;
  }
</style>
