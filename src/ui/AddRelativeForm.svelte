<script lang="ts" module>
  export type AddKind = 'parents' | 'parent' | 'partner' | 'child' | 'sibling' | 'support' | 'relationship'
</script>

<script lang="ts">
  // One form for every "Add …" action on a person. Fields adapt to the kind.
  import { buildRelations, parentsOf, partnersOf } from '../model/relations'
  import type {
    BondType, ChildKind, Id, PartnershipStatus, PartnershipType, RelationshipKind, Sex,
  } from '../model/types'
  import * as cmd from '../store/commands'
  import type { AppState } from './app.svelte'
  import {
    BOND_TYPE_LABELS, CHILD_KIND_LABELS, PARTNERSHIP_STATUS_LABELS, PARTNERSHIP_TYPE_LABELS,
    RELATIONSHIP_GROUPS,
  } from './labels'
  import NewPersonFields from './NewPersonFields.svelte'
  import { parseOptInt } from './num'

  interface Props {
    app: AppState
    personId: Id
    kind: AddKind
    /** Pre-selected other parent when adding a child from a partnership. */
    coParentId?: Id
    ondone: (newPersonId?: Id) => void
    oncancel: () => void
  }
  let { app, personId, kind, coParentId, ondone, oncancel }: Props = $props()

  const g = $derived(app.doc!)
  const rel = $derived(buildRelations(g))
  const me = $derived(rel.person.get(personId)!)
  const opposite = (s: Sex): Sex => (s === 'M' ? 'F' : s === 'F' ? 'M' : '?')
  const nameOf = (id: Id) => rel.person.get(id)?.name || 'Unnamed'

  // Person being created (single-person kinds).
  let name = $state('')
  let sex = $state<Sex>('?')
  let age = $state('')
  // Second parent for "parents".
  let name2 = $state('')
  let sex2 = $state<Sex>('F')
  let age2 = $state('')
  let onlyOne = $state(false)

  let ptype = $state<PartnershipType>('married')
  let pstatus = $state<PartnershipStatus>('active')
  let childKind = $state<ChildKind>('bio')
  let parentKind = $state<ChildKind>('bio')
  let coParent = $state<Id | ''>('')
  let bondType = $state<BondType>('counselor')
  let bondLabel = $state('')
  let otherId = $state<Id | ''>('')
  let relKind = $state<RelationshipKind>('close')
  let note = $state('')

  // Defaults that depend on the person (set once).
  $effect.pre(() => {
    if (kind === 'parents') {
      sex = 'M'
      sex2 = 'F'
    } else if (kind === 'partner') {
      sex = opposite(me.sex)
    } else if (kind === 'parent') {
      const existing = parentsOf(rel, personId).map(id => rel.person.get(id)!.sex)
      sex = existing.length === 1 ? opposite(existing[0]) : '?'
      if (existing.length >= 2) parentKind = 'step'
    }
    if (kind === 'child') coParent = coParentId ?? partnersOf(rel, personId)[0] ?? ''
  })

  const partners = $derived(partnersOf(rel, personId))
  const parentCount = $derived(parentsOf(rel, personId).length)
  const others = $derived(g.persons.filter(p => p.id !== personId))

  const titles: Record<AddKind, string> = {
    parents: 'Add parents',
    parent: 'Add a parent',
    partner: 'Add a partner',
    child: 'Add a child',
    sibling: 'Add a sibling',
    support: 'Add a support person',
    relationship: 'Add a relationship line',
  }

  const newPerson = (n: string, s: Sex, a: string) => {
    const ageN = parseOptInt(a)
    return { name: n.trim(), sex: s, ...(ageN !== undefined && { age: ageN }) }
  }

  const valid = $derived(
    kind === 'relationship' ? !!otherId : kind === 'parents' && !onlyOne ? !!name.trim() && !!name2.trim() : !!name.trim(),
  )

  function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!valid) return
    const p = newPerson(name, sex, age)
    let id: Id | undefined
    switch (kind) {
      case 'parents':
        id = onlyOne
          ? app.apply(g => cmd.addParent(g, personId, p))
          : app.apply(g => cmd.addParents(g, personId, p, newPerson(name2, sex2, age2)))
        break
      case 'parent':
        id = app.apply(g => cmd.addParent(g, personId, p, parentKind === 'bio' ? {} : { kind: parentKind }))
        break
      case 'partner':
        id = app.apply(g => cmd.addPartner(g, personId, p, { type: ptype, status: pstatus }))
        break
      case 'child':
        id = app.apply(g =>
          cmd.addChild(g, personId, p, { ...(coParent && { coParentId: coParent }), kind: childKind }),
        )
        break
      case 'sibling':
        id = app.apply(g => cmd.addSibling(g, personId, p))
        break
      case 'support':
        id = app.apply(g => cmd.addSupportPerson(g, personId, p, bondType, bondLabel.trim() || undefined))
        break
      case 'relationship':
        app.apply(g => cmd.addRelationship(g, personId, otherId as Id, relKind, note.trim() || undefined))
        ondone()
        return
    }
    if (id !== undefined) ondone(id)
  }
