import * as THREE from 'three'

export type OrientKey = 0 | 10 | 16 | 22
export type TrackPieceType = 'track-straight' | 'track-corner' | 'track-bump' | 'track-finish'
export type DecorationType = 'decoration-empty' | 'decoration-forest' | 'decoration-tents'
export type VehicleModelName =
  | 'vehicle-truck-yellow'
  | 'vehicle-truck-green'
  | 'vehicle-truck-purple'
  | 'vehicle-truck-red'
export type ModelName = TrackPieceType | DecorationType | VehicleModelName
export type TrackCell = [gx: number, gz: number, type: TrackPieceType, orient: OrientKey]
type DecorationCell = [gx: number, gz: number, type: DecorationType, orient: OrientKey]
type NpcTruck = [model: VehicleModelName, x: number, y: number, z: number, rotDeg: number]

export interface SpawnInfo {
  position: [number, number, number]
  angle: number
}

export interface TrackBounds {
  centerX: number
  centerZ: number
  halfWidth: number
  halfDepth: number
}

export type LoadedModels = Record<ModelName, THREE.Group>
export type PartialModelMap = Partial<LoadedModels>

export const ORIENT_DEG: Record<OrientKey, number> = { 0: 0, 10: 180, 16: 90, 22: 270 }

export const CELL_RAW = 9.99
export const GRID_SCALE = 0.75

const _dummy = new THREE.Object3D()

export const TRACK_CELLS: TrackCell[] = [
  [-3, -3, 'track-corner', 16],
  [-2, -3, 'track-straight', 22],
  [-1, -3, 'track-straight', 22],
  [0, -3, 'track-corner', 0],
  [-3, -2, 'track-straight', 0],
  [0, -2, 'track-straight', 0],
  [-3, -1, 'track-corner', 10],
  [-2, -1, 'track-corner', 0],
  [0, -1, 'track-straight', 0],
  [-2, 0, 'track-straight', 10],
  [0, 0, 'track-finish', 0],
  [-2, 1, 'track-straight', 10],
  [0, 1, 'track-straight', 0],
  [-2, 2, 'track-corner', 10],
  [-1, 2, 'track-straight', 16],
  [0, 2, 'track-corner', 22],
]

