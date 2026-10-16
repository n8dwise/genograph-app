<script lang="ts">
  // Phase 3 demo shell: sample families on the real canvas, with zoom controls
  // and a readout of what was tapped. Replaced by the editor UI in Phase 4.
  // ?sample=<name> picks the sample (handy for screenshots).
  import { checkLayout } from './layout/check'
  import { layout } from './layout'
  import type { Genogram } from './model/types'
  import Canvas from './render/Canvas.svelte'
  import type { Selection } from './render/selection'

  const loading = import('./fixtures').then(m => m.fixtures)
  const params = new URLSearchParams(location.search)

  let name = $state(params.get('sample') ?? 'example')
  let g = $state<Genogram | null>(null)
  let selected = $state<Selection | null>(null)

  $effect(() => {
    const current = name
    loading.then(fixtures => {
      g = (fixtures[current] ?? fixtures.example)()
      selected = null
    })
  })

  const res = $derived(g ? layout(g) : null)
  const report = $derived(g && res ? checkLayout(g, res) : null)

  const describe = (s: Selection | null): string => {
    if (!s || !g) return 'Tap a person or line'
    const person = (id: string) => g!.persons.find(p => p.id === id)?.name ?? id
    switch (s.kind) {
      case 'person':
        return person(s.id)
      case 'partnership': {
        const p = g.partnerships.find(x => x.id === s.id)!
        return `${person(p.a)} & ${person(p.b)} — ${p.type}, ${p.status}`
      }
      case 'relationship': {
        const r = g.relationships.find(x => x.id === s.id)!
        return `${person(r.a)} ↔ ${person(r.b)} — ${r.kind}`
      }
      case 'bond': {
        const b = g.bonds.find(x => x.id === s.id)!
        return `${person(b.supportId)} → ${person(b.personId)} — ${b.type}`
      }
    }
  }
</script>

<div class="app">
  <header>
    <strong>Genograph</strong>
    {#await loading then fixtures}
      <select bind:value={name} aria-label="Sample family">
        {#each Object.keys(fixtures) as key (key)}
          <option value={key}>{key}</option>
        {/each}
      </select>
    {/await}
  </header>

  <main>
    {#if g && res}
      <Canvas {g} {res} {selected} fitKey={name} onselect={s => (selected = s)} />
    {/if}
  </main>

  <footer>
    <span>{describe(selected)}</span>
    {#if report && g}
      <span class="muted">{g.persons.length} people · {report.crossings} crossings · {report.violations.length} rule issues</span>
    {/if}
  </footer>
</div>

<style>
  .app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100%;
  }

  header,
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem max(0.75rem, env(safe-area-inset-left));
    background: var(--surface);
    border-color: var(--border);
    border-style: solid;
    border-width: 0;
  }

  header {
    border-bottom-width: 1px;
    padding-top: max(0.5rem, env(safe-area-inset-top));
  }

  footer {
    border-top-width: 1px;
    justify-content: space-between;
    font-size: 0.875rem;
    padding-bottom: max(0.5rem, env(safe-area-inset-bottom));
  }

  .muted {
    color: var(--text-muted);
  }

  main {
    min-height: 0;
  }

  select {
    font: inherit;
    color: inherit;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.375rem 0.75rem;
    min-height: 40px;
  }
</style>
