<script lang="ts">
  import type { Sex } from '../model/types'
  import { SEX_LABELS } from './labels'

  let { value = $bindable(), onchange }: { value: Sex; onchange?: (s: Sex) => void } = $props()
  const options: Sex[] = ['M', 'F', 'X', '?']
</script>

<div class="seg" role="group" aria-label="Sex">
  {#each options as s (s)}
    <button
      type="button"
      aria-pressed={value === s}
      onclick={() => {
        value = s
        onchange?.(s)
      }}
    >
      {s === '?' ? '?' : SEX_LABELS[s]}
    </button>
  {/each}
</div>
