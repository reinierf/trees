import L from 'leaflet'
import type { Bbox, Tree } from '../types'
import { MAP_CENTER, MAP_ZOOM } from '../config'

interface Callbacks {
  onMoveEnd: (bounds: Bbox) => void
  onMarkerClick: (tree: Tree) => void
}

export class MapController {
  private map: L.Map | null = null
  private readonly callbacks: Callbacks

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks
  }

  init(el: HTMLDivElement): void {
    this.map = L.map(el, { center: MAP_CENTER, zoom: MAP_ZOOM })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map)

    this.map.on('moveend', () => {
      if (!this.map) return
      const b = this.map.getBounds()
      this.callbacks.onMoveEnd({
        nw: { lat: b.getNorth(), lon: b.getWest() },
        se: { lat: b.getSouth(), lon: b.getEast() },
      })
    })
  }

  setTrees(_trees: Tree[]): void {
    // Step 5
  }

  highlightSpecies(_species: string | null): void {
    // Step 6/8
  }

  destroy(): void {
    this.map?.remove()
    this.map = null
  }
}
