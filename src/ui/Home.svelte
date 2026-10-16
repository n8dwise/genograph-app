<script lang="ts">
  // My Genograms: saved diagrams on this device, plus new / import / sample.
  // With nothing saved yet, it opens straight onto "Who's the client?".
  import type { Sex } from '../model/types'
  import type { AppState } from './app.svelte'
  import { relativeTime } from './labels'
  import NewPersonFields from './NewPersonFields.svelte'
  import { parseOptInt } from './num'

  let { app }: { app: AppState } = $props()

  let creating = $state(false)
  let title = $state('')
  let name = $state('')
  let sex = $state<Sex>('F')
  let age = $state('')
  let fileInput: HTMLInputElement

  $effect(() => {
    app.refreshDocs()
  })
  const firstRun = $derived(app.docsLoaded && app.docs.length === 0)
  const showForm = $derived(creating || firstRun)

  async function create(e: SubmitEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const ageN = parseOptInt(age)
    const id = await app.session.create(title.trim(), {
      name: name.trim(),
      sex,
      ...(ageN !== undefined && { age: ageN }),
    })
    creating = false
    title = name = age = ''
    app.go({ name: 'doc', id })
  }

  async function openSample() {
    const { fixtures } = await import('../fixtures')
    const g = fixtures.example()
    g.meta.title = 'Sample family'
    await app.session.importText(JSON.stringify(g))
    await app.refreshDocs()
    app.go({ name: 'doc', id: app.s.docId! })
  }

  async function duplicate(id: string) {
    await app.library.duplicate(id, crypto.randomUUID())
    await app.refreshDocs()
  }

  async function remove(id: string, label: string) {
    if (!confirm(`Delete “${label}”? This can’t be undone.`)) return
    await app.library.remove(id)
    await app.refreshDocs()
  }

  function onfile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    if (file) app.importFile(file)
    ;(e.currentTarget as HTMLInputElement).value = ''
  }
</script>

<div class="home">
  <header>
    <h1>Genograph</h1>
    <p class="muted">Everything stays on this device.</p>
  </header>

  {#if showForm}
    <form class="card stack" onsubmit={create}>
      <h2>Who’s the client?</h2>
      <p class="muted">They’ll be the center of the diagram. You’ll add everyone else around them.</p>
      <NewPersonFields bind:name bind:sex bind:age autofocus />
      <label class="field">
        <span>Diagram title <span class="muted">(optional)</span></span>
        <input bind:value={title} autocomplete="off" placeholder="e.g. initials or case number" />
      </label>
      <div class="buttons">
        {#if !firstRun}
          <button type="button" class="btn" onclick={() => (creating = false)}>Cancel</button>
        {/if}
        <button type="submit" class="btn btn-primary" disabled={!name.trim()}>Start genogram</button>
      </div>
    </form>
  {:else}
    <div class="toolbar">
      <button class="btn btn-primary" onclick={() => (creating = true)}>+ New genogram</button>
    </div>
  {/if}

  {#if app.docs.length}
    <section>
      <h2>My genograms</h2>
      <ul class="docs">
        {#each app.docs as d (d.id)}
          {@const label = d.title || 'Untitled'}
          <li class="card">
            <a href="#/g/{d.id}" class="open">
              <strong>{label}</strong>
              <span class="muted">{d.people} {d.people === 1 ? 'person' : 'people'} · {relativeTime(d.updated)}</span>
            </a>
            <button class="btn btn-ghost btn-icon" aria-label="Duplicate {label}" onclick={() => duplicate(d.id)}>⧉</button>
            <button class="btn btn-ghost btn-icon btn-danger" aria-label="Delete {label}" onclick={() => remove(d.id, label)}>🗑</button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="more">
    <button class="btn" onclick={() => fileInput.click()}>Open a file…</button>
    <button class="btn" onclick={openSample}>Try a sample family</button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onfile} />
  </section>
</div>

<style>
  .home {
    max-width: 40rem;
    margin: 0 auto;
    padding: max(1.5rem, env(safe-area-inset-top)) 1rem 3rem;
    display: grid;
    gap: 1.5rem;
  }

  h1 {
    margin: 0;
    font-size: 1.75rem;
  }

  h2 {
    margin: 0;
    font-size: 1.125rem;
  }

  header p,
  form p {
    margin: 0.25rem 0 0;
  }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 14px;
  }

  form.card {
    padding: 1.25rem;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .docs {
    list-style: none;
    margin: 0.75rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }

  .docs li {
    display: flex;
    align-items: center;
    padding-right: 0.25rem;
  }

  .open {
    flex: 1;
    display: grid;
    padding: 0.875rem 1rem;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }

  .open strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .open span {
    font-size: 0.875rem;
  }

  .more {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
