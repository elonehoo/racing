export interface ControlsOptions {
  root?: HTMLElement | null
}

export interface ControlsInput {
  x: number
  z: number
  touchActive: boolean
  hasGamepad: boolean
}

interface TouchUI {
  container: HTMLDivElement
  steerZone: HTMLDivElement
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  endSteer: (event: PointerEvent) => void
}

export class Controls {
  keys: Record<string, boolean> = {}
  x = 0
  z = 0
  touchActive = false
  touchDirX = 0
  touchDirY = 0
  steerPointerId: number | null = null
  steerStartX = 0
  steerStartY = 0
  root: HTMLElement | null
  ui: TouchUI | null = null
  hasGamepad = false
  onKeyDown: (event: KeyboardEvent) => void
  onKeyUp: (event: KeyboardEvent) => void

  constructor(options: ControlsOptions = {}) {
    this.root = options.root ?? document.body

    this.onKeyDown = (event) => {
      this.keys[event.code] = true
    }
    this.onKeyUp = (event) => {
      this.keys[event.code] = false
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)

    this.setupTouchUI()
  }

  setupTouchUI(): void {
    if (!('ontouchstart' in window) || !this.root) {
      return
    }

    const container = document.createElement('div')
    container.className = 'touch-controls'

    const steerZone = document.createElement('div')
    steerZone.className = 'steer-zone'

    const base = document.createElement('div')
    base.className = 'steer-base'

    const knob = document.createElement('div')
    knob.className = 'steer-knob'

    base.appendChild(knob)
    steerZone.appendChild(base)
    container.appendChild(steerZone)
    this.root.appendChild(container)

    const steerRange = 40

    const endSteer = (event: PointerEvent): void => {
      if (event.pointerId !== this.steerPointerId) {
        return
      }

      this.steerPointerId = null
      this.touchActive = false
      this.touchDirX = 0
      this.touchDirY = 0
      knob.style.transform = ''
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (this.steerPointerId !== null) {
        return
      }

      steerZone.setPointerCapture(event.pointerId)
      this.steerPointerId = event.pointerId
      this.steerStartX = event.clientX
      this.steerStartY = event.clientY
      this.touchActive = true
      this.touchDirX = 0
      this.touchDirY = 0
    }

    const onPointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== this.steerPointerId) {
        return
      }

      let dx = (event.clientX - this.steerStartX) / steerRange
      let dy = (event.clientY - this.steerStartY) / steerRange
      const mag = Math.sqrt(dx * dx + dy * dy)

      if (mag > 1) {
        dx /= mag
        dy /= mag
      }

      this.touchDirX = dx
      this.touchDirY = dy
      knob.style.transform = `translate(${this.touchDirX * 60}px, ${this.touchDirY * 60}px)`
    }

    steerZone.addEventListener('pointerdown', onPointerDown)
    steerZone.addEventListener('pointermove', onPointerMove)
    steerZone.addEventListener('pointerup', endSteer)
    steerZone.addEventListener('pointercancel', endSteer)

    this.ui = {
      container,
      steerZone,
      onPointerDown,
      onPointerMove,
      endSteer,
    }
  }

  update(): ControlsInput {
    let x = 0
    let z = 0

    if (this.keys.KeyA || this.keys.ArrowLeft) x -= 1
    if (this.keys.KeyD || this.keys.ArrowRight) x += 1
    if (this.keys.KeyW || this.keys.ArrowUp) z += 1
    if (this.keys.KeyS || this.keys.ArrowDown) z -= 1

    this.hasGamepad = false

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
    for (const gp of gamepads) {
      if (!gp) {
        continue
      }

      this.hasGamepad = true
      const stickX = gp.axes[0] ?? 0
      if (Math.abs(stickX) > 0.15) x = stickX

      const rt = gp.buttons[7]?.value ?? 0
      const lt = gp.buttons[6]?.value ?? 0
      if (rt > 0.1 || lt > 0.1) z = rt - lt
      break
    }

    if (this.touchActive) {
      const jx = this.touchDirX
      const jy = this.touchDirY
      const mag = Math.sqrt(jx * jx + jy * jy)

      if (mag > 0.15) {
        x = ((jx + jy) * Math.SQRT1_2) / mag
        z = ((-jx + jy) * Math.SQRT1_2) / mag
      }
    }

    this.x = x
    this.z = z

    return { x, z, touchActive: this.touchActive, hasGamepad: this.hasGamepad }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)

    if (this.ui) {
      const { steerZone, onPointerDown, onPointerMove, endSteer, container } = this.ui
      steerZone.removeEventListener('pointerdown', onPointerDown)
      steerZone.removeEventListener('pointermove', onPointerMove)
      steerZone.removeEventListener('pointerup', endSteer)
      steerZone.removeEventListener('pointercancel', endSteer)
      container.remove()
      this.ui = null
    }
  }
}
