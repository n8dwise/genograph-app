<script lang="ts">
  // The open genogram: top bar, canvas, and the panel for whatever is selected
  // (bottom sheet on phones, side panel on wide screens).
  import { tick } from 'svelte'
  import { layout } from '../layout'
  import type { Id } from '../model/types'
  import Canvas from '../render/Canvas.svelte'
  import * as cmd from '../store/commands'
  import type { AppState } from './app.svelte'
  import { BOND_TYPE_LABELS, PARTNERSHIP_TYPE_LABELS, RELATIONSHIP_LABELS } from './labels'
  import LinePanels from './LinePanels.svelte'
  import PersonPanel from './PersonPanel.svelte'

  let { app }: { app: AppState } = $props()

  const g = $derived(app.doc!)
  const res = $derived(layout(g))
  let canvas = $state<ReturnType<typeof Canvas>>()
  let menuOpen = $state(false)
  let panelHeight = $state(0)
  let wide = $state(false)
  $effect(() => {
    const mq = matchMedia('(min-width: 900px)')
    wide = mq.matches
    const on = () => (wide = mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  })
  // The phone bottom sheet covers the canvas; tell the canvas how much.
  const insetBottom = $derived(app.selected && !wide ? panelHeight : 0)

  async function select(s: typeof app.selected) {
    app.selected = s
    if (s?.kind === 'person') {
      await tick()
      canvas?.reveal(s.id)
    }
  }

  const nameOf = (id: Id) => g.persons.find(p => p.id === id)?.name || 'Unnamed'

  // Drop the selection if its target disappears (deleted, or undone).
  $effect(() => {
    const s = app.selected
    if (!s) return
    const exists =
      s.kind === 'person' ? g.persons.some(p => p.id === s.id)
      : s.kind === 'partnership' ? g.partnerships.some(p => p.id === s.id)
      : s.kind === 'relationship' ? g.relationships.some(r => r.id === s.id)
      : g.bonds.some(b => b.id === s.id)
    if (!exists) app.selected = null
  })

  const selectedPerson = $derived(
    app.selected?.kind === 'person' ? g.persons.find(p => p.id === app.selected!.id) : undefined,
  )

  const panelTitle = $derived.by(() => {
    const s = app.selected
    if (!s) return ''
    if (s.kind === 'person') return nameOf(s.id)
    if (s.kind === 'partnership') {
      const p = g.partnerships.find(x => x.id === s.id)!
      return `${nameOf(p.a)} & ${nameOf(p.b)} · ${PARTNERSHIP_TYPE_LABELS[p.type]}`
    }
    if (s.kind === 'relationship') {
      const r = g.relationships.find(x => x.id === s.id)!
      return `${nameOf(r.a)} – ${nameOf(r.b)} · ${RELATIONSHIP_LABELS[r.kind]}`
    }
    const b = g.bonds.find(x => x.id === s.id)!
    return `${nameOf(b.supportId)} · ${BOND_TYPE_LABELS[b.type]} of ${nameOf(b.personId)}`
  })

  const added = (id: Id) => select({ kind: 'person', id })

  const saveLabel = $derived(
    !app.s.autosave ? (app.s.saveStatus === 'saved' ? 'Saved' : 'Not saved — autosave off')
    : app.s.saveStatus === 'pending' ? 'Saving…'
    : app.s.saveStatus === 'error' ? 'Couldn’t save'
    : 'Saved on this device',
  )

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement
    if (el.closest('input, textarea, select')) return // let fields keep native undo
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) app.redo()
      else app.undo()
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      app.redo()
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="editor" class:has-panel={!!app.selected}>
  <header class="topbar">
    <a class="btn btn-ghost btn-icon" href="#/" aria-label="My genograms">‹</a>
    <input
      class="title"
      value={g.meta.title}
      placeholder="Untitled genogram"
      aria-label="Diagram title"
      oninput={e => app.apply(g => cmd.setTitle(g, e.currentTarget.value), 'title')}
    />
    <button class="btn btn-ghost btn-icon" aria-label="Undo" disabled={!app.s.canUndo} onclick={() => app.undo()}>↶</button>
    <button class="btn btn-ghost btn-icon" aria-label="Redo" disabled={!app.s.canRedo} onclick={() => app.redo()}>↷</button>
    <div class="menu">
      <button class="btn btn-ghost btn-icon" aria-label="More" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>⋯</button>
      {#if menuOpen}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="backdrop" onclick={() => (menuOpen = false)}></div>
        <div class="menu-items" role="menu">
          <p class="status muted" class:warn={app.s.saveStatus === 'error' || !app.s.autosave}>{saveLabel}</p>
          {#if !app.s.autosave}
            <button role="menuitem" class="btn btn-ghost" onclick={() => { app.session.save(); menuOpen = false }}>Save now</button>
          {/if}
          <label class="check menu-check">
            <input type="checkbox" checked={app.s.autosave} onchange={e => app.setAutosave(e.currentTarget.checked)} />
            Save automatically
          </label>
          <button role="menuitem" class="btn btn-ghost" onclick={() => { app.exportFile(); menuOpen = false }}>Download JSON file</button>
          <button role="menuitem" class="btn btn-ghost" disabled={!Object.keys(g.pins).length}
            onclick={() => { app.apply(g => cmd.resetLayout(g)); menuOpen = false }}>Reset moved people</button>
        </div>
      {/if}
    </div>
  </header>

  <main class="canvas-area">
    <Canvas
      bind:this={canvas}
      {g}
      {res}
      selected={app.selected}
      fitKey={app.s.docId}
      onselect={select}
      {insetBottom}
      onmove={(id, dx, dy) => app.apply(g => cmd.nudge(g, id, dx, dy))}
    />
    {#if !app.selected}
      <p class="hint">Tap a person to add family or edit details. Once selected, drag them to move.</p>
    {/if}
  </main>

  {#if app.selected}
    <aside class="panel" aria-label={panelTitle} bind:clientHeight={panelHeight}>
      <div class="panel-head">
        <span class="grabber" aria-hidden="true"></span>
        <h2>{panelTitle}</h2>
        <button class="btn btn-ghost btn-icon" aria-label="Close panel" onclick={() => (app.selected = null)}>✕</button>
      </div>
      <div class="panel-body">
        {#key `${app.selected.kind}:${app.selected.id}`}
          {#if selectedPerson}
            <PersonPanel {app} person={selectedPerson} onadded={added} />
          {:else if app.selected.kind !== 'person'}
            <LinePanels {app} selection={app.selected} onadded={added} />
          {/if}
        {/key}
      </div>
    </aside>
  {/if}
</div>

<style>
  .editor {
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
    height: 100%;
    position: relative;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: max(0.25rem, env(safe-area-inset-top)) max(0.5rem, env(safe-area-inset-right)) 0.25rem
      max(0.25rem, env(safe-area-inset-left));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    grid-column: 1 / -1;
  }

  .topbar a {
    font-size: 1.75rem;
    color: inherit;
    text-decoration: none;
  }

  .title {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    padding: 0 0.5rem;
    font-weight: 600;
    font-size: 1rem;
  }

  .title:hover,
  .title:focus {
    border-color: var(--border);
    background: var(--bg);
  }

  .topbar .btn-icon {
    font-size: 1.25rem;
  }

  .menu {
    position: relative;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
  }

  .menu-items {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 21;
    display: grid;
    min-width: 15rem;
    padding: 0.375rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.2);
  }

  .menu-items .btn {
    justify-content: flex-start;
  }

  .status {
    margin: 0;
    padding: 0.5rem 1rem;
    font-size: 0.8125rem;
    border-bottom: 1px solid var(--border);
  }

  .status.warn {
    color: var(--quality-strained);
  }

  .menu-check {
    padding: 0 1rem;
  }

  .canvas-area {
    position: relative;
    min-height: 0;
  }

  .hint {
    position: absolute;
    left: 12px;
    bottom: 12px;
    right: 72px;
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-muted);
    pointer-events: none;
  }

  /* Phone: bottom sheet over the canvas. */
  .panel {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 58%;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 30px rgb(0 0 0 / 0.18);
    z-index: 10;
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.5rem 0.25rem 1rem;
    position: relative;
  }

  .grabber {
    position: absolute;
    top: 6px;
    left: 50%;
    width: 36px;
    height: 4px;
    margin-left: -18px;
    border-radius: 2px;
    background: var(--border);
  }

  .panel-head h2 {
    flex: 1;
    margin: 0.5rem 0 0;
    font-size: 1.0625rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-body {
    overflow-y: auto;
    padding: 0.5rem 1rem max(1rem, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }

  /* Wide screens: side panel. */
  @media (min-width: 900px) {
    .editor.has-panel {
      grid-template-columns: 1fr 24rem;
    }

    .panel {
      position: static;
      max-height: none;
      border-top: 0;
      border-left: 1px solid var(--border);
      border-radius: 0;
      box-shadow: none;
      min-height: 0;
    }

    .grabber {
      display: none;
    }
  }
</style>
