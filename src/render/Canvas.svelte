<script lang="ts">
  // Interactive viewport around <Diagram>: drag to pan, pinch / ctrl+wheel /
  // +/- to zoom, tap to select. Re-fits when `fitKey` changes (e.g. a new document).
  import type { LayoutResult } from '../layout/types'
  import type { Genogram } from '../model/types'
  import Diagram from './Diagram.svelte'
  import { selectionFromElement, type Selection } from './selection'
  import { fit, pan, zoomAt, type Viewport } from './viewport'

  interface Props {
    g: Genogram
    res: LayoutResult
    selected?: Selection | null
    onselect?: (s: Selection | null) => void
    fitKey?: unknown
    /** Show the floating zoom buttons. */
    controls?: boolean
  }
  let { g, res, selected = null, onselect, fitKey, controls = true }: Props = $props()

  let svg: SVGSVGElement
  let width = $state(0)
  let height = $state(0)
  let vp = $state<Viewport>({ x: 0, y: 0, k: 1 })

  export function fitToScreen() {
    if (width && height) vp = fit(res.bounds, width, height)
  }

  export function zoomBy(factor: number) {
    vp = zoomAt(vp, factor, width / 2, height / 2)
  }

  // Fit on first size and whenever fitKey changes.
  let fittedFor: unknown = Symbol('none')
  $effect(() => {
    if (width && height && fittedFor !== fitKey) {
      fittedFor = fitKey
      fitToScreen()
    }
  })

  // ── pointer gestures ──────────────────────────────────────────────────────
  const TAP_SLOP = 6
  const pointers = new Map<number, { x: number; y: number }>()
  let downAt: { x: number; y: number } | null = null
  let moved = false
  let pinchDist = 0

  function local(e: PointerEvent | WheelEvent) {
    const r = svg.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return
    svg.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, local(e))
    if (pointers.size === 1) {
      downAt = local(e)
      moved = false
    } else if (pointers.size === 2) {
      moved = true // a pinch is never a tap
      const [a, b] = [...pointers.values()]
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
    }
  }

  function onpointermove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId)
    if (!prev) return
    const p = local(e)
    pointers.set(e.pointerId, p)

    if (pointers.size === 1) {
      if (downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) > TAP_SLOP) moved = true
      if (moved) vp = pan(vp, p.x - prev.x, p.y - prev.y)
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      // Pan by the midpoint's movement (half of this pointer's delta), then zoom about it.
      let next = pan(vp, (p.x - prev.x) / 2, (p.y - prev.y) / 2)
      if (pinchDist > 0) next = zoomAt(next, dist / pinchDist, mid.x, mid.y)
      pinchDist = dist
      vp = next
    }
  }

  function onpointerup(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return
    if (pointers.size === 0) {
      if (!moved) {
        const target = document.elementFromPoint(e.clientX, e.clientY)
        onselect?.(selectionFromElement(target))
      }
      downAt = null
    } else if (pointers.size === 1) {
      pinchDist = 0
    }
  }

  // Wheel must be non-passive to stop the page from scrolling/zooming.
  $effect(() => {
    const onwheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = local(e)
      if (e.ctrlKey || e.metaKey) {
        vp = zoomAt(vp, Math.exp(-e.deltaY * 0.01), p.x, p.y) // trackpad pinch / ctrl+wheel
      } else {
        vp = pan(vp, -e.deltaX, -e.deltaY)
      }
    }
    svg.addEventListener('wheel', onwheel, { passive: false })
    return () => svg.removeEventListener('wheel', onwheel)
  })

  function onkeydown(e: KeyboardEvent) {
    const step = 60
    switch (e.key) {
      case '+':
      case '=':
        zoomBy(1.25)
        break
      case '-':
        zoomBy(0.8)
        break
      case '0':
        fitToScreen()
        break
      case 'ArrowLeft':
        vp = pan(vp, step, 0)
        break
      case 'ArrowRight':
        vp = pan(vp, -step, 0)
        break
      case 'ArrowUp':
        vp = pan(vp, 0, step)
        break
      case 'ArrowDown':
        vp = pan(vp, 0, -step)
        break
      case 'Enter':
      case ' ': {
        const s = selectionFromElement(document.activeElement)
        if (!s) return
        onselect?.(s)
        break
      }
      case 'Escape':
        onselect?.(null)
        break
      default:
        return
    }
    e.preventDefault()
  }
</script>

<div class="canvas" bind:clientWidth={width} bind:clientHeight={height}>
  <!-- Custom widget: pointer gestures plus keyboard pan/zoom/select, so it is focusable and handles events. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <svg
    bind:this={svg}
    role="application"
    aria-label="Genogram diagram. Drag to move, pinch or plus/minus to zoom, 0 to fit. Tab to each person, Enter to select."
    tabindex="0"
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onkeydown}
  >
    <g transform="translate({vp.x} {vp.y}) scale({vp.k})">
      <Diagram {g} {res} {selected} />
    </g>
  </svg>
  {#if controls}
    <div class="controls" role="group" aria-label="Zoom">
      <button type="button" onclick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
      <button type="button" onclick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
      <button type="button" onclick={fitToScreen} aria-label="Fit to screen">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .canvas {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--paper);
  }

  svg[role='application'] {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    font-family: var(--sans);
  }

  .controls {
    position: absolute;
    right: max(12px, env(safe-area-inset-right));
    bottom: 12px;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
  }

  .controls button {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 0;
    background: none;
    color: var(--text);
    font: 500 20px/1 var(--sans);
    cursor: pointer;
  }

  .controls button + button {
    border-top: 1px solid var(--border);
  }

  .controls button:active {
    background: var(--select-fill);
  }

  svg:focus-visible {
    outline: 2px solid var(--select);
    outline-offset: -2px;
  }
</style>
