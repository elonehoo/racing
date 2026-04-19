import * as THREE from 'three'

function remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin))
}

const NUM_GEARS = 3
const UPSHIFT_RPM = 0.92
const DOWNSHIFT_RPM = 0.35
const SHIFT_COOLDOWN = 0.35
const PITCH_LOW = [1.05, 1.25, 1.4] as const
const PITCH_HIGH = [3.5, 2.9, 2.3] as const
const FILTER_CUTOFF_MIN = 700
const FILTER_CUTOFF_MAX = 7000

export class GameAudio {
  listener: THREE.AudioListener | null = null
  engineSound: THREE.Audio | null = null
  engineLayerSound: THREE.Audio | null = null
  engineFilter: BiquadFilterNode | null = null
  skidSound: THREE.Audio | null = null
  impactBuffer: AudioBuffer | null = null
  impactPool: THREE.Audio[] = []
  impactIndex = 0
  ready = false
  unlocked = false
  rpm = 0
  gear = 0
  shiftCooldown = 0
  camera: THREE.Camera | null = null
  unlock: () => void

  constructor() {
    this.unlock = this.unlockAudio.bind(this)
  }

  init(camera: THREE.Camera): void {
    this.camera = camera

    const listener = new THREE.AudioListener()
    this.listener = listener
    camera.add(listener)

    const loader = new THREE.AudioLoader()

    const engineSound = new THREE.Audio(listener)
    const engineLayerSound = new THREE.Audio(listener)
    const skidSound = new THREE.Audio(listener)

    this.engineSound = engineSound
    this.engineLayerSound = engineLayerSound
    this.skidSound = skidSound

    const engineFilter = listener.context.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.Q.value = 0.7
    engineFilter.frequency.value = FILTER_CUTOFF_MIN
    engineSound.setFilter(engineFilter)
    this.engineFilter = engineFilter

    loader.load('/audio/engine.ogg', (buffer) => {
      engineSound.setBuffer(buffer)
      engineSound.setLoop(true)
      engineSound.setVolume(0)

      engineLayerSound.setBuffer(buffer)
      engineLayerSound.setLoop(true)
      engineLayerSound.setVolume(0)
      this.checkReady()
    })

    loader.load('/audio/skid.ogg', (buffer) => {
      skidSound.setBuffer(buffer)
      skidSound.setLoop(true)
      skidSound.setVolume(0)
      this.checkReady()
    })

    loader.load('/audio/impact.ogg', (buffer) => {
      this.impactBuffer = buffer

      for (let index = 0; index < 3; index++) {
        const sound = new THREE.Audio(listener)
        sound.setBuffer(buffer)
        this.impactPool.push(sound)
      }
    })

    window.addEventListener('keydown', this.unlock)
    window.addEventListener('click', this.unlock)
    window.addEventListener('touchstart', this.unlock)
  }

  unlockAudio(): void {
    if (this.unlocked || !this.listener) {
      return
    }

    this.unlocked = true
    const ctx = this.listener.context

    if (ctx.state === 'suspended') {
      void ctx.resume()
    }

    this.startSounds()
    window.removeEventListener('keydown', this.unlock)
    window.removeEventListener('click', this.unlock)
    window.removeEventListener('touchstart', this.unlock)
  }

  checkReady(): void {
    if (this.engineSound?.buffer && this.skidSound?.buffer) {
      this.ready = true

      if (this.unlocked) {
        this.startSounds()
      }
    }
  }

  startSounds(): void {
    if (!this.ready || !this.engineSound || !this.engineLayerSound || !this.skidSound) {
      return
    }

    if (!this.engineSound.isPlaying) this.engineSound.play()
    if (!this.engineLayerSound.isPlaying) this.engineLayerSound.play()
    if (!this.skidSound.isPlaying) this.skidSound.play()
  }