</script>

<form class="stack" onsubmit={submit}>
  <h3>{titles[kind]} <span class="muted">for {me.name || 'Unnamed'}</span></h3>

  {#if kind === 'parents'}
    <NewPersonFields bind:name bind:sex bind:age legend={onlyOne ? 'Parent' : 'First parent'} autofocus />
    {#if !onlyOne}
      <NewPersonFields bind:name={name2} bind:sex={sex2} bind:age={age2} legend="Second parent" />
    {/if}
    <label class="check"><input type="checkbox" bind:checked={onlyOne} /> Only one parent is known</label>
  {:else if kind === 'relationship'}
    <label class="field">
      <span>With</span>
      <select bind:value={otherId}>
        <option value="" disabled>Choose a person…</option>
        {#each others as o (o.id)}<option value={o.id}>{o.name || 'Unnamed'}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span>Kind of relationship</span>
      <select bind:value={relKind}>
        {#each RELATIONSHIP_GROUPS as group (group.label)}
          <optgroup label={group.label}>
            {#each group.kinds as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </label>
    <label class="field"><span>Note <span class="muted">(optional)</span></span><input bind:value={note} /></label>
  {:else}
    <NewPersonFields bind:name bind:sex bind:age autofocus />

    {#if kind === 'parent' && parentCount >= 1}
      <label class="field">
        <span>Kind of parent</span>
        <select bind:value={parentKind}>
          {#if parentCount < 2}<option value="bio">Biological</option>{/if}
          <option value="adopted">Adoptive</option>
          <option value="foster">Foster</option>
          <option value="step">Step-parent</option>
        </select>
      </label>
    {/if}

    {#if kind === 'partner'}
      <div class="row">
        <label class="field">
          <span>Relationship</span>
          <select bind:value={ptype}>
            {#each Object.entries(PARTNERSHIP_TYPE_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Status</span>
          <select bind:value={pstatus}>
            {#each Object.entries(PARTNERSHIP_STATUS_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </select>
        </label>
      </div>
    {/if}

    {#if kind === 'child'}
      <div class="row">
        <label class="field">
          <span>Other parent</span>
          <select bind:value={coParent}>
            {#each partners as id (id)}<option value={id}>{nameOf(id)}</option>{/each}
            <option value="">Unknown / not on chart</option>
          </select>
        </label>
        <label class="field">
          <span>Child is</span>
          <select bind:value={childKind}>
            {#each Object.entries(CHILD_KIND_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
          </select>
        </label>
      </div>
    {/if}

    {#if kind === 'sibling'}
      <p class="muted hint">Adds a full sibling. For a half-sibling, add a child to the shared parent with their other partner.</p>
    {/if}

    {#if kind === 'support'}
      <label class="field">
        <span>Role</span>
        <select bind:value={bondType}>
          {#each Object.entries(BOND_TYPE_LABELS) as [k, label] (k)}<option value={k}>{label}</option>{/each}
        </select>
      </label>
      {#if bondType === 'other'}
        <label class="field"><span>Describe the role</span><input bind:value={bondLabel} /></label>
      {/if}
    {/if}
  {/if}

  <div class="buttons">
    <button type="button" class="btn" onclick={oncancel}>Cancel</button>
    <button type="submit" class="btn btn-primary" disabled={!valid}>Add</button>
  </div>
</form>

<style>
  h3 {
    margin: 0;
    font-size: 1.0625rem;
  }

  h3 span {
    font-weight: 400;
  }

  .hint {
    margin: 0;
    font-size: 0.875rem;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
