import * as THREE from 'three'
import { rigidBody, type RigidBody } from 'crashcat'
import type { ControlsInput } from './Controls'
import type { RacingWorld } from './Physics'

const _tmpVec = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _right = new THREE.Vector3()
const _zAxis = new THREE.Vector3()
const _newZ = new THREE.Vector3()
const _mat4 = new THREE.Matrix4()
const _quat = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)

const LINEAR_DAMP = 0.1
export const MAX_SPEED = 1.5

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

export class Vehicle {
  linearSpeed = 0
  angularSpeed = 0
  acceleration = 0
  spherePos = new THREE.Vector3(3.5, 0.5, 5)
  sphereVel = new THREE.Vector3()
  rigidBody: RigidBody | null = null
  physicsWorld: RacingWorld | null = null
  modelVelocity = new THREE.Vector3()
  prevModelPos = new THREE.Vector3(3.5, 0, 5)
  container = new THREE.Group()
  bodyNode: THREE.Object3D | null = null
  wheels: THREE.Object3D[] = []
  wheelFL: THREE.Object3D | null = null
  wheelFR: THREE.Object3D | null = null
  wheelBL: THREE.Object3D | null = null
  wheelBR: THREE.Object3D | null = null
  inputX = 0
  inputZ = 0
  driftIntensity = 0

  init(model: THREE.Object3D): THREE.Group {
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
        if (name.includes('back') && name.includes('left')) this.wheelBL = child
        if (name.includes('back') && name.includes('right')) this.wheelBR = child
      }

      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    return this.container
  }

  update(dt: number, controlsInput: ControlsInput): void {
    this.inputX = controlsInput.x
    this.inputZ = controlsInput.z

    if (controlsInput.touchActive && (this.inputX !== 0 || this.inputZ !== 0)) {
      const targetAngle = Math.atan2(this.inputX, this.inputZ)
      _quat.setFromAxisAngle(_up, targetAngle)
      this.container.quaternion.slerp(_quat, 1 - Math.exp(-3 * dt))

      _forward.set(0, 0, 1).applyQuaternion(this.container.quaternion)
      const cross = _forward.x * this.inputZ - _forward.z * this.inputX
      this.inputX = -cross * 2
      this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, MAX_SPEED, dt * 1.5)
    }
    else {
      let direction = Math.sign(this.linearSpeed)
      if (direction === 0) {
        direction = Math.abs(this.inputZ) > 0.1 ? Math.sign(this.inputZ) : 1
      }

      const steeringGrip = THREE.MathUtils.clamp(Math.abs(this.linearSpeed), 0.2, 1.0)
      const targetAngular = -this.inputX * steeringGrip * 4 * direction
      this.angularSpeed = THREE.MathUtils.lerp(this.angularSpeed, targetAngular, dt * 4)
      this.container.rotateY(this.angularSpeed * dt)

      const targetSpeed = this.inputZ

      if (targetSpeed < 0 && this.linearSpeed > 0.01) {
        this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, 0.0, dt * 8)
      }
      else if (targetSpeed < 0) {
        this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, targetSpeed / 2, dt * 2)
      }
      else {
        this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, targetSpeed * MAX_SPEED, dt * 1.5)
      }
    }

    _tmpVec.set(0, 1, 0).applyQuaternion(this.container.quaternion)
    if (_tmpVec.y > 0.5) {
      const targetQuat = this.alignWithY(this.container.quaternion, _up)
      this.container.quaternion.slerp(targetQuat, 0.2)
    }

    this.linearSpeed *= Math.max(0, 1 - LINEAR_DAMP * dt)

    const body = this.rigidBody
    const world = this.physicsWorld

    if (body && world) {
      _forward.set(0, 0, 1).applyQuaternion(this.container.quaternion)
      _forward.y = 0
      _forward.normalize()

      _right.set(1, 0, 0).applyQuaternion(this.container.quaternion)
      _right.y = 0
      _right.normalize()

      const angvel = body.motionProperties.angularVelocity
      const drive = this.linearSpeed * 100 * dt

      rigidBody.setAngularVelocity(world, body, [
        angvel[0] + _right.x * drive,
        angvel[1],
        angvel[2] + _right.z * drive,
      ])

      const pos = body.position
      this.spherePos.set(pos[0], pos[1], pos[2])

      const vel = body.motionProperties.linearVelocity
      this.sphereVel.set(vel[0], vel[1], vel[2])
    }

    this.acceleration = THREE.MathUtils.lerp(
      this.acceleration,
      this.linearSpeed + (0.25 * this.linearSpeed * Math.abs(this.linearSpeed)),
      dt,
    )

    if (this.spherePos.y < -10) {
      if (body && world) {
        rigidBody.setPosition(world, body, [3.5, 0.5, 5], false)
        rigidBody.setLinearVelocity(world, body, [0, 0, 0])
        rigidBody.setAngularVelocity(world, body, [0, 0, 0])
      }

      this.spherePos.set(3.5, 0.5, 5)
      this.sphereVel.set(0, 0, 0)
      this.linearSpeed = 0
      this.angularSpeed = 0
      this.acceleration = 0
      this.container.rotation.set(0, 0, 0)
      this.container.quaternion.identity()
    }

    this.container.position.set(
      this.spherePos.x,
      this.spherePos.y - 0.5,
      this.spherePos.z,
    )

    if (dt > 0) {
      this.modelVelocity.subVectors(this.container.position, this.prevModelPos).divideScalar(dt)
      this.prevModelPos.copy(this.container.position)
    }

    this.updateBody(dt)
    this.updateWheels(dt)

    this.driftIntensity = Math.abs(this.linearSpeed - this.acceleration)
      + (this.bodyNode ? Math.abs(this.bodyNode.rotation.z) * 2 : 0)
  }

  alignWithY(quaternion: THREE.Quaternion, newY: THREE.Vector3): THREE.Quaternion {
    _zAxis.set(0, 0, 1).applyQuaternion(quaternion)
    const xAxis = _tmpVec.crossVectors(_zAxis, newY).negate().normalize()
    _newZ.crossVectors(xAxis, newY).normalize()
    _mat4.makeBasis(xAxis, newY, _newZ)
    return _quat.setFromRotationMatrix(_mat4)
  }

  updateBody(dt: number): void {
    if (!this.bodyNode) {
      return
    }

    this.bodyNode.rotation.x = lerpAngle(
      this.bodyNode.rotation.x,
      -(this.linearSpeed - this.acceleration) / 6,
      dt * 10,
    )

    this.bodyNode.rotation.z = lerpAngle(
      this.bodyNode.rotation.z,
      -(this.inputX / 5) * this.linearSpeed,
      dt * 5,
    )

    this.bodyNode.position.y = THREE.MathUtils.lerp(this.bodyNode.position.y, 0.3, dt * 5)
  }

  updateWheels(dt: number): void {
    for (const wheel of this.wheels) {
      wheel.rotation.x += this.acceleration
    }

    if (this.wheelFL) {
      this.wheelFL.rotation.y = lerpAngle(this.wheelFL.rotation.y, -this.inputX / 1.5, dt * 10)
    }

    if (this.wheelFR) {
      this.wheelFR.rotation.y = lerpAngle(this.wheelFR.rotation.y, -this.inputX / 1.5, dt * 10)
    }
  }
}
