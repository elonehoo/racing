import { Camera, PerspectiveCamera, Vector3 } from 'three'

export class GameCamera {
  camera: Camera
  offset = new Vector3(9.27, 9.18, 9.27)
  targetPosition = new Vector3()

  constructor(camera: Camera) {
    this.camera = camera

    if (this.camera instanceof PerspectiveCamera) {
      this.camera.fov = 40
      this.camera.near = 0.1
      this.camera.far = 80
      this.camera.updateProjectionMatrix()
    }

    this.camera.position.copy(this.offset)
    this.camera.lookAt(0, 0, 0)
  }

  update(dt: number, target: Vector3): void {
    this.targetPosition.lerp(target, dt * 4)
    this.camera.position.copy(this.targetPosition).add(this.offset)
    this.camera.lookAt(this.targetPosition)
  }
}
