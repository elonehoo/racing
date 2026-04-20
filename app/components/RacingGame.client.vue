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
import { RemoteVehicle } from '../game/RemoteVehicle'
import {
  buildTrack,
  computeSpawnPosition,
  computeTrackBounds,
  decodeCells,
  TRACK_CELLS,
  type LoadedModels,
  type SpawnInfo,
  type TrackBounds,
  type TrackCell,
} from '../game/Track'
import {
  getVehicleModelForSlot,
  makeGuestName,
  normalizeRoomCode,
  ROOM_SYNC_INTERVAL_MS,
  type RoomPlayerSnapshot,
  type RoomSessionResponse,
} from '../game/multiplayer'
import { Vehicle } from '../game/Vehicle'

const VEHICLE_LAYER = 1
const MAIN_COCKPIT_LAYER = 2
const PREVIEW_COCKPIT_LAYER = 3
const MINIMAP_PADDING = 4
const ROOM_QUERY_KEY = 'room'
const PLAYER_QUERY_KEY = 'player'
const SLOT_QUERY_KEY = 'slot'
const firstPersonEnabled = false
const previewEnabled = false
const minimapEnabled = false
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

interface MultiplayerState {
  status: 'idle' | 'joining' | 'connected' | 'error'
  roomId: string
  playerId: string
  slot: number | null
  playerName: string
  joinCode: string
  shareUrl: string
  players: RoomPlayerSnapshot[]
  maxPlayers: number
  message: string
  error: string
}

interface GameState {
  initialized: boolean
  scene: Scene | null
  worldRoot: Group | null
  remoteVehiclesRoot: Group | null
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
  models: LoadedModels | null
  trackCells: readonly TrackCell[]
  remoteVehicles: Map<string, RemoteVehicle>
}

const game: GameState = {
  initialized: false,
  scene: null,
  worldRoot: null,
  remoteVehiclesRoot: null,
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
  models: null,
  trackCells: TRACK_CELLS,
  remoteVehicles: new Map(),
}

const multiplayer = reactive<MultiplayerState>({
  status: 'idle',
  roomId: '',
  playerId: '',
  slot: null,
  playerName: '',
  joinCode: '',
  shareUrl: '',
  players: [],
  maxPlayers: 0,
  message: '',
  error: '',
})

let resizeObserver: ResizeObserver | null = null
let roomSyncTimer: number | null = null
let roomSyncInFlight = false

const previewMode = computed<CameraMode>(() => {
  if (!firstPersonEnabled) {
    return 'chase'
  }

  return cameraMode.value === 'chase' ? 'driver' : 'chase'
})

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
  // Keep the minimap inside a fixed HUD frame and let the camera fit the track into it.
  const size = mobile
    ? Math.min(148, Math.max(110, Math.min(previewPanel.value.width * 0.78, viewportSize.width * 0.29)))
    : Math.min(176, Math.max(138, Math.min(previewPanel.value.width * 0.66, viewportSize.width * 0.14)))

  return {
    width: size,
    height: size,
    left: mobile ? 16 : 22,
    bottom: mobile ? 168 : 22,
  }
})

const minimapWindowInset = computed(() => (
  viewportSize.width <= 720 ? 10 : 12
))

const minimapViewport = computed<HudPanel>(() => {
  const inset = minimapWindowInset.value
  const panel = minimapPanel.value

  return {
    width: Math.max(1, panel.width - inset * 2),
    height: Math.max(1, panel.height - inset * 2),
    bottom: panel.bottom + inset,
    left: panel.left === undefined ? undefined : panel.left + inset,
    right: panel.right === undefined ? undefined : panel.right + inset,
  }
})

const minimapWindowStyle = computed(() => {
  const inset = `${Math.round(minimapWindowInset.value)}px`

  return {
    top: inset,
    right: inset,
    bottom: inset,
    left: inset,
  }
})

const roomRoster = computed(() => (
  [...multiplayer.players].sort((left, right) => left.slot - right.slot)
))

const roomConnected = computed(() => (
  Boolean(multiplayer.roomId && multiplayer.playerId)
))

