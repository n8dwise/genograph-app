<script lang="ts">
  // Root: My Genograms (home) or the editor for #/g/<id>.
  import { untrack } from 'svelte'
  import { DocLibrary, indexedDbKeyValue } from './store/persistence'
  import { AppState } from './ui/app.svelte'
  import Editor from './ui/Editor.svelte'
  import Home from './ui/Home.svelte'
  import Toasts from './ui/Toasts.svelte'

  const app = new AppState(new DocLibrary(indexedDbKeyValue()))

  // Keep the session in step with the URL (also handles the browser back button).
  // Runs only when the route changes: actions that open a document themselves
  // (new, import, sample) must not be undone by this effect mid-flight.
  $effect(() => {
    const route = app.route
    untrack(() => syncRoute(route))
  })

  function syncRoute(route: typeof app.route) {
    if (route.name === 'doc' && app.s.docId !== route.id) {
      app.selected = null
      app.session.open(route.id).catch(e => {
        app.toast(`Couldn’t open that genogram: ${(e as Error).message}`, 'error')
        app.go({ name: 'home' })
      })
    } else if (route.name === 'home' && app.s.docId) {
      app.selected = null
      app.session.close().then(() => app.refreshDocs())
    }
  }

  // Don't lose a pending autosave when the tab is hidden or closed.
  $effect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void app.session.flush()
    }
    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  })
</script>

{#if app.route.name === 'doc'}
  {#if app.s.doc && app.s.docId === app.route.id}
    <Editor {app} />
  {/if}
{:else}
  <Home {app} />
{/if}
<Toasts {app} />
