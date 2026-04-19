import { MotionQuality, MotionType, box, rigidBody, sphere, type RigidBody, type World } from 'crashcat'
import { CELL_RAW, GRID_SCALE, ORIENT_DEG, TRACK_CELLS, type TrackCell } from './Track'

export type RacingWorld = World & {
  _OL_MOVING: number
  _OL_STATIC: number
}

export function buildWallColliders(
  world: RacingWorld,
  customCells: readonly TrackCell[] | null = null,
): void {
  const scale = GRID_SCALE
  const cellHalf = CELL_RAW / 2

  const wallHalfThick = 0.25
  const wallX = 4.75
  const wallHalfH = 1.5

  const wallY = (0.5 + wallHalfH) * scale - 0.5
  const hThick = wallHalfThick * scale
  const hHeight = wallHalfH * scale
  const hLen = cellHalf * scale

  const arcSpan = -Math.PI / 2
  const arcCenterX = -cellHalf
  const arcCenterZ = cellHalf
  const outerR = 2 * cellHalf - wallHalfThick
  const outerSeg = 8
  const outerSegHalfLen = (outerR * (Math.PI / 2) / outerSeg / 2) * scale
  const innerR = wallHalfThick
  const innerSeg = 3
  const innerSegHalfLen = (innerR * (Math.PI / 2) / innerSeg / 2) * scale

  function addArcWall(
    wcx: number,
    wcz: number,
    arcStart: number,
    radius: number,
    numSeg: number,
    segHalfLen: number,
  ): void {
    for (let index = 0; index < numSeg; index++) {
      const aMid = arcStart + ((index + 0.5) / numSeg) * arcSpan
      const halfExtents: [number, number, number] = [hThick, hHeight, segHalfLen]
      const position: [number, number, number] = [
        wcx + radius * Math.cos(aMid) * scale,
        wallY,
        wcz + radius * Math.sin(aMid) * scale,
      ]
      const quaternion: [number, number, number, number] = [0, Math.sin(-aMid / 2), 0, Math.cos(-aMid / 2)]

      rigidBody.create(world, {
        shape: box.create({ halfExtents }),
        motionType: MotionType.STATIC,
        objectLayer: world._OL_STATIC,
        position,
        quaternion,
        friction: 0.0,
        restitution: 0.1,
      })
    }
  }

  const cells = customCells ?? TRACK_CELLS

  for (const [gx, gz, key, orient] of cells) {
    if (key === 'track-bump') {
      continue
    }

    const cx = (gx + 0.5) * CELL_RAW * scale
    const cz = (gz + 0.5) * CELL_RAW * scale
    const rad = (ORIENT_DEG[orient] * Math.PI) / 180
    const cr = Math.cos(rad)
    const sr = Math.sin(rad)

    if (key === 'track-straight' || key === 'track-finish') {
      for (const side of [-1, 1]) {
        const lx = side * wallX
        const wx = cx + (lx * cr) * scale
        const wz = cz + (-lx * sr) * scale

        rigidBody.create(world, {
          shape: box.create({ halfExtents: [hThick, hHeight, hLen] }),
          motionType: MotionType.STATIC,
          objectLayer: world._OL_STATIC,
          position: [wx, wallY, wz],
          quaternion: [0, Math.sin(rad / 2), 0, Math.cos(rad / 2)],
          friction: 0.0,
          restitution: 0.1,
        })
      }
    }
    else if (key === 'track-corner') {
      const wcx = cx + (arcCenterX * cr + arcCenterZ * sr) * scale
      const wcz = cz + (-arcCenterX * sr + arcCenterZ * cr) * scale
      const arcStart = -rad

      addArcWall(wcx, wcz, arcStart, outerR, outerSeg, outerSegHalfLen)
      addArcWall(wcx, wcz, arcStart, innerR, innerSeg, innerSegHalfLen)
    }
  }
}

export function createSphereBody(
  world: RacingWorld,
  spawnPos: [number, number, number] | null = null,
): RigidBody {
  return rigidBody.create(world, {
    shape: sphere.create({ radius: 0.5 }),
    motionType: MotionType.DYNAMIC,
    objectLayer: world._OL_MOVING,
    position: spawnPos ?? [3.5, 0.5, 5],
    mass: 1000.0,
    friction: 5.0,
    restitution: 0.1,
    linearDamping: 0.1,
    angularDamping: 4.0,
    gravityFactor: 1.5,
    motionQuality: MotionQuality.LINEAR_CAST,
  })
}