const roomStatusText = computed(() => {
  if (multiplayer.status === 'joining') {
    return 'Connecting to room...'
  }

  if (multiplayer.error) {
    return multiplayer.error
  }

  if (multiplayer.message) {
    return multiplayer.message
  }

  if (roomConnected.value) {
    return `${multiplayer.players.length}/${multiplayer.maxPlayers || 6} drivers online`
  }

  return 'Create a room or join one from a link.'
})

registerAll()

function getQueryParam(key: string) {
  if (typeof window !== 'undefined') {
    return new URL(window.location.href).searchParams.get(key)
  }

  const value = route.query[key]
  return typeof value === 'string' ? value : null
}

function getMapParam() {
  return getQueryParam('map')
}

function getRoomParam() {
  return normalizeRoomCode(getQueryParam(ROOM_QUERY_KEY) ?? '')
}

function getPlayerParam() {
  return getQueryParam(PLAYER_QUERY_KEY)
}

function getSlotParam() {
  const raw = getQueryParam(SLOT_QUERY_KEY)
  if (!raw) {
    return null
  }

  const slot = Number(raw)
  return Number.isInteger(slot) && slot >= 0 ? slot : null
}

function getOppositeMode(mode: CameraMode): CameraMode {
  return mode === 'chase' ? 'driver' : 'chase'
}

function syncViewportSize() {
  const hostRect = root.value?.getBoundingClientRect()

  if (hostRect && hostRect.width > 0 && hostRect.height > 0) {
    viewportSize.width = hostRect.width
    viewportSize.height = hostRect.height
    return
  }

  viewportSize.width = document.documentElement.clientWidth || window.innerWidth
  viewportSize.height = document.documentElement.clientHeight || window.innerHeight
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
  const mainMode: CameraMode = firstPersonEnabled ? cameraMode.value : 'chase'

  if (game.cameraRig?.camera instanceof PerspectiveCamera) {
    game.cameraRig.setMode(mainMode)
    configurePerspectiveCamera(game.cameraRig.camera, mainMode, MAIN_COCKPIT_LAYER)
  }

  if (previewEnabled && game.previewCamera && game.previewCameraRig) {
    const insetMode: CameraMode = firstPersonEnabled ? previewMode.value : 'chase'
    game.previewCameraRig.setMode(insetMode)
    configurePerspectiveCamera(game.previewCamera, insetMode, PREVIEW_COCKPIT_LAYER)
  }

  if (game.minimapCamera) {
    game.minimapCamera.layers.set(0)
    game.minimapCamera.layers.enable(VEHICLE_LAYER)
  }
}

function swapCameraViews() {
  if (!firstPersonEnabled || !previewEnabled) {
    return
  }

  cameraMode.value = getOppositeMode(cameraMode.value)
  syncCameraModes()
}

function updateBrowserUrl(params: {
  roomId?: string | null
  playerId?: string | null
  slot?: number | null
  map?: string | null
}) {
  const url = new URL(window.location.href)

  if (params.roomId) {
    url.searchParams.set(ROOM_QUERY_KEY, params.roomId)
  }
  else {
    url.searchParams.delete(ROOM_QUERY_KEY)
  }

  if (params.playerId) {
    url.searchParams.set(PLAYER_QUERY_KEY, params.playerId)
  }
  else {
    url.searchParams.delete(PLAYER_QUERY_KEY)
  }

  if (params.slot === null || params.slot === undefined) {
    url.searchParams.delete(SLOT_QUERY_KEY)
  }
  else {
    url.searchParams.set(SLOT_QUERY_KEY, `${params.slot}`)
  }

  if (params.map) {
    url.searchParams.set('map', params.map)
  }
  else {
    url.searchParams.delete('map')
  }

  window.history.replaceState(window.history.state, '', url)
}

function buildRoomShareUrl(roomId: string, map: string | null) {
  const url = new URL(window.location.href)
  url.searchParams.set(ROOM_QUERY_KEY, roomId)
  url.searchParams.delete(PLAYER_QUERY_KEY)
  url.searchParams.delete(SLOT_QUERY_KEY)

  if (map) {
    url.searchParams.set('map', map)
  }
  else {
    url.searchParams.delete('map')
  }

  return url.toString()
}

