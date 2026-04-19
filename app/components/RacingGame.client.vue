<script setup lang="ts">
import type { TresContext, TresContextWithClock } from '@tresjs/core'
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  Vector4,
  WebGLRenderer,
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
import { createCockpitRig } from '../game/Cockpit'
import { GameCamera } from '../game/GameCamera'
import type { CameraMode } from '../game/GameCamera'
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
  type TrackBounds,
  type TrackCell,
} from '../game/Track'
import { Vehicle } from '../game/Vehicle'

const VEHICLE_LAYER = 1
const MAIN_COCKPIT_LAYER = 2
const PREVIEW_COCKPIT_LAYER = 3
const MINIMAP_PADDING = 4
const root = useTemplateRef<HTMLElement>('root')
const route = useRoute()
const mainCamera = shallowRef(new PerspectiveCamera(40, 1, 0.1, 80))

const loading = ref(true)
const fatalError = ref('')
const cameraMode = ref<CameraMode>('chase')

const viewportSize = reactive({
  width: 0,
  height: 0,
})

const trackBoundsState = reactive<TrackBounds>({
  centerX: 0,
  centerZ: 0,
  halfWidth: 30,
  halfDepth: 30,
})

interface HudPanel {
  width: number
  height: number
  bottom: number
  left?: number
  right?: number
}

interface GameState {
  initialized: boolean
  scene: Scene | null
  worldRoot: Group | null
  world: RacingWorld | null
  vehicle: Vehicle | null
  cameraRig: GameCamera | null
  previewCamera: PerspectiveCamera | null
  previewCameraRig: GameCamera | null
  minimapCamera: OrthographicCamera | null
  mainCockpit: Group | null
  previewCockpit: Group | null
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
  previewCamera: null,
  previewCameraRig: null,
  minimapCamera: null,
  mainCockpit: null,
  previewCockpit: null,
  controls: null,
  particles: null,
  driftMarks: null,
  audio: null,
  dirLight: null,
  hemiLight: null,
  contactListener: null,
}

const previewMode = computed<CameraMode>(() => (
  cameraMode.value === 'chase' ? 'driver' : 'chase'
))

const previewPanel = computed<HudPanel>(() => {
  const mobile = viewportSize.width <= 720
  const width = mobile
    ? Math.min(180, Math.max(136, viewportSize.width * 0.34))
    : Math.min(280, Math.max(220, viewportSize.width * 0.2))

  return {
    width,
    height: width * 9 / 16,
    right: mobile ? 16 : 22,
    bottom: mobile ? 16 : 22,
  }
})

const minimapPanel = computed<HudPanel>(() => {
  const mobile = viewportSize.width <= 720
  const halfWidth = trackBoundsState.halfWidth + MINIMAP_PADDING
  const halfHeight = trackBoundsState.halfDepth + MINIMAP_PADDING
  const mapAspect = (halfWidth * 2) / (halfHeight * 2)

  const width = mobile
    ? Math.min(188, Math.max(138, viewportSize.width * 0.4))
    : Math.min(248, Math.max(196, viewportSize.width * 0.19))

  const height = Math.max(120, Math.min(240, width / mapAspect))

  return {
    width,
    height,
    left: mobile ? 16 : 22,
    bottom: mobile ? 168 : 22,
  }
})

registerAll()

function getMapParam() {
  const value = route.query.map
  return typeof value === 'string' ? value : null
}

function getOppositeMode(mode: CameraMode): CameraMode {
  return mode === 'chase' ? 'driver' : 'chase'
}

function syncViewportSize() {
  viewportSize.width = window.innerWidth
  viewportSize.height = window.innerHeight
}

function panelStyle(panel: HudPanel) {
  return {
    width: `${Math.round(panel.width)}px`,
    height: `${Math.round(panel.height)}px`,
    bottom: `${Math.round(panel.bottom)}px`,
    left: panel.left === undefined ? undefined : `${Math.round(panel.left)}px`,
    right: panel.right === undefined ? undefined : `${Math.round(panel.right)}px`,
  }
}

function setLayer(rootNode: Group, layer: number) {
  rootNode.traverse((object) => {
    object.layers.set(layer)
  })
}

function configurePerspectiveCamera(
  camera: PerspectiveCamera,
  mode: CameraMode,
  cockpitLayer: number,
) {
  camera.layers.set(0)

  if (mode === 'driver') {
    camera.layers.enable(cockpitLayer)
    return
  }

  camera.layers.enable(VEHICLE_LAYER)
}

