import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from 'three'

function addMesh(
  root: Group,
  geometry: BoxGeometry | CylinderGeometry | TorusGeometry,
  material: MeshStandardMaterial,
  options: {
    position: [number, number, number]
    rotation?: [number, number, number]
    scale?: [number, number, number]
  },
) {
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...options.position)

  if (options.rotation) {
    mesh.rotation.set(...options.rotation)
  }

  if (options.scale) {
    mesh.scale.set(...options.scale)
  }

  root.add(mesh)
  return mesh
}

export function createCockpitRig(): Group {
  const root = new Group()
  const cabin = new Group()
  cabin.position.set(0, -0.08, 0.64)
  root.add(cabin)

  const trim = new MeshStandardMaterial({
    color: 0x12161a,
    roughness: 0.95,
    metalness: 0.05,
  })

  const softTrim = new MeshStandardMaterial({
    color: 0x1b2228,
    roughness: 1,
    metalness: 0,
  })

  const hood = new MeshStandardMaterial({
    color: 0xd2a52d,
    roughness: 0.86,
    metalness: 0.08,
  })

  const glassShadow = new MeshStandardMaterial({
    color: 0x0c1014,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0.28,
  })

  addMesh(cabin, new BoxGeometry(1.42, 0.24, 0.74), trim, {
    position: [0, -0.44, -0.78],
  })

  addMesh(cabin, new BoxGeometry(0.58, 0.16, 0.24), softTrim, {
    position: [0.02, -0.26, -0.62],
  })

  addMesh(cabin, new BoxGeometry(1.26, 0.08, 1.55), hood, {
    position: [0, -0.62, -2.05],
    rotation: [-0.08, 0, 0],
  })

  addMesh(cabin, new BoxGeometry(1.06, 0.12, 0.38), hood, {
    position: [0, -0.56, -1.34],
    rotation: [-0.04, 0, 0],
  })

  addMesh(cabin, new BoxGeometry(0.08, 1.02, 0.08), trim, {
    position: [-0.62, 0.04, -0.72],
    rotation: [MathUtils.degToRad(12), 0, MathUtils.degToRad(-6)],
  })

  addMesh(cabin, new BoxGeometry(0.08, 1.02, 0.08), trim, {
    position: [0.62, 0.04, -0.72],
    rotation: [MathUtils.degToRad(12), 0, MathUtils.degToRad(6)],
  })

  addMesh(cabin, new BoxGeometry(1.42, 0.08, 0.12), trim, {
    position: [0, 0.52, -0.78],
  })

  addMesh(cabin, new BoxGeometry(1.16, 0.02, 0.52), glassShadow, {
    position: [0, 0.06, -1.02],
    rotation: [MathUtils.degToRad(-18), 0, 0],
  })

  addMesh(cabin, new CylinderGeometry(0.038, 0.05, 0.34, 18), trim, {
    position: [0.18, -0.34, -0.56],
    rotation: [Math.PI / 2.9, 0, 0],
  })

  addMesh(cabin, new TorusGeometry(0.17, 0.022, 12, 32), softTrim, {
    position: [0.18, -0.22, -0.48],
    rotation: [Math.PI / 2.25, 0, 0],
  })

  root.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = false
      child.receiveShadow = false
      child.frustumCulled = false
    }
  })

  return root
}