  update(dt: number, speed: number, throttle: number, driftIntensity: number): void {
    if (
      !this.ready
      || !this.listener
      || !this.engineSound
      || !this.engineLayerSound
      || !this.engineFilter
      || !this.skidSound
    ) {
      return
    }

    const absSpeed = THREE.MathUtils.clamp(Math.abs(speed), 0, 1)
    const load = THREE.MathUtils.clamp(Math.max(0, throttle), 0, 1)
    const gearWindow = 1 / NUM_GEARS
    const gearStart = this.gear * gearWindow
    const inGear = THREE.MathUtils.clamp((absSpeed - gearStart) / gearWindow, 0, 1)

    let targetRpm = inGear * 0.85 + load * 0.2
    targetRpm = THREE.MathUtils.clamp(targetRpm, 0, 1.05)

    const riseRate = 4
    const fallRate = 4
    const rate = targetRpm > this.rpm ? riseRate * (0.3 + load) : fallRate
    this.rpm = THREE.MathUtils.lerp(this.rpm, targetRpm, Math.min(1, dt * rate))

    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt)

    if (this.shiftCooldown === 0) {
      if (this.rpm > UPSHIFT_RPM && this.gear < NUM_GEARS - 1 && load > 0.1) {
        this.gear++
        this.rpm = 0.45
        this.shiftCooldown = SHIFT_COOLDOWN
      }
      else if (this.rpm < DOWNSHIFT_RPM && this.gear > 0) {
        this.gear--
        this.rpm = 0.78
        this.shiftCooldown = SHIFT_COOLDOWN
      }
    }

    const targetVol = remap(absSpeed + load * 0.5, 0, 1.5, 0.02, 0.25)
    const currentVol = this.engineSound.getVolume()
    const newVol = THREE.MathUtils.lerp(currentVol, targetVol, dt * 5)
    this.engineSound.setVolume(newVol)
    this.engineLayerSound.setVolume(newVol * 0.4)

    const pitch = THREE.MathUtils.lerp(PITCH_LOW[this.gear]!, PITCH_HIGH[this.gear]!, this.rpm)
    this.engineSound.setPlaybackRate(pitch)
    this.engineLayerSound.setPlaybackRate(pitch * 0.5)

    const targetCutoff = remap(load, 0, 1, FILTER_CUTOFF_MIN, FILTER_CUTOFF_MAX)
    this.engineFilter.frequency.setTargetAtTime(
      targetCutoff,
      this.listener.context.currentTime,
      0.05,
    )

    let skidVol = 0
    if (driftIntensity > 0.5) {
      skidVol = remap(
        THREE.MathUtils.clamp(driftIntensity, 0.5, 2.5),
        0.5,
        2.5,
        0.05,
        0.3,
      )
    }

    const curSkidVol = this.skidSound.getVolume()
    this.skidSound.setVolume(THREE.MathUtils.lerp(curSkidVol, skidVol, dt * 10))

    const skidPitch = THREE.MathUtils.clamp(Math.abs(speed), 1, 3)
    const curSkidPitch = this.skidSound.getPlaybackRate()
    this.skidSound.setPlaybackRate(THREE.MathUtils.lerp(curSkidPitch, skidPitch, 0.1))
  }

  playImpact(impactVelocity: number): void {
    if (!this.unlocked || this.impactPool.length === 0) {
      return
    }

    const sound = this.impactPool[this.impactIndex]
    if (!sound) {
      return
    }

    this.impactIndex = (this.impactIndex + 1) % this.impactPool.length

    if (sound.isPlaying) {
      sound.stop()
    }

    const volume = THREE.MathUtils.clamp(remap(impactVelocity, 0, 6, 0.01, 1.0), 0.01, 1.0)
    sound.setVolume(volume)
    sound.play()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.unlock)
    window.removeEventListener('click', this.unlock)
    window.removeEventListener('touchstart', this.unlock)

    for (const sound of [this.engineSound, this.engineLayerSound, this.skidSound, ...this.impactPool]) {
      if (sound?.isPlaying) {
        sound.stop()
      }
    }

    if (this.camera && this.listener) {
      this.camera.remove(this.listener)
    }
  }
}