function syncCockpit(
  cockpit: Group | null,
  camera: PerspectiveCamera | null,
  mode: CameraMode,
) {
  if (!cockpit || !camera) {
    return
  }

  cockpit.visible = mode === 'driver'

  if (!cockpit.visible) {
    return
  }

  cockpit.position.copy(camera.position)
  cockpit.quaternion.copy(camera.quaternion)
  cockpit.updateMatrixWorld()
}

function updateMinimapCamera(camera: OrthographicCamera, panel: HudPanel) {
  const halfWidth = trackBoundsState.halfWidth + MINIMAP_PADDING
  const halfHeight = trackBoundsState.halfDepth + MINIMAP_PADDING
  const aspect = Math.max(panel.width / panel.height, 0.001)

  if (aspect >= halfWidth / halfHeight) {
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
  }
  else {
    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = halfWidth / aspect
    camera.bottom = -halfWidth / aspect
  }

  camera.near = 0.1
  camera.far = 220
  camera.up.set(0, 0, -1)
  camera.position.set(trackBoundsState.centerX, 90, trackBoundsState.centerZ)
  camera.lookAt(trackBoundsState.centerX, 0, trackBoundsState.centerZ)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

function syncCameraModes() {
  if (game.cameraRig?.camera instanceof PerspectiveCamera) {
    game.cameraRig.setMode(cameraMode.value)
    configurePerspectiveCamera(game.cameraRig.camera, cameraMode.value, MAIN_COCKPIT_LAYER)
  }

  if (game.previewCamera && game.previewCameraRig) {
    game.previewCameraRig.setMode(previewMode.value)
    configurePerspectiveCamera(game.previewCamera, previewMode.value, PREVIEW_COCKPIT_LAYER)
  }

  if (game.minimapCamera) {
    game.minimapCamera.layers.set(0)
    game.minimapCamera.layers.enable(VEHICLE_LAYER)
  }
}

function swapCameraViews() {
  cameraMode.value = getOppositeMode(cameraMode.value)
  syncCameraModes()
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

  if (game.scene && game.mainCockpit) {
    game.scene.remove(game.mainCockpit)
  }

  if (game.scene && game.previewCockpit) {
    game.scene.remove(game.previewCockpit)
  }

  game.scene = null
  game.worldRoot = null
  game.world = null
  game.vehicle = null
  game.cameraRig = null
  game.previewCamera = null
  game.previewCameraRig = null
  game.minimapCamera = null
  game.mainCockpit = null
  game.previewCockpit = null
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
    trackBoundsState.centerX = bounds.centerX
    trackBoundsState.centerZ = bounds.centerZ
    trackBoundsState.halfWidth = bounds.halfWidth
    trackBoundsState.halfDepth = bounds.halfDepth

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
    dirLight.layers.enable(VEHICLE_LAYER)

    const shadowExtent = halfExtent + 10
    dirLight.shadow.camera.left = -shadowExtent
    dirLight.shadow.camera.right = shadowExtent
    dirLight.shadow.camera.top = shadowExtent
    dirLight.shadow.camera.bottom = -shadowExtent
    dirLight.shadow.camera.updateProjectionMatrix()

    const hemiLight = new HemisphereLight(0xc8d8e8, 0x7a8a5a, 2)
    hemiLight.position.copy(dirLight.position)
    hemiLight.layers.enable(VEHICLE_LAYER)

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
    setLayer(vehicleGroup, VEHICLE_LAYER)
    worldRoot.add(vehicleGroup)
    vehicle.container.position.set(
      vehicle.spherePos.x,
      vehicle.spherePos.y - 0.5,
      vehicle.spherePos.z,
    )
    vehicle.prevModelPos.copy(vehicle.container.position)
    dirLight.target = vehicleGroup

    const cameraRig = new GameCamera(activeCamera)
    cameraRig.targetPosition.copy(vehicle.spherePos)

    const previewCamera = new PerspectiveCamera(50, 1, 0.1, 80)
    const previewCameraRig = new GameCamera(previewCamera)
    previewCameraRig.targetPosition.copy(vehicle.spherePos)

    const minimapCamera = new OrthographicCamera(-30, 30, 30, -30, 0.1, 220)
    minimapCamera.layers.enable(VEHICLE_LAYER)

    const mainCockpit = createCockpitRig()
    setLayer(mainCockpit, MAIN_COCKPIT_LAYER)
    mainCockpit.visible = false
    scene.add(mainCockpit)

    const previewCockpit = createCockpitRig()
    setLayer(previewCockpit, PREVIEW_COCKPIT_LAYER)
    previewCockpit.visible = false
    scene.add(previewCockpit)

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
    game.previewCamera = previewCamera
    game.previewCameraRig = previewCameraRig
    game.minimapCamera = minimapCamera
    game.mainCockpit = mainCockpit
    game.previewCockpit = previewCockpit
    game.controls = controls
    game.particles = particles
    game.driftMarks = driftMarks
    game.audio = audio
    game.dirLight = dirLight
    game.hemiLight = hemiLight
    game.contactListener = contactListener

    syncCameraModes()
    cameraRig.update(1 / 60, vehicle)
    previewCameraRig.update(1 / 60, vehicle)
    syncCockpit(mainCockpit, activeCamera, cameraMode.value)
    syncCockpit(previewCockpit, previewCamera, previewMode.value)
    updateMinimapCamera(minimapCamera, minimapPanel.value)
    loading.value = false
  }
  catch (error) {
    console.error(error)
    fatalError.value = error instanceof Error ? error.message : 'Game failed to initialize.'
    disposeGame()
  }
}

