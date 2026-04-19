<script setup lang="ts">
import type { TresContext, TresContextWithClock } from '@tresjs/core'
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three'
import {
  addBroadphaseLayer,
  addObjectLayer,
  box,
  createWorld,
  createWorldSettings,
  enableCollision,
  MotionType,
  type Listener,
  type RigidBody,
  registerAll,
  rigidBody,
  updateWorld,
} from 'crashcat'
import { GameAudio } from '../game/Audio'
import { Controls } from '../game/Controls'
import { GameCamera } from '../game/GameCamera'
import { DriftMarks } from '../game/DriftMarks'
import { loadModels } from '../game/assets'
import { SmokeTrails } from '../game/Particles'
import { buildWallColliders, createSphereBody } from '../game/Physics'
import type { RacingWorld } from '../game/Physics'
import {
  buildTrack,
  computeSpawnPosition,
  computeTrackBounds,
  decodeCells,
  TRACK_CELLS,
  type SpawnInfo,
  type TrackCell,
} from '../game/Track'
import { Vehicle } from '../game/Vehicle'

const root = useTemplateRef<HTMLElement>('root')
const route = useRoute()
const mainCamera = shallowRef(new PerspectiveCamera(40, 1, 0.1, 80))

const loading = ref(true)
const fatalError = ref('')

interface GameState {
  initialized: boolean
  scene: Scene | null
  worldRoot: Group | null
  world: RacingWorld | null
  vehicle: Vehicle | null
  cameraRig: GameCamera | null
  controls: Controls | null
  particles: SmokeTrails | null
  driftMarks: DriftMarks | null
  audio: GameAudio | null
  dirLight: DirectionalLight | null
  hemiLight: HemisphereLight | null
  contactListener: Listener | null
}

const game: GameState = {
  initialized: false,
  scene: null,
  worldRoot: null,
  world: null,
  vehicle: null,
  cameraRig: null,
  controls: null,
  particles: null,
  driftMarks: null,
  audio: null,
  dirLight: null,
  hemiLight: null,
  contactListener: null,
}

registerAll()

function getMapParam() {
  const value = route.query.map
  return typeof value === 'string' ? value : null
}

function disposeGame() {
  game.controls?.dispose()
  game.audio?.dispose()
  game.particles?.dispose()
  game.driftMarks?.dispose()

  if (game.scene && game.worldRoot) {
    game.scene.remove(game.worldRoot)
  }

  if (game.scene && game.dirLight) {
    game.scene.remove(game.dirLight)
  }

  if (game.scene && game.hemiLight) {
    game.scene.remove(game.hemiLight)
  }

  game.scene = null
  game.worldRoot = null
  game.world = null
  game.vehicle = null
  game.cameraRig = null
  game.controls = null
  game.particles = null
  game.driftMarks = null
  game.audio = null
  game.dirLight = null
  game.hemiLight = null
  game.contactListener = null
  game.initialized = false
  loading.value = true
}

