import * as THREE from 'three'
import type { Vehicle } from './Vehicle'

const POOL_SIZE = 64
const _worldPos = new THREE.Vector3()

interface SmokeParticle {
  sprite: THREE.Sprite
  life: number
  maxLife: number
  velocity: THREE.Vector3
  initialScale: number
}

export class SmokeTrails {
  particles: SmokeParticle[] = []
  texture = new THREE.TextureLoader().load('/sprites/smoke.png')
  material = new THREE.SpriteMaterial({
    map: this.texture,
    transparent: true,
    depthWrite: false,
    opacity: 0,
    color: 0x5E5F6B,
  })
  emitIndex = 0

  constructor(scene: THREE.Object3D) {
    for (let index = 0; index < POOL_SIZE; index++) {
      const sprite = new THREE.Sprite(this.material.clone())
      sprite.visible = false
      sprite.scale.setScalar(0.25)
      scene.add(sprite)

      this.particles.push({
        sprite,
        life: 0,
        maxLife: 0,
        velocity: new THREE.Vector3(),
        initialScale: 0,
      })
    }
  }

  update(dt: number, vehicle: Vehicle): void {
    const shouldEmit = vehicle.driftIntensity > 0.25

    if (shouldEmit) {
      if (vehicle.wheelBL) this.emitAtWheel(vehicle.wheelBL, vehicle)
      if (vehicle.wheelBR) this.emitAtWheel(vehicle.wheelBR, vehicle)
    }

    for (const particle of this.particles) {
      if (particle.life <= 0) {
        continue
      }

      particle.life -= dt

      if (particle.life <= 0) {
        particle.sprite.visible = false
        continue
      }

      const t = 1 - (particle.life / particle.maxLife)
      const damping = Math.max(0, 1 - dt)
      particle.velocity.multiplyScalar(damping)
      particle.sprite.position.addScaledVector(particle.velocity, dt)
      ;(particle.sprite.material as THREE.SpriteMaterial).opacity = (1 - t) * 0.5

      let scaleFactor: number
      if (t < 0.5) {
        scaleFactor = 0.5 + t * 1.0
      }
      else {
        scaleFactor = 1.0 - (t - 0.5) * 1.6
      }

      particle.sprite.scale.setScalar(particle.initialScale * scaleFactor)
    }
  }

  emitAtWheel(wheel: THREE.Object3D, vehicle: Vehicle): void {
    const particle = this.particles[this.emitIndex]
    if (!particle) {
      return
    }

    this.emitIndex = (this.emitIndex + 1) % POOL_SIZE

    wheel.getWorldPosition(_worldPos)
    _worldPos.y = vehicle.container.position.y + 0.05

    particle.sprite.position.copy(_worldPos)
    particle.sprite.visible = true
    ;(particle.sprite.material as THREE.SpriteMaterial).opacity = 0
    particle.initialScale = 0.25 + Math.random() * 0.25
    particle.sprite.scale.setScalar(particle.initialScale * 0.5)
    particle.velocity.set(
      (Math.random() - 0.5) * 0.2,
      Math.random() * 0.1,
      (Math.random() - 0.5) * 0.2,
    )
    particle.maxLife = 0.5
    particle.life = particle.maxLife
  }

  dispose(): void {
    for (const particle of this.particles) {
      particle.sprite.material.dispose()
    }

    this.material.dispose()
    this.texture.dispose()
  }
}
