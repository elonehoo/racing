import * as THREE from 'three'
import type { RoomPlayerSnapshot } from './multiplayer'

const _targetQuat = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a

  while (diff > Math.PI) {
    diff -= Math.PI * 2
  }

  while (diff < -Math.PI) {
    diff += Math.PI * 2
  }

  return a + diff * t
}

export class RemoteVehicle {
  container = new THREE.Group()
  bodyNode: THREE.Object3D | null = null
  wheels: THREE.Object3D[] = []
  wheelFL: THREE.Object3D | null = null
  wheelFR: THREE.Object3D | null = null
  targetPosition = new THREE.Vector3()
  targetRotationY = 0
  speed = 0
  targetSpeed = 0
  steering = 0
  targetSteering = 0
  drift = 0
  targetDrift = 0
  initialized = false

  constructor(model: THREE.Object3D) {
    const vehicleModel = model.clone()
    this.container.add(vehicleModel)

    vehicleModel.traverse((child) => {
      const name = child.name.toLowerCase()

      if (name === 'body') {
        child.rotation.order = 'YXZ'
        this.bodyNode = child
      }
      else if (name.includes('wheel')) {
        child.rotation.order = 'YXZ'
        this.wheels.push(child)

        if (name.includes('front') && name.includes('left')) this.wheelFL = child
        if (name.includes('front') && name.includes('right')) this.wheelFR = child
      }

      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }

  applySnapshot(snapshot: RoomPlayerSnapshot): void {
    this.targetPosition.set(snapshot.x, snapshot.y - 0.5, snapshot.z)
    this.targetRotationY = snapshot.rotationY
    this.targetSpeed = snapshot.speed
    this.targetSteering = snapshot.steering
    this.targetDrift = snapshot.drift

    if (this.initialized) {
      return
    }

    this.container.position.copy(this.targetPosition)
    this.container.rotation.set(0, this.targetRotationY, 0)
    this.speed = this.targetSpeed
    this.steering = this.targetSteering
    this.drift = this.targetDrift
    this.initialized = true
  }

  update(dt: number): void {
    if (!this.initialized) {
      return
    }

    const blend = 1 - Math.exp(-8 * dt)
    this.container.position.lerp(this.targetPosition, blend)
    _targetQuat.setFromAxisAngle(_up, this.targetRotationY)
    this.container.quaternion.slerp(_targetQuat, blend)

    this.speed = THREE.MathUtils.lerp(this.speed, this.targetSpeed, dt * 10)
    this.steering = THREE.MathUtils.lerp(this.steering, this.targetSteering, dt * 10)
    this.drift = THREE.MathUtils.lerp(this.drift, this.targetDrift, dt * 8)

    for (const wheel of this.wheels) {
      wheel.rotation.x += this.speed
    }

    if (this.wheelFL) {
      this.wheelFL.rotation.y = lerpAngle(this.wheelFL.rotation.y, -this.steering / 1.5, dt * 10)
    }

    if (this.wheelFR) {
      this.wheelFR.rotation.y = lerpAngle(this.wheelFR.rotation.y, -this.steering / 1.5, dt * 10)
    }

    if (this.bodyNode) {
      this.bodyNode.rotation.x = lerpAngle(
        this.bodyNode.rotation.x,
        -(this.drift / 8),
        dt * 8,
      )
      this.bodyNode.rotation.z = lerpAngle(
        this.bodyNode.rotation.z,
        -(this.steering / 5) * this.speed,
        dt * 6,
      )
      this.bodyNode.position.y = THREE.MathUtils.lerp(this.bodyNode.position.y, 0.3, dt * 5)
    }
  }
}