const DECO_CELLS: DecorationCell[] = [
  [-4, -2, 'decoration-tents', 10],
  [-1, -4, 'decoration-tents', 22],
  [-1, 1, 'decoration-tents', 22],
  [-8, -9, 'decoration-forest', 0], [-7, -9, 'decoration-forest', 0],
  [-6, -9, 'decoration-forest', 0], [-5, -9, 'decoration-forest', 0],
  [-4, -9, 'decoration-forest', 0], [-3, -9, 'decoration-forest', 0],
  [-2, -9, 'decoration-forest', 0], [-1, -9, 'decoration-forest', 0],
  [0, -9, 'decoration-forest', 0], [1, -9, 'decoration-forest', 0],
  [2, -9, 'decoration-forest', 0],
  [-8, -8, 'decoration-forest', 0], [-7, -8, 'decoration-forest', 0],
  [-6, -8, 'decoration-forest', 0], [-5, -8, 'decoration-forest', 0],
  [-4, -8, 'decoration-forest', 0], [-3, -8, 'decoration-forest', 0],
  [-2, -8, 'decoration-forest', 0], [-1, -8, 'decoration-forest', 0],
  [0, -8, 'decoration-forest', 0], [1, -8, 'decoration-forest', 0],
  [2, -8, 'decoration-forest', 0],
  [-8, -7, 'decoration-forest', 0], [-7, -7, 'decoration-forest', 0],
  [-6, -7, 'decoration-forest', 0], [-5, -7, 'decoration-forest', 0],
  [-4, -7, 'decoration-forest', 0], [-3, -7, 'decoration-forest', 0],
  [-2, -7, 'decoration-forest', 0], [-1, -7, 'decoration-forest', 0],
  [0, -7, 'decoration-forest', 0], [1, -7, 'decoration-forest', 0],
  [2, -7, 'decoration-forest', 0],
  [-8, -6, 'decoration-forest', 0], [-7, -6, 'decoration-forest', 0],
  [-6, -6, 'decoration-forest', 0], [-5, -6, 'decoration-forest', 0],
  [-4, -6, 'decoration-forest', 0], [-3, -6, 'decoration-empty', 0],
  [-2, -6, 'decoration-empty', 0], [-1, -6, 'decoration-empty', 0],
  [0, -6, 'decoration-empty', 0], [1, -6, 'decoration-forest', 0],
  [2, -6, 'decoration-forest', 0],
  [-8, -5, 'decoration-forest', 0], [-7, -5, 'decoration-forest', 0],
  [-6, -5, 'decoration-forest', 0], [-5, -5, 'decoration-forest', 0],
  [-4, -5, 'decoration-empty', 0], [-3, -5, 'decoration-empty', 0],
  [-2, -5, 'decoration-empty', 0], [-1, -5, 'decoration-empty', 0],
  [0, -5, 'decoration-empty', 0], [1, -5, 'decoration-forest', 0],
  [2, -5, 'decoration-forest', 0],
  [-8, -4, 'decoration-forest', 0], [-7, -4, 'decoration-forest', 0],
  [-6, -4, 'decoration-forest', 0], [-5, -4, 'decoration-forest', 0],
  [-4, -4, 'decoration-empty', 0],
  [1, -4, 'decoration-forest', 0],
  [2, -4, 'decoration-forest', 0],
  [-8, -3, 'decoration-forest', 0], [-7, -3, 'decoration-forest', 0],
  [-6, -3, 'decoration-forest', 0], [-5, -3, 'decoration-forest', 0],
  [-4, -3, 'decoration-empty', 0],
  [1, -3, 'decoration-forest', 0],
  [2, -3, 'decoration-forest', 0],
  [-8, -2, 'decoration-forest', 0], [-7, -2, 'decoration-forest', 0],
  [-6, -2, 'decoration-forest', 0], [-5, -2, 'decoration-forest', 0],
  [1, -2, 'decoration-forest', 0],
  [2, -2, 'decoration-forest', 0],
  [-8, -1, 'decoration-forest', 0], [-7, -1, 'decoration-forest', 0],
  [-6, -1, 'decoration-forest', 0], [-5, -1, 'decoration-forest', 0],
  [-4, -1, 'decoration-empty', 0], [-1, -1, 'decoration-empty', 0],
  [1, -1, 'decoration-forest', 0],
  [2, -1, 'decoration-forest', 0],
  [-8, 0, 'decoration-forest', 0], [-7, 0, 'decoration-forest', 0],
  [-6, 0, 'decoration-forest', 0], [-5, 0, 'decoration-forest', 0],
  [-4, 0, 'decoration-empty', 0], [-3, 0, 'decoration-empty', 0],
  [-1, 0, 'decoration-empty', 0],
  [1, 0, 'decoration-forest', 0],
  [2, 0, 'decoration-forest', 0],
  [-8, 1, 'decoration-forest', 0], [-7, 1, 'decoration-forest', 0],
  [-6, 1, 'decoration-forest', 0], [-5, 1, 'decoration-forest', 0],
  [-4, 1, 'decoration-empty', 0], [-3, 1, 'decoration-empty', 0],
  [1, 1, 'decoration-forest', 0],
  [2, 1, 'decoration-forest', 0],
  [-8, 2, 'decoration-forest', 0], [-7, 2, 'decoration-forest', 0],
  [-6, 2, 'decoration-forest', 0], [-5, 2, 'decoration-forest', 0],
  [-4, 2, 'decoration-empty', 0], [-3, 2, 'decoration-empty', 0],
  [1, 2, 'decoration-forest', 0],
  [2, 2, 'decoration-forest', 0],
  [-8, 3, 'decoration-forest', 0], [-7, 3, 'decoration-forest', 0],
  [-6, 3, 'decoration-forest', 0], [-5, 3, 'decoration-forest', 0],
  [-4, 3, 'decoration-forest', 0], [-3, 3, 'decoration-forest', 0],
  [-2, 3, 'decoration-forest', 0], [-1, 3, 'decoration-forest', 0],
  [0, 3, 'decoration-forest', 0], [1, 3, 'decoration-forest', 0],
  [2, 3, 'decoration-forest', 0],
  [-8, 4, 'decoration-forest', 0], [-7, 4, 'decoration-forest', 0],
  [-6, 4, 'decoration-forest', 0], [-5, 4, 'decoration-forest', 0],
  [-4, 4, 'decoration-forest', 0], [-3, 4, 'decoration-forest', 0],
  [-2, 4, 'decoration-forest', 0], [-1, 4, 'decoration-forest', 0],
  [0, 4, 'decoration-forest', 0], [1, 4, 'decoration-forest', 0],
  [2, 4, 'decoration-forest', 0],
]