function adoptRoomSession(session: RoomSessionResponse) {
  multiplayer.status = 'connected'
  multiplayer.roomId = session.roomId
  multiplayer.playerId = session.player.id
  multiplayer.slot = session.player.slot
  multiplayer.playerName = session.player.name
  multiplayer.players = session.players
  multiplayer.maxPlayers = session.maxPlayers
  multiplayer.joinCode = session.roomId
  multiplayer.shareUrl = buildRoomShareUrl(session.roomId, session.map)
  multiplayer.error = ''
}

function clearRemoteVehicles() {
  for (const remote of game.remoteVehicles.values()) {
    game.remoteVehiclesRoot?.remove(remote.container)
  }

  game.remoteVehicles.clear()
}

function syncRemoteVehicles(players: RoomPlayerSnapshot[]) {
  const rootNode = game.remoteVehiclesRoot
  const models = game.models

  if (!rootNode || !models) {
    return
  }

  const activeIds = new Set<string>()

  for (const player of players) {
    if (player.id === multiplayer.playerId) {
      continue
    }

    activeIds.add(player.id)

    let remote = game.remoteVehicles.get(player.id)
    if (!remote) {
      remote = new RemoteVehicle(models[getVehicleModelForSlot(player.slot)])
      setLayer(remote.container, VEHICLE_LAYER)
      rootNode.add(remote.container)
      game.remoteVehicles.set(player.id, remote)
    }

    remote.applySnapshot(player)
  }

  for (const [playerId, remote] of game.remoteVehicles) {
    if (activeIds.has(playerId)) {
      continue
    }

    rootNode.remove(remote.container)
    game.remoteVehicles.delete(playerId)
  }
}

function resetVehicleToSpawn(slot?: number | null) {
  const vehicle = game.vehicle
  const world = game.world

  if (!vehicle || !world) {
    return
  }

  const spawn = computeSpawnPosition(game.trackCells, slot ?? undefined)
  const [sx, sy, sz] = spawn.position
  const body = vehicle.rigidBody

  if (body) {
    rigidBody.setPosition(world, body, spawn.position, false)
    rigidBody.setLinearVelocity(world, body, [0, 0, 0])
    rigidBody.setAngularVelocity(world, body, [0, 0, 0])
  }

  vehicle.spherePos.set(sx, sy, sz)
  vehicle.sphereVel.set(0, 0, 0)
  vehicle.modelVelocity.set(0, 0, 0)
  vehicle.linearSpeed = 0
  vehicle.angularSpeed = 0
  vehicle.acceleration = 0
  vehicle.inputX = 0
  vehicle.inputZ = 0
  vehicle.container.position.set(sx, sy - 0.5, sz)
  vehicle.container.rotation.set(0, spawn.angle, 0)
  vehicle.container.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), spawn.angle)
  vehicle.prevModelPos.copy(vehicle.container.position)
  game.cameraRig?.targetPosition.copy(vehicle.spherePos)
  game.previewCameraRig?.targetPosition.copy(vehicle.spherePos)
}

function stopRoomSync() {
  if (roomSyncTimer !== null) {
    window.clearInterval(roomSyncTimer)
    roomSyncTimer = null
  }

  roomSyncInFlight = false
}

function clearRoomSession(updateUrl = true) {
  stopRoomSync()
  clearRemoteVehicles()

  multiplayer.status = 'idle'
  multiplayer.roomId = ''
  multiplayer.playerId = ''
  multiplayer.slot = null
  multiplayer.shareUrl = ''
  multiplayer.players = []
  multiplayer.maxPlayers = 0
  multiplayer.message = ''
  multiplayer.error = ''

  if (updateUrl) {
    updateBrowserUrl({
      roomId: null,
      playerId: null,
      slot: null,
      map: getMapParam(),
    })
  }
}

async function syncRoomState() {
  if (!roomConnected.value || !game.vehicle) {
    return
  }

  if (roomSyncInFlight) {
    return
  }

  roomSyncInFlight = true

  try {
    const vehicle = game.vehicle
    const session = await $fetch<RoomSessionResponse>(`/api/rooms/${multiplayer.roomId}/sync`, {
      method: 'POST',
      body: {
        playerId: multiplayer.playerId,
        state: {
          x: vehicle.spherePos.x,
          y: vehicle.spherePos.y,
          z: vehicle.spherePos.z,
          rotationY: vehicle.container.rotation.y,
          speed: vehicle.linearSpeed,
          steering: vehicle.inputX,
          drift: vehicle.driftIntensity,
        },
      },
    })

    adoptRoomSession(session)
    syncRemoteVehicles(session.players)
  }
  catch (error) {
    multiplayer.status = 'error'
    multiplayer.error = error instanceof Error ? error.message : 'Room sync failed.'
    stopRoomSync()
    clearRemoteVehicles()
  }
  finally {
    roomSyncInFlight = false
  }
}