async function handleReady(context: TresContext) {
  if (game.initialized) {
    return
  }

  game.initialized = true
  fatalError.value = ''

  try {
    const scene = context.scene.value
    const activeCamera = context.camera.activeCamera.value || mainCamera.value

    if (!(activeCamera instanceof PerspectiveCamera)) {
      throw new Error('TresJS active camera is unavailable.')
    }

    const mapParam = getMapParam()
    let customCells: TrackCell[] | null = null
    let spawn: SpawnInfo | null = null

    if (mapParam) {
      try {
        customCells = decodeCells(mapParam)
        spawn = computeSpawnPosition(customCells)
      }
      catch {
        customCells = null
      }
    }

    const cells = customCells || TRACK_CELLS
    const bounds = computeTrackBounds(cells)
    const halfExtent = Math.max(bounds.halfWidth, bounds.halfDepth)
    const groundSize = halfExtent * 2 + 20

    scene.background = new Color(0xadb2ba)
    scene.fog = new Fog(0xadb2ba, groundSize * 0.4, groundSize * 0.8)

    const dirLight = new DirectionalLight(0xffffff, 3)
    dirLight.position.set(11.4, 15, -5.3)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.setScalar(4096)
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 60
    dirLight.shadow.radius = 4

    const shadowExtent = halfExtent + 10
    dirLight.shadow.camera.left = -shadowExtent
    dirLight.shadow.camera.right = shadowExtent
    dirLight.shadow.camera.top = shadowExtent
    dirLight.shadow.camera.bottom = -shadowExtent
    dirLight.shadow.camera.updateProjectionMatrix()

    const hemiLight = new HemisphereLight(0xc8d8e8, 0x7a8a5a, 2)
    hemiLight.position.copy(dirLight.position)

    scene.add(dirLight)
    scene.add(hemiLight)

    const worldRoot = new Group()
    scene.add(worldRoot)

    const models = await loadModels()
    buildTrack(worldRoot, models, customCells)

    const worldSettings = createWorldSettings()
    worldSettings.gravity = [0, -9.81, 0]

    const movingBroadphase = addBroadphaseLayer(worldSettings)
    const staticBroadphase = addBroadphaseLayer(worldSettings)
    const movingLayer = addObjectLayer(worldSettings, movingBroadphase)
    const staticLayer = addObjectLayer(worldSettings, staticBroadphase)

    enableCollision(worldSettings, movingLayer, staticLayer)
    enableCollision(worldSettings, movingLayer, movingLayer)

    const world = createWorld(worldSettings) as RacingWorld
    world._OL_MOVING = movingLayer
    world._OL_STATIC = staticLayer

    buildWallColliders(world, customCells)

    const roadHalf = groundSize / 2
    rigidBody.create(world, {
      shape: box.create({ halfExtents: [roadHalf, 0.01, roadHalf] }),
      motionType: MotionType.STATIC,
      objectLayer: staticLayer,
      position: [bounds.centerX, -0.125, bounds.centerZ],
      friction: 5.0,
      restitution: 0.0,
    })

    const sphereBody = createSphereBody(world, spawn ? spawn.position : null)

    const vehicle = new Vehicle()
    vehicle.rigidBody = sphereBody
    vehicle.physicsWorld = world

    if (spawn) {
      const [sx, sy, sz] = spawn.position
      vehicle.spherePos.set(sx, sy, sz)
      vehicle.prevModelPos.set(sx, 0, sz)
      vehicle.container.rotation.y = spawn.angle
    }

    const vehicleGroup = vehicle.init(models['vehicle-truck-yellow'])
    worldRoot.add(vehicleGroup)
    dirLight.target = vehicleGroup

    const cameraRig = new GameCamera(activeCamera)
    cameraRig.targetPosition.copy(vehicle.spherePos)

    const controls = new Controls({ root: root.value })
    const particles = new SmokeTrails(worldRoot)
    const driftMarks = new DriftMarks(worldRoot)
    const audio = new GameAudio()
    audio.init(activeCamera)

    const forward = new Vector3()

    const contactListener: Listener = {
      onContactAdded(bodyA: RigidBody, bodyB: RigidBody) {
        if (bodyA !== sphereBody && bodyB !== sphereBody) {
          return
        }

        forward.set(0, 0, 1).applyQuaternion(vehicle.container.quaternion)
        forward.y = 0
        forward.normalize()

        const impactVelocity = Math.abs(vehicle.modelVelocity.dot(forward))
        audio.playImpact(impactVelocity)
      },
    }

    game.scene = scene
    game.worldRoot = worldRoot
    game.world = world
    game.vehicle = vehicle
    game.cameraRig = cameraRig
    game.controls = controls
    game.particles = particles
    game.driftMarks = driftMarks
    game.audio = audio
    game.dirLight = dirLight
    game.hemiLight = hemiLight
    game.contactListener = contactListener

    loading.value = false
  }
  catch (error) {
    console.error(error)
    fatalError.value = error instanceof Error ? error.message : 'Game failed to initialize.'
    disposeGame()
  }
}

function handleBeforeLoop(context: TresContextWithClock) {
  const { vehicle, world, controls, contactListener, dirLight, cameraRig, particles, driftMarks, audio } = game
  if (!vehicle || !world || !controls || !dirLight || !cameraRig || !particles || !driftMarks || !audio) {
    return
  }

  const dt = Math.min(context.delta, 1 / 30)
  if (!Number.isFinite(dt) || dt <= 0) {
    return
  }

  const input = controls.update()

  updateWorld(world, contactListener ?? undefined, dt)
  vehicle.update(dt, input)

  dirLight.position.set(
    vehicle.spherePos.x + 11.4,
    15,
    vehicle.spherePos.z - 5.3,
  )

  cameraRig.update(dt, vehicle.spherePos)
  particles.update(dt, vehicle)
  driftMarks.update(dt, vehicle)
  audio.update(dt, Math.abs(vehicle.linearSpeed), input.z, vehicle.driftIntensity)
}

onUnmounted(() => {
  disposeGame()
})
</script>

<template>
  <div ref="root" class="racing-shell">
    <TresCanvas
      window-size
      :camera="mainCamera"
      :dpr="[1, 2]"
      clear-color="#adb2ba"
      :tone-mapping="ACESFilmicToneMapping"
      :tone-mapping-exposure="1"
      :shadows="true"
      :antialias="true"
      render-mode="always"
      @ready="handleReady"
      @before-loop="handleBeforeLoop"
    />

    <div v-if="loading" class="racing-loading">
      <div class="racing-loader-card">
        <p class="racing-kicker">Loading Assets</p>
        <h2>正在装载赛道、车辆与音效</h2>
        <p>首次进入后，按任意键或点一下画面即可解锁引擎声。</p>
      </div>
    </div>

    <div v-if="fatalError" class="racing-error">
      <div class="racing-loader-card">
        <p class="racing-kicker">Runtime Error</p>
        <h2>游戏初始化失败</h2>
        <p>{{ fatalError }}</p>
      </div>
    </div>
  </div>
</template>
