// Pan/zoom math. A viewport maps diagram coords to screen: screen = diagram * k + (x, y).

export interface Viewport {
  x: number
  y: number
  k: number
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 4

const clampK = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k))

/** Fit bounds inside a w×h screen with padding, centered. Never zooms in past `maxK`. */
export function fit(b: Bounds, w: number, h: number, pad = 24, maxK = 1.5): Viewport {
  if (b.width <= 0 || b.height <= 0 || w <= 0 || h <= 0) return { x: w / 2 - b.x, y: h / 2 - b.y, k: 1 }
  const k = clampK(Math.min((w - 2 * pad) / b.width, (h - 2 * pad) / b.height, maxK))
  return {
    k,
    x: (w - b.width * k) / 2 - b.x * k,
    y: (h - b.height * k) / 2 - b.y * k,
  }
}

/** Zoom by `factor` keeping screen point (px, py) fixed. */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const k = clampK(v.k * factor)
  const f = k / v.k
  return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f }
}

export function pan(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy }
}

/** Screen point → diagram point. */
export function toDiagram(v: Viewport, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k }
}

/** Center the screen on a diagram point (e.g. a newly added person), keeping zoom. */
export function centerOn(v: Viewport, x: number, y: number, w: number, h: number): Viewport {
  return { k: v.k, x: w / 2 - x * v.k, y: h / 2 - y * v.k }
}
