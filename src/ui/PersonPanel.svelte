<script lang="ts">
  // Selected person: quick "Add …" actions, live-edited details, delete.
  import { buildRelations, parentsOf } from '../model/relations'
  import type { Id, Person, Sex } from '../model/types'
  import * as cmd from '../store/commands'
  import AddRelativeForm, { type AddKind } from './AddRelativeForm.svelte'
  import type { AppState } from './app.svelte'
  import { optStr, parseOptInt } from './num'
  import SexPicker from './SexPicker.svelte'

  interface Props {
    app: AppState
    person: Person
    onadded: (id: Id) => void
  }
  let { app, person, onadded }: Props = $props()

  // Editor re-creates this panel per person ({#key}), so this resets on selection change.
  let adding = $state<AddKind | null>(null)

  const rel = $derived(buildRelations(app.doc!))
  const parentCount = $derived(parentsOf(rel, person.id).length)
  const isSupport = $derived(
    app.doc!.bonds.some(b => b.supportId === person.id) &&
      !rel.familiesAsChild.has(person.id) &&
      !rel.familiesAsParent.has(person.id) &&
      !rel.partnershipsOf.has(person.id),
  )

  const actions = $derived<[AddKind, string][]>(
    isSupport
      ? [['relationship', 'Relationship line']]
      : [
          parentCount === 0 ? ['parents', 'Parents'] : ['parent', parentCount === 1 ? 'Other parent' : 'Step / adoptive parent'],
          ['partner', 'Partner'],
          ['child', 'Child'],
          ['sibling', 'Sibling'],
          ['support', 'Support person'],
          ['relationship', 'Relationship line'],
        ],
  )

  const update = (field: string, patch: Partial<cmd.NewPerson>) =>
    app.apply(g => cmd.updatePerson(g, person.id, patch), `person:${person.id}:${field}`)

  function remove() {
    if (!confirm(`Remove ${person.name || 'this person'} and their lines from the diagram?`)) return
    app.apply(g => cmd.deletePerson(g, person.id)) // Editor clears the selection once they're gone.
  }
</script>

{#if adding}
  <AddRelativeForm
    {app}
    personId={person.id}
    kind={adding}
    oncancel={() => (adding = null)}
    ondone={id => {
      adding = null
      if (id) onadded(id)
    }}
  />
{:else}
  <div class="stack">
    <section aria-label="Add">
      <h3>Add</h3>
      <div class="actions">
        {#each actions as [kind, label] (kind)}
          <button class="btn" onclick={() => (adding = kind)}>+ {label}</button>
        {/each}
      </div>
    </section>

    <section class="stack" aria-label="Details">
      <h3>Details</h3>
      <label class="field">
        <span>Name</span>
        <input value={person.name} oninput={e => update('name', { name: e.currentTarget.value })} autocomplete="off" />
      </label>
      <SexPicker value={person.sex} onchange={(s: Sex) => update('sex', { sex: s })} />
      <div class="row">
        <label class="field">
          <span>Age</span>
          <input
            value={optStr(person.age)}
            inputmode="numeric"
            oninput={e => update('age', { age: parseOptInt(e.currentTarget.value) })}
          />
        </label>
        <label class="field">
          <span>Born</span>
          <input
            value={optStr(person.birthYear)}
            inputmode="numeric"
            placeholder="Year"
            oninput={e => update('birthYear', { birthYear: parseOptInt(e.currentTarget.value) })}
          />
        </label>
        {#if person.deceased}
          <label class="field">
            <span>Died</span>
            <input
              value={optStr(person.deathYear)}
              inputmode="numeric"
              placeholder="Year"
              oninput={e => update('deathYear', { deathYear: parseOptInt(e.currentTarget.value) })}
            />
          </label>
        {/if}
      </div>
      <label class="check">
        <input
          type="checkbox"
          checked={!!person.deceased}
          onchange={e => update('deceased', { deceased: e.currentTarget.checked || undefined })}
        />
        Deceased
      </label>
      <label class="field">
        <span>Notes</span>
        <textarea value={person.notes ?? ''} oninput={e => update('notes', { notes: e.currentTarget.value || undefined })}></textarea>
      </label>
    </section>

    <section class="footer-actions">
      {#if person.isIndexPerson}
        <span class="muted">★ Primary subject</span>
      {:else}
        <button class="btn" onclick={() => app.apply(g => cmd.setIndexPerson(g, person.id))}>Make primary subject</button>
        <button class="btn btn-danger" onclick={remove}>Remove person</button>
      {/if}
    </section>
  </div>
{/if}

<style>
  h3 {
    margin: 0 0 0.5rem;
    font-size: 0.8125rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .stack > section.stack h3 {
    margin-bottom: 0;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
    gap: 0.5rem;
  }

  .actions .btn {
    justify-content: flex-start;
  }

  .footer-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
</style>