function startRoomSync() {
  if (!roomConnected.value || roomSyncTimer !== null) {
    return
  }

  roomSyncTimer = window.setInterval(() => {
    void syncRoomState()
  }, ROOM_SYNC_INTERVAL_MS)

  void syncRoomState()
}

function roomMapMatchesCurrent(map: string | null) {
  return map === getMapParam()
}

function redirectToRoomSession(session: RoomSessionResponse) {
  const url = new URL(window.location.href)
  url.searchParams.set(ROOM_QUERY_KEY, session.roomId)
  url.searchParams.set(PLAYER_QUERY_KEY, session.player.id)
  url.searchParams.set(SLOT_QUERY_KEY, `${session.player.slot}`)

  if (session.map) {
    url.searchParams.set('map', session.map)
  }
  else {
    url.searchParams.delete('map')
  }

  window.location.replace(url.toString())
}

async function bootstrapRoomSession() {
  const roomId = getRoomParam()
  if (!roomId) {
    return null
  }

  multiplayer.joinCode = roomId

  const playerId = getPlayerParam()
  const slot = getSlotParam()

  if (playerId && slot !== null) {
    multiplayer.status = 'connected'
    multiplayer.roomId = roomId
    multiplayer.playerId = playerId
    multiplayer.slot = slot
    multiplayer.playerName = multiplayer.playerName || makeGuestName()
    multiplayer.shareUrl = buildRoomShareUrl(roomId, getMapParam())
    return slot
  }

  multiplayer.status = 'joining'
  multiplayer.error = ''
  multiplayer.message = ''

  try {
    const session = await $fetch<RoomSessionResponse>(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      body: {
        playerName: multiplayer.playerName || makeGuestName(),
      },
    })

    if (!roomMapMatchesCurrent(session.map)) {
      redirectToRoomSession(session)
      return 'redirected'
    }

    adoptRoomSession(session)
    updateBrowserUrl({
      roomId: session.roomId,
      playerId: session.player.id,
      slot: session.player.slot,
      map: session.map,
    })
    return session.player.slot
  }
  catch (error) {
    clearRoomSession(false)
    multiplayer.status = 'error'
    multiplayer.error = error instanceof Error ? error.message : 'Unable to join room.'
    updateBrowserUrl({
      roomId: null,
      playerId: null,
      slot: null,
      map: getMapParam(),
    })
    return null
  }
}

async function createRoom() {
  multiplayer.status = 'joining'
  multiplayer.error = ''
  multiplayer.message = ''

  try {
    const session = await $fetch<RoomSessionResponse>('/api/rooms', {
      method: 'POST',
      body: {
        map: getMapParam(),
        playerName: multiplayer.playerName || makeGuestName(),
      },
    })

    adoptRoomSession(session)
    updateBrowserUrl({
      roomId: session.roomId,
      playerId: session.player.id,
      slot: session.player.slot,
      map: session.map,
    })
    resetVehicleToSpawn(session.player.slot)
    startRoomSync()
  }
  catch (error) {
    multiplayer.status = 'error'
    multiplayer.error = error instanceof Error ? error.message : 'Unable to create room.'
  }
}

async function joinRoom() {
  const roomId = normalizeRoomCode(multiplayer.joinCode)
  if (!roomId) {
    multiplayer.status = 'error'
    multiplayer.error = 'Enter a valid room code.'
    return
  }

  multiplayer.status = 'joining'
  multiplayer.error = ''
  multiplayer.message = ''

  try {
    const session = await $fetch<RoomSessionResponse>(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      body: {
        playerName: multiplayer.playerName || makeGuestName(),
      },
    })

    if (!roomMapMatchesCurrent(session.map)) {
      redirectToRoomSession(session)
      return
    }

    adoptRoomSession(session)
    updateBrowserUrl({
      roomId: session.roomId,
      playerId: session.player.id,
      slot: session.player.slot,
      map: session.map,
    })
    resetVehicleToSpawn(session.player.slot)
    startRoomSync()
  }
  catch (error) {
    multiplayer.status = 'error'
    multiplayer.error = error instanceof Error ? error.message : 'Unable to join room.'
  }
}