const NPC_TRUCKS: NpcTruck[] = [
  ['vehicle-truck-green', -3.51, -0.01, 12.7, 98.0],
  ['vehicle-truck-purple', -23.78, -0.14, -13.56, 0.0],
  ['vehicle-truck-red', -1.36, -0.15, -23.8, 155.9],
]

const TYPE_NAMES: TrackPieceType[] = ['track-straight', 'track-corner', 'track-bump', 'track-finish']
const TYPE_INDEX: Record<TrackPieceType, number> = {
  'track-straight': 0,
  'track-corner': 1,
  'track-bump': 2,
  'track-finish': 3,
}
const ORIENT_TO_GODOT: OrientKey[] = [0, 16, 10, 22]
const GODOT_TO_ORIENT: Record<OrientKey, number> = { 0: 0, 16: 1, 10: 2, 22: 3 }

export { TYPE_NAMES }

export function buildTrack(
  scene: THREE.Object3D,
  models: PartialModelMap,
  customCells: readonly TrackCell[] | null = null,
): void {
  const trackGroup = new THREE.Group()
  trackGroup.position.y = -0.5

  const trackPieceGroup = new THREE.Group()
  const decoGroup = new THREE.Group()
  const cells = customCells ?? TRACK_CELLS

  for (const [gx, gz, key, orient] of cells) {
    const piece = placePiece(models, key, gx, gz, orient)
    if (piece) {
      trackPieceGroup.add(piece)
    }
  }

  if (!customCells) {
    for (const [gx, gz, key, orient] of DECO_CELLS) {
      const piece = placePiece(models, key, gx, gz, orient)
      if (piece) {
        decoGroup.add(piece)
      }
    }
  }

  const occupied = new Set<string>()
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const [gx, gz] of cells) {
    occupied.add(`${gx},${gz}`)
    minX = Math.min(minX, gx)
    maxX = Math.max(maxX, gx)
    minZ = Math.min(minZ, gz)
    maxZ = Math.max(maxZ, gz)
  }

  if (!customCells) {
    for (const [gx, gz] of DECO_CELLS) {
      occupied.add(`${gx},${gz}`)
      minX = Math.min(minX, gx)
      maxX = Math.max(maxX, gx)
      minZ = Math.min(minZ, gz)
      maxZ = Math.max(maxZ, gz)
    }
  }

  const pad = 3
  const emptyPositions: number[] = []
  const forestPositions: number[] = []
  const tentPositions: number[] = []

  function hash(gx: number, gz: number): number {
    let h = gx * 374761393 + gz * 668265263
    h = (h ^ (h >> 13)) * 1274126177
    return (h ^ (h >> 16)) >>> 0
  }

  for (let gz = minZ - pad; gz <= maxZ + pad; gz++) {
    for (let gx = minX - pad; gx <= maxX + pad; gx++) {
      if (occupied.has(`${gx},${gz}`)) {
        continue
      }

      const distX = gx < minX ? minX - gx : gx > maxX ? gx - maxX : 0
      const distZ = gz < minZ ? minZ - gz : gz > maxZ ? gz - maxZ : 0
      const dist = Math.max(distX, distZ)

      const x = (gx + 0.5) * CELL_RAW
      const z = (gz + 0.5) * CELL_RAW

      if (dist <= 1) {
        if (hash(gx, gz) % 7 === 0) {
          tentPositions.push(x, z, hash(gx, gz) % 4)
        }
        else {
          emptyPositions.push(x, z)
        }
      }
      else {
        forestPositions.push(x, z)
      }
    }
  }

  function createInstances(src: THREE.Group | undefined, positions: number[]): void {
    if (positions.length === 0 || !src) {
      return
    }

    const count = positions.length / 2

    src.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return
      }

      const inst = new THREE.InstancedMesh(child.geometry, child.material, count)
      inst.castShadow = true
      inst.receiveShadow = true

      for (let index = 0; index < count; index++) {
        _dummy.position.set(positions[index * 2]!, 0.5, positions[index * 2 + 1]!)
        _dummy.rotation.set(0, 0, 0)
        _dummy.updateMatrix()
        inst.setMatrixAt(index, _dummy.matrix)
      }

      decoGroup.add(inst)
    })
  }

  createInstances(models['decoration-empty'], emptyPositions)
  createInstances(models['decoration-forest'], forestPositions)

  const tentSrc = models['decoration-tents']
  if (tentSrc && tentPositions.length > 0) {
    const tentCount = tentPositions.length / 3

    tentSrc.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) {
        return
      }

      const inst = new THREE.InstancedMesh(child.geometry, child.material, tentCount)
      inst.castShadow = true
      inst.receiveShadow = true

      for (let index = 0; index < tentCount; index++) {
        _dummy.position.set(
          tentPositions[index * 3]!,
          0.5,
          tentPositions[index * 3 + 1]!,
        )
        _dummy.rotation.set(0, tentPositions[index * 3 + 2]! * Math.PI / 2, 0)
        _dummy.updateMatrix()
        inst.setMatrixAt(index, _dummy.matrix)
      }

      decoGroup.add(inst)
    })
  }

  trackGroup.add(trackPieceGroup)
  trackGroup.add(decoGroup)
  trackGroup.scale.setScalar(GRID_SCALE)
  scene.add(trackGroup)

  trackGroup.updateMatrixWorld(true)
  trackGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  if (!customCells) {
    for (const [key, x, y, z, rotDeg] of NPC_TRUCKS) {
      const src = models[key]
      if (!src) {
        continue
      }

      const npc = src.clone()
      npc.position.set(x, y, z)
      npc.rotation.y = THREE.MathUtils.degToRad(rotDeg + 180)

      npc.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true
          child.receiveShadow = true
        }
      })

      scene.add(npc)
    }
  }
}

