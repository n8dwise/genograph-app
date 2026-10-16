<script lang="ts">
  // Panels for selected lines: partnership, emotional relationship, support bond.
  import type { Id, Quality } from '../model/types'
  import type { Selection } from '../render/selection'
  import * as cmd from '../store/commands'
  import AddRelativeForm from './AddRelativeForm.svelte'
  import type { AppState } from './app.svelte'
  import {
    BOND_TYPE_LABELS, PARTNERSHIP_STATUS_LABELS, PARTNERSHIP_TYPE_LABELS, QUALITY_LABELS,
    RELATIONSHIP_GROUPS,
  } from './labels'
  import { optStr, parseOptInt } from './num'

  interface Props {
    app: AppState
    selection: Exclude<Selection, { kind: 'person' }>
    onadded: (id: Id) => void
  }
  let { app, selection, onadded }: Props = $props()

  const g = $derived(app.doc!)
  const nameOf = (id: Id) => g.persons.find(p => p.id === id)?.name || 'Unnamed'
  const partnership = $derived(selection.kind === 'partnership' ? g.partnerships.find(p => p.id === selection.id) : undefined)
  const relationship = $derived(selection.kind === 'relationship' ? g.relationships.find(r => r.id === selection.id) : undefined)
  const bond = $derived(selection.kind === 'bond' ? g.bonds.find(b => b.id === selection.id) : undefined)

  // Editor re-creates this panel per selection ({#key}).
  let addingChild = $state(false)

  const qualities: (Quality | undefined)[] = [undefined, 'good', 'strained', 'conflicted']
  const key = (field: string) => `${selection.kind}:${selection.id}:${field}`
</script>

{#snippet qualityPicker(value: Quality | undefined, set: (q: Quality | undefined) => void)}
  <div class="field">
    <span>Quality</span>
    <div class="seg" role="group" aria-label="Quality">
      {#each qualities as q (q ?? 'none')}
        <button type="button" aria-pressed={value === q} onclick={() => set(q)}>{q ? QUALITY_LABELS[q] : 'Not set'}</button>
      {/each}
    </div>
  </div>
{/snippet}

{#if partnership}
  {@const p = partnership}
  {#if addingChild}
    <AddRelativeForm
      {app}
      personId={p.a}
      kind="child"
      coParentId={p.b}
      oncancel={() => (addingChild = false)}
      ondone={id => {
        addingChild = false
        if (id) onadded(id)
      }}
    />
  {:else}
    <div class="stack">
      <div class="row">
        <label class="field">
          <span>Relationship</span>
          <select value={p.type} onchange={e => app.apply(g => cmd.updatePartnership(g, p.id, { type: e.currentTarget.value as typeof p.type }))}>
            {#each Object.entries(PARTNERSHIP_TYPE_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select value={p.status} onchange={e => app.apply(g => cmd.updatePartnership(g, p.id, { status: e.currentTarget.value as typeof p.status }))}>
            {#each Object.entries(PARTNERSHIP_STATUS_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </select>
        </label>
      </div>
      {@render qualityPicker(p.quality, q => app.apply(g => cmd.updatePartnership(g, p.id, { quality: q })))}
      <div class="row">
        <label class="field">
          <span>From (year)</span>
          <input value={optStr(p.startYear)} inputmode="numeric"
            oninput={e => app.apply(g => cmd.updatePartnership(g, p.id, { startYear: parseOptInt(e.currentTarget.value) }), key('start'))} />
        </label>
        <label class="field">
          <span>Until (year)</span>
          <input value={optStr(p.endYear)} inputmode="numeric"
            oninput={e => app.apply(g => cmd.updatePartnership(g, p.id, { endYear: parseOptInt(e.currentTarget.value) }), key('end'))} />
        </label>
      </div>
      <div class="buttons">
        <button class="btn" onclick={() => (addingChild = true)}>+ Child of this couple</button>
        <button class="btn btn-danger" onclick={() => {
          if (confirm(`Remove the relationship between ${nameOf(p.a)} and ${nameOf(p.b)}? Their children keep both parents.`)) {
            app.apply(g => cmd.deletePartnership(g, p.id))
          }
        }}>Remove relationship</button>
      </div>
    </div>
  {/if}
{:else if relationship}
  {@const r = relationship}
  <div class="stack">
    <label class="field">
      <span>Kind of relationship</span>
      <select value={r.kind} onchange={e => app.apply(g => cmd.updateRelationship(g, r.id, { kind: e.currentTarget.value as typeof r.kind }))}>
        {#each RELATIONSHIP_GROUPS as group (group.label)}
          <optgroup label={group.label}>
            {#each group.kinds as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </label>
    <label class="field">
      <span>Note</span>
      <input value={r.note ?? ''} oninput={e => app.apply(g => cmd.updateRelationship(g, r.id, { note: e.currentTarget.value || undefined }), key('note'))} />
    </label>
    <div class="buttons">
      <button class="btn btn-danger" onclick={() => app.apply(g => cmd.deleteRelationship(g, r.id))}>Remove line</button>
    </div>
  </div>
{:else if bond}
  {@const b = bond}
  <div class="stack">
    <label class="field">
      <span>Role</span>
      <select value={b.type} onchange={e => app.apply(g => cmd.updateBond(g, b.id, { type: e.currentTarget.value as typeof b.type }))}>
        {#each Object.entries(BOND_TYPE_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Label <span class="muted">(optional)</span></span>
      <input value={b.label ?? ''} oninput={e => app.apply(g => cmd.updateBond(g, b.id, { label: e.currentTarget.value || undefined }), key('label'))} />
    </label>
    {@render qualityPicker(b.quality, q => app.apply(g => cmd.updateBond(g, b.id, { quality: q })))}
    <div class="buttons">
      <button class="btn btn-danger" onclick={() => app.apply(g => cmd.deleteBond(g, b.id))}>Remove line</button>
    </div>
  </div>
{/if}

<style>
  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem;
  }
</style>
