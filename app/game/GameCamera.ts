import { Camera, MathUtils, PerspectiveCamera, Vector3 } from 'three'
import type { Vehicle } from './Vehicle'

export type CameraMode = 'chase' | 'driver'

export class GameCamera {
  camera: Camera
  mode: CameraMode = 'chase'
  chaseOffset = new Vector3(9.27, 9.18, 9.27)
  driverOffset = new Vector3(0.14, 0.9, 0.86)
  driverLookAhead = new Vector3(0.14, 0.72, 6.8)
  targetPosition = new Vector3()
  desiredPosition = new Vector3()
  desiredLookAt = new Vector3()
  forward = new Vector3()

  constructor(camera: Camera) {
    this.camera = camera

    if (this.camera instanceof PerspectiveCamera) {
      this.camera.fov = 40
      this.camera.near = 0.1
      this.camera.far = 80
      this.camera.updateProjectionMatrix()
    }

    this.camera.position.copy(this.chaseOffset)
    this.camera.lookAt(0, 0, 0)
  }

  setMode(mode: CameraMode): void {
    this.mode = mode
  }

  update(dt: number, vehicle: Vehicle): void {
    if (this.mode === 'driver') {
      this.updateDriverView(dt, vehicle)
      return
    }

    this.updateChaseView(dt, vehicle)
  }

  private updateChaseView(dt: number, vehicle: Vehicle): void {
    this.targetPosition.lerp(vehicle.spherePos, dt * 4)
    this.desiredPosition.copy(this.targetPosition).add(this.chaseOffset)
    this.camera.position.lerp(this.desiredPosition, 1 - Math.exp(-5 * dt))
    this.camera.lookAt(this.targetPosition)
    this.updatePerspective(dt, 40, 0.1)
  }

  private updateDriverView(dt: number, vehicle: Vehicle): void {
    const anchor = vehicle.bodyNode ?? vehicle.container

    this.desiredPosition.copy(this.driverOffset)
    anchor.localToWorld(this.desiredPosition)

    this.desiredLookAt.copy(this.driverLookAhead)
    anchor.localToWorld(this.desiredLookAt)

    this.camera.position.copy(this.desiredPosition)
    this.camera.lookAt(this.desiredLookAt)
    this.updatePerspective(dt, 74, 0.005)
  }

  private updatePerspective(dt: number, targetFov: number, near: number): void {
    if (!(this.camera instanceof PerspectiveCamera)) {
      return
    }

    this.camera.fov = MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-8 * dt))
    this.camera.near = near
    this.camera.updateProjectionMatrix()
  }
}
