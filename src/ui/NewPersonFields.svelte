<script lang="ts">
  // Name / sex / age inputs for creating someone. Values are bound by the parent form.
  import type { Sex } from '../model/types'
  import SexPicker from './SexPicker.svelte'

  interface Props {
    name: string
    sex: Sex
    age: string
    legend?: string
    autofocus?: boolean
  }
  let { name = $bindable(), sex = $bindable(), age = $bindable(), legend, autofocus = false }: Props = $props()
</script>

<fieldset class="stack">
  {#if legend}<legend>{legend}</legend>{/if}
  <label class="field">
    <span>Name</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={name} autocomplete="off" placeholder="Name" {autofocus} />
  </label>
  <SexPicker bind:value={sex} />
  <label class="field">
    <span>Age <span class="muted">(optional)</span></span>
    <input bind:value={age} inputmode="numeric" pattern="[0-9]*" autocomplete="off" />
  </label>
</fieldset>

<style>
  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  legend {
    font-weight: 600;
    padding: 0;
    margin-bottom: 0.25rem;
  }
</style>