export function placePiece(
  models: PartialModelMap,
  key: ModelName,
  gx: number,
  gz: number,
  orient: OrientKey,
): THREE.Group | null {
  const src = models[key]
  if (!src) {
    return null
  }

  const piece = src.clone()
  piece.position.set((gx + 0.5) * CELL_RAW, 0.5, (gz + 0.5) * CELL_RAW)
  piece.rotation.y = THREE.MathUtils.degToRad(ORIENT_DEG[orient])
  return piece
}

export function encodeCells(cells: readonly TrackCell[]): string {
  const bytes = new Uint8Array(cells.length * 3)

  for (let index = 0; index < cells.length; index++) {
    const [gx, gz, name, godotOrient] = cells[index]!
    const ti = TYPE_INDEX[name]
    const oi = GODOT_TO_ORIENT[godotOrient]

    bytes[index * 3] = gx + 128
    bytes[index * 3 + 1] = gz + 128
    bytes[index * 3 + 2] = (ti << 2) | oi
  }

  return bytesToBase64url(bytes)
}

export function decodeCells(str: string): TrackCell[] {
  const bytes = base64urlToBytes(str)
  const cells: TrackCell[] = []

  for (let index = 0; index + 2 < bytes.length; index += 3) {
    const gx = bytes[index]! - 128
    const gz = bytes[index + 1]! - 128
    const packed = bytes[index + 2]!
    const ti = (packed >> 2) & 0x03
    const oi = packed & 0x03
    const type: TrackPieceType = TYPE_NAMES[ti] ?? 'track-straight'
    const orient: OrientKey = ORIENT_TO_GODOT[oi] ?? 0
    cells.push([gx, gz, type, orient])
  }

  return cells
}

export function computeSpawnPosition(cells: readonly TrackCell[]): SpawnInfo {
  const cell = cells.find(entry => entry[2] === 'track-finish') ?? cells[0]

  if (!cell) {
    return { position: [3.5, 0.5, 5], angle: 0 }
  }

  const [gx, gz, , orient] = cell
  const x = (gx + 0.5) * CELL_RAW * GRID_SCALE
  const z = (gz + 0.5) * CELL_RAW * GRID_SCALE
  const angle = THREE.MathUtils.degToRad(ORIENT_DEG[orient])

  return { position: [x, 0.5, z], angle }
}

export function computeTrackBounds(cells?: readonly TrackCell[] | null): TrackBounds {
  if (!cells || cells.length === 0) {
    return { centerX: 0, centerZ: 0, halfWidth: 30, halfDepth: 30 }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const [gx, gz] of cells) {
    minX = Math.min(minX, gx)
    maxX = Math.max(maxX, gx)
    minZ = Math.min(minZ, gz)
    maxZ = Math.max(maxZ, gz)
  }

  const cellSize = CELL_RAW * GRID_SCALE
  const centerX = ((minX + maxX + 1) / 2) * cellSize
  const centerZ = ((minZ + maxZ + 1) / 2) * cellSize
  const halfWidth = ((maxX - minX + 1) / 2) * cellSize + cellSize
  const halfDepth = ((maxZ - minZ + 1) / 2) * cellSize + cellSize

  return { centerX, centerZ, halfWidth, halfDepth }
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index++) {
    binary += String.fromCharCode(bytes[index]!)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}