async function copyShareLink() {
  if (!multiplayer.shareUrl) {
    return
  }

  try {
    await navigator.clipboard.writeText(multiplayer.shareUrl)
    multiplayer.message = 'Invite link copied.'
    multiplayer.error = ''
  }
  catch {
    multiplayer.status = 'error'
    multiplayer.error = multiplayer.shareUrl
  }
}

function leaveRoom() {
  clearRoomSession()
  resetVehicleToSpawn(null)
}

function disposeGame() {
  stopRoomSync()
  clearRemoteVehicles()
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
  game.remoteVehiclesRoot = null
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
  game.models = null
  game.trackCells = TRACK_CELLS
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

    const roomSlot = await bootstrapRoomSession()
    if (roomSlot === 'redirected') {
      return
    }

    const mapParam = getMapParam()
    let customCells: TrackCell[] | null = null
    let spawn: SpawnInfo | null = null

    if (mapParam) {
      try {
        customCells = decodeCells(mapParam)
      }
      catch {
        customCells = null
      }
    }

    const cells = customCells || TRACK_CELLS
    spawn = computeSpawnPosition(cells, typeof roomSlot === 'number' ? roomSlot : undefined)
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

    if (firstPersonEnabled) {
      dirLight.layers.enable(MAIN_COCKPIT_LAYER)
      dirLight.layers.enable(PREVIEW_COCKPIT_LAYER)
      hemiLight.layers.enable(MAIN_COCKPIT_LAYER)
      hemiLight.layers.enable(PREVIEW_COCKPIT_LAYER)
    }

    scene.add(dirLight)
    scene.add(hemiLight)

    const worldRoot = new Group()
    scene.add(worldRoot)
    const remoteVehiclesRoot = new Group()
    worldRoot.add(remoteVehiclesRoot)

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

    const vehicleModel = typeof roomSlot === 'number'
      ? models[getVehicleModelForSlot(roomSlot)]
      : models['vehicle-truck-yellow']
    const vehicleGroup = vehicle.init(vehicleModel)
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

    const previewCamera = previewEnabled
      ? new PerspectiveCamera(50, 1, 0.1, 80)
      : null
    const previewCameraRig = previewCamera
      ? new GameCamera(previewCamera)
      : null
    if (previewCameraRig) {
      previewCameraRig.stabilizedDriverView = true
      previewCameraRig.targetPosition.copy(vehicle.spherePos)
    }

    const minimapCamera = new OrthographicCamera(-30, 30, 30, -30, 0.1, 220)
    minimapCamera.layers.enable(VEHICLE_LAYER)

    const mainCockpit = firstPersonEnabled
      ? createCockpitRig()
      : null
    if (mainCockpit) {
      setLayer(mainCockpit, MAIN_COCKPIT_LAYER)
      mainCockpit.visible = false
      scene.add(mainCockpit)
    }

    const previewCockpit = firstPersonEnabled && previewEnabled
      ? createCockpitRig()
      : null
    if (previewCockpit) {
      setLayer(previewCockpit, PREVIEW_COCKPIT_LAYER)
      previewCockpit.visible = false
      scene.add(previewCockpit)
    }

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
    game.remoteVehiclesRoot = remoteVehiclesRoot
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
    game.models = models
    game.trackCells = cells

    syncCameraModes()
    cameraRig.update(1 / 60, vehicle)
    previewCameraRig?.update(1 / 60, vehicle)
    syncCockpit(mainCockpit, activeCamera, firstPersonEnabled ? cameraMode.value : 'chase')
    syncCockpit(previewCockpit, previewCamera, firstPersonEnabled ? previewMode.value : 'chase')
    if (minimapEnabled) {
      updateMinimapCamera(minimapCamera, minimapViewport.value)
    }
    syncRemoteVehicles(multiplayer.players)
    loading.value = false
    startRoomSync()
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
  if (!scene || (!previewEnabled && !minimapEnabled)) {
    return
  }

  if ((previewEnabled && !previewCamera) || (minimapEnabled && !minimapCamera)) {
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
  if (previewEnabled && previewCamera) {
    renderer.clearDepth()
    renderInset(renderer, scene, previewCamera, previewPanel.value)
  }

  if (minimapEnabled && minimapCamera) {
    renderer.clearDepth()
    renderInset(renderer, scene, minimapCamera, minimapViewport.value)
  }

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
    || !particles
    || !driftMarks
    || !audio
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
  previewCameraRig?.update(dt, vehicle)
  syncCockpit(mainCockpit, cameraRig.camera as PerspectiveCamera, firstPersonEnabled ? cameraMode.value : 'chase')
  syncCockpit(
    previewCockpit,
    previewCameraRig?.camera as PerspectiveCamera | null,
    firstPersonEnabled ? previewMode.value : 'chase',
  )
  particles.update(dt, vehicle)
  driftMarks.update(dt, vehicle)
  audio.update(dt, Math.abs(vehicle.linearSpeed), input.z, vehicle.driftIntensity)

  for (const remote of game.remoteVehicles.values()) {
    remote.update(dt)
  }
}

onMounted(() => {
  syncViewportSize()
  window.addEventListener('resize', syncViewportSize)

  resizeObserver = new ResizeObserver(() => {
    syncViewportSize()
  })

  if (root.value && resizeObserver) {
    resizeObserver.observe(root.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', syncViewportSize)
  resizeObserver?.disconnect()
  resizeObserver = null
  disposeGame()
})
</script>

<template>
  <div ref="root" class="racing-shell">
    <TresCanvas
      class="racing-canvas"
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
      <section class="racing-room-panel">
        <p class="racing-kicker">Multiplayer Prototype</p>
        <h3>{{ roomConnected ? `Room ${multiplayer.roomId}` : 'Room Lobby' }}</h3>
        <p class="racing-room-status" :class="{ 'is-error': Boolean(multiplayer.error) }">
          {{ roomStatusText }}
        </p>

        <div class="racing-room-fields">
          <label class="racing-room-field">
            <span>Driver Name</span>
            <input
              v-model="multiplayer.playerName"
              class="racing-room-input"
              type="text"
              maxlength="18"
              placeholder="Driver 204"
            >
          </label>

          <label v-if="!roomConnected" class="racing-room-field">
            <span>Room Code</span>
            <input
              v-model="multiplayer.joinCode"
              class="racing-room-input"
              type="text"
              inputmode="text"
              maxlength="5"
              placeholder="AB12C"
              @input="multiplayer.joinCode = normalizeRoomCode(multiplayer.joinCode)"
              @keyup.enter="joinRoom"
            >
          </label>
        </div>

        <div class="racing-room-actions">
          <button
            v-if="!roomConnected"
            class="racing-room-button is-primary"
            :disabled="multiplayer.status === 'joining'"
            @click="createRoom"
          >
            Create Room
          </button>
          <button
            v-if="!roomConnected"
            class="racing-room-button"
            :disabled="multiplayer.status === 'joining'"
            @click="joinRoom"
          >
            Join
          </button>
          <button
            v-if="roomConnected"
            class="racing-room-button is-primary"
            @click="copyShareLink"
          >
            Copy Invite
          </button>
          <button
            v-if="roomConnected"
            class="racing-room-button"
            @click="leaveRoom"
          >
            Leave
          </button>
        </div>

        <div v-if="roomConnected" class="racing-room-roster">
          <div
            v-for="player in roomRoster"
            :key="player.id"
            class="racing-room-player"
            :class="{ 'is-self': player.id === multiplayer.playerId }"
          >
            <span class="racing-room-player-slot">P{{ player.slot + 1 }}</span>
            <span class="racing-room-player-name">{{ player.name }}</span>
            <span class="racing-room-player-state">{{ player.id === multiplayer.playerId ? 'You' : 'Online' }}</span>
          </div>
        </div>
      </section>

      <div v-if="minimapEnabled" class="racing-inset racing-minimap-overlay" :style="panelStyle(minimapPanel)">
        <div class="racing-minimap-window" :style="minimapWindowStyle" />
      </div>

      <div
        v-if="previewEnabled"
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