function renderInset(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera | OrthographicCamera,
  panel: HudPanel,
) {
  const rect = renderer.domElement.getBoundingClientRect()
  if (!rect.width || !rect.height) {
    return
  }

  const scaleX = renderer.domElement.width / rect.width
  const scaleY = renderer.domElement.height / rect.height
  const cssX = panel.left ?? (rect.width - (panel.right ?? 0) - panel.width)
  const x = Math.round(cssX * scaleX)
  const y = Math.round(panel.bottom * scaleY)
  const width = Math.max(1, Math.round(panel.width * scaleX))
  const height = Math.max(1, Math.round(panel.height * scaleY))

  renderer.setViewport(x, y, width, height)
  renderer.setScissor(x, y, width, height)
  renderer.clear()

  const previousFog = scene.fog

  if (camera instanceof PerspectiveCamera) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  else {
    updateMinimapCamera(camera, panel)
    scene.fog = null
  }

  camera.updateMatrixWorld()
  renderer.render(scene, camera)
  scene.fog = previousFog
}

function handleRender(context: TresContext) {
  const { scene, previewCamera, minimapCamera } = game
  if (!scene || !previewCamera || !minimapCamera) {
    return
  }

  const renderer = context.renderer.instance
  if (!(renderer instanceof WebGLRenderer)) {
    return
  }

  const previousAutoClear = renderer.autoClear
  const previousViewport = renderer.getViewport(new Vector4())
  const previousScissor = renderer.getScissor(new Vector4())
  const previousScissorTest = renderer.getScissorTest()

  renderer.autoClear = false
  renderer.setScissorTest(true)
  renderer.clearDepth()
  renderInset(renderer, scene, previewCamera, previewPanel.value)
  renderer.clearDepth()
  renderInset(renderer, scene, minimapCamera, minimapPanel.value)

  renderer.setScissorTest(previousScissorTest)
  renderer.setViewport(previousViewport)
  renderer.setScissor(previousScissor)
  renderer.autoClear = previousAutoClear
}

function handleBeforeLoop(context: TresContextWithClock) {
  const {
    vehicle,
    world,
    controls,
    contactListener,
    dirLight,
    cameraRig,
    previewCameraRig,
    particles,
    driftMarks,
    audio,
    mainCockpit,
    previewCockpit,
  } = game

  if (
    !vehicle
    || !world
    || !controls
    || !dirLight
    || !cameraRig
    || !previewCameraRig
    || !particles
    || !driftMarks
    || !audio
    || !mainCockpit
    || !previewCockpit
  ) {
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

  cameraRig.update(dt, vehicle)
  previewCameraRig.update(dt, vehicle)
  syncCockpit(mainCockpit, cameraRig.camera as PerspectiveCamera, cameraMode.value)
  syncCockpit(previewCockpit, previewCameraRig.camera as PerspectiveCamera, previewMode.value)
  particles.update(dt, vehicle)
  driftMarks.update(dt, vehicle)
  audio.update(dt, Math.abs(vehicle.linearSpeed), input.z, vehicle.driftIntensity)
}

onMounted(() => {
  syncViewportSize()
  window.addEventListener('resize', syncViewportSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewportSize)
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
      @render="handleRender"
    />

    <div v-if="!loading && !fatalError" class="racing-hud">
      <div class="racing-inset racing-minimap-overlay" :style="panelStyle(minimapPanel)" />

      <div
        class="racing-inset racing-preview-overlay"
        :style="panelStyle(previewPanel)"
        @click="swapCameraViews"
      />
    </div>

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
