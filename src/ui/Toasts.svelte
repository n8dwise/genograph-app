<script lang="ts">
  import type { AppState } from './app.svelte'

  let { app }: { app: AppState } = $props()
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast" class:error={t.kind === 'error'} role={t.kind === 'error' ? 'alert' : 'status'}>
      <span>{t.message}</span>
      <button class="btn btn-ghost btn-icon" aria-label="Dismiss" onclick={() => app.dismiss(t.id)}>✕</button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    top: max(12px, env(safe-area-inset-top));
    transform: translateX(-50%);
    display: grid;
    gap: 0.5rem;
    width: min(32rem, calc(100% - 24px));
    z-index: 50;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.25rem 0.25rem 1rem;
    border-radius: 12px;
    background: var(--accent);
    color: var(--bg);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.2);
    font-size: 0.9375rem;
  }

  .toast span {
    flex: 1;
  }

  .toast.error {
    background: var(--quality-conflicted);
    color: #fff;
  }

  .toast button {
    color: inherit;
  }
</style>
