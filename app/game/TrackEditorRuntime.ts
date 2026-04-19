import {
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OrthographicCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  type Camera,
  type Material,
} from 'three'
import { loadModels } from './assets'
import {
  CELL_RAW,
  GRID_SCALE,
  ORIENT_DEG,
  decodeCells,
  encodeCells,
  type OrientKey,
  type TrackCell,
  type TrackPieceType,
} from './Track'

export type EditorTool = 'road' | 'erase'

type AutoTileTrackType = 'track-straight' | 'track-corner'
type AutoTileChoice = [type: AutoTileTrackType, orient: OrientKey]
type EditorModelMap = Partial<Record<TrackPieceType, Group>>

interface TrackEditorRuntimeOptions {
  scene: Scene
  camera: Camera
  canvas: HTMLCanvasElement
  initialMap: string | null
  showToast: (message: string) => void
}

interface GridCoord {
  gx: number
  gz: number
}

interface PointerState {
  x: number
  y: number
}

interface EditorCell {
  type: TrackPieceType
  orient: OrientKey
  isFinish: boolean
  mesh: Group | null
}

interface GhostNeighborBackup {
  cell: EditorCell
}

interface ExitCell {
  type: TrackPieceType | AutoTileTrackType
  orient: OrientKey
}

interface DirInfo {
  bit: number
  dx: number
  dz: number
}

type ListenerCleanup = () => void
type AddListenerTarget = Window | HTMLCanvasElement

const ORIENT_FLIP: Record<OrientKey, OrientKey> = { 0: 10, 10: 0, 16: 22, 22: 16 }

const AUTOTILE: AutoTileChoice[] = [
  ['track-straight', 0],
  ['track-straight', 16],
  ['track-straight', 16],
  ['track-straight', 16],
  ['track-straight', 0],
  ['track-corner', 0],
  ['track-corner', 16],
  ['track-straight', 16],
  ['track-straight', 0],
  ['track-corner', 22],
  ['track-corner', 10],
  ['track-straight', 16],
  ['track-straight', 0],
  ['track-straight', 0],
  ['track-straight', 0],
  ['track-straight', 0],
]

const DIR_INFO: DirInfo[] = [
  { bit: 8, dx: 0, dz: -1 },
  { bit: 4, dx: 0, dz: 1 },
  { bit: 2, dx: 1, dz: 0 },
  { bit: 1, dx: -1, dz: 0 },
]

function cellKey(gx: number, gz: number): string {
  return `${gx},${gz}`
}

function bitCount(mask: number): number {
  return ((mask >> 3) & 1) + ((mask >> 2) & 1) + ((mask >> 1) & 1) + (mask & 1)
}

function disposeGhostObject(object: Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return
    }

    const material = child.material

    if (Array.isArray(material)) {
      for (const item of material) {
        item?.dispose()
      }
      return
    }

    material.dispose()
  })
}

export class TrackEditorRuntime {
  scene: Scene
  private cameraInput: Camera
  camera!: OrthographicCamera
  canvas: HTMLCanvasElement
  initialMap: string | null
  showToast: (message: string) => void
  frustum = 30
  cellWorld = CELL_RAW * GRID_SCALE
  models: EditorModelMap = {}
  grid = new Map<string, EditorCell>()
  tool: EditorTool = 'road'

  trackGroup = new Group()
  ghostGroup = new Group()
  camTarget = new Vector3()
  raycaster = new Raycaster()
  mouse = new Vector2()
  pickPlane = new Plane(new Vector3(0, 1, 0), 0.51)

  dirLight: DirectionalLight | null = null
  hemiLight: HemisphereLight | null = null
  ground: Mesh<PlaneGeometry, MeshStandardMaterial> | null = null
  gridHelper: GridHelper | null = null

  listeners: ListenerCleanup[] = []
  ghostNeighborBackups: GhostNeighborBackup[] = []
  hoveredCell: GridCoord | null = null

  isPanning = false
  isDrawing = false
  isErasing = false
  panStart = { x: 0, y: 0 }
  camStart = { x: 0, z: 0 }
  lastDrawCell: GridCoord | null = null
  spaceDown = false
  pointers = new Map<number, PointerState>()
  pinchStartDist = 0
  pinchStartZoom = 1

  constructor({ scene, camera, canvas, initialMap, showToast }: TrackEditorRuntimeOptions) {
    this.scene = scene
    this.cameraInput = camera
    this.canvas = canvas
    this.initialMap = initialMap
    this.showToast = showToast
  }

  async init(): Promise<void> {
    if (!(this.cameraInput instanceof OrthographicCamera)) {
      throw new Error('TresJS editor camera is unavailable.')
    }

    this.camera = this.cameraInput
    this.canvas.style.touchAction = 'none'
    this.setupScene()

    const loadedModels = await loadModels()
    this.models = {
      'track-straight': loadedModels['track-straight'],
      'track-corner': loadedModels['track-corner'],
      'track-bump': loadedModels['track-bump'],
      'track-finish': loadedModels['track-finish'],
    }

    this.loadSaved()

    if (this.grid.size === 0) {
      this.placeFinish()
    }

    this.attachInput()
  }

  dispose(): void {
    for (const cleanup of this.listeners.splice(0)) {
      cleanup()
    }

    this.clearGhost()
    this.canvas.style.cursor = ''

    for (const [key, cell] of this.grid) {
      if (cell.mesh) {
        this.trackGroup.remove(cell.mesh)
      }
      this.grid.delete(key)
    }

    for (const object of [
      this.trackGroup,
      this.ghostGroup,
      this.gridHelper,
      this.ground,
      this.dirLight,
      this.hemiLight,
    ]) {
      if (object) {
        this.scene.remove(object)
      }
    }
  }

  setupScene(): void {
    this.scene.background = new Color(0xadb2ba)
    this.scene.fog = new Fog(0xadb2ba, 80, 160)

    this.dirLight = new DirectionalLight(0xffffff, 5)
    this.dirLight.position.set(11.4, 15, -5.3)
    this.dirLight.castShadow = true
    this.dirLight.shadow.mapSize.setScalar(4096)
    this.dirLight.shadow.camera.near = 0.5
    this.dirLight.shadow.camera.far = 100
    this.dirLight.shadow.camera.left = -60
    this.dirLight.shadow.camera.right = 60
    this.dirLight.shadow.camera.top = 60
    this.dirLight.shadow.camera.bottom = -60
    this.scene.add(this.dirLight)

    this.hemiLight = new HemisphereLight(0xc8d8e8, 0x7a8a5a, 1.5)
    this.scene.add(this.hemiLight)

    const groundMat = new MeshStandardMaterial({ color: 0x369069, metalness: 0 })
    this.ground = new Mesh(new PlaneGeometry(200, 200), groundMat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = -0.14
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    this.gridHelper = new GridHelper(this.cellWorld * 30, 30, 0x4a7a2a, 0x4a7a2a)
    this.gridHelper.position.y = -0.49
    const gridMaterials = Array.isArray(this.gridHelper.material)
      ? this.gridHelper.material
      : [this.gridHelper.material]
    for (const material of gridMaterials) {
      const transparentMaterial = material as Material & { opacity: number, transparent: boolean }
      transparentMaterial.opacity = 0.3
      transparentMaterial.transparent = true
    }
    this.scene.add(this.gridHelper)

    this.trackGroup.position.y = -0.5
    this.trackGroup.scale.setScalar(GRID_SCALE)
    this.scene.add(this.trackGroup)

    this.ghostGroup.position.y = -0.5
    this.ghostGroup.scale.setScalar(GRID_SCALE)
    this.scene.add(this.ghostGroup)

    const cellCenter = 0.5 * CELL_RAW * GRID_SCALE
    this.camTarget.set(cellCenter, 0, cellCenter)
    this.camera.position.set(cellCenter, 50, cellCenter)
    this.camera.lookAt(cellCenter, 0, cellCenter)
    this.updateCameraFrustum()
  }

  updateCameraFrustum(): void {
    const aspect = window.innerWidth / window.innerHeight
    this.camera.left = -this.frustum * aspect
    this.camera.right = this.frustum * aspect
    this.camera.top = this.frustum
    this.camera.bottom = -this.frustum
    this.camera.near = 0.1
    this.camera.far = 200
    this.camera.updateProjectionMatrix()
  }

  addListener<TEvent extends Event>(
    target: AddListenerTarget,
    type: string,
    handler: (event: TEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    const listener: EventListener = event => handler(event as TEvent)
    target.addEventListener(type, listener, options)
    this.listeners.push(() => target.removeEventListener(type, listener, options))
  }

  selectTool(tool: EditorTool): void {
    this.tool = tool
  }

  getCellExits(cell: ExitCell): number {
    const { type, orient } = cell

    if (type === 'track-corner') {
      if (orient === 0) return 5
      if (orient === 16) return 6
      if (orient === 10) return 10
      if (orient === 22) return 9
    }

    if (orient === 0 || orient === 10) return 12
    return 3
  }

  getConnectivityMask(gx: number, gz: number): number {
    let mask = 0

    const north = this.grid.get(cellKey(gx, gz - 1))
    if (north && (this.getCellExits(north) & 4)) mask |= 8

    const south = this.grid.get(cellKey(gx, gz + 1))
    if (south && (this.getCellExits(south) & 8)) mask |= 4

    const east = this.grid.get(cellKey(gx + 1, gz))
    if (east && (this.getCellExits(east) & 1)) mask |= 2

    const west = this.grid.get(cellKey(gx - 1, gz))
    if (west && (this.getCellExits(west) & 2)) mask |= 1

    return mask
  }

  getPresenceMask(gx: number, gz: number): number {
    let mask = 0
    if (this.grid.has(cellKey(gx, gz - 1))) mask |= 8
    if (this.grid.has(cellKey(gx, gz + 1))) mask |= 4
    if (this.grid.has(cellKey(gx + 1, gz))) mask |= 2
    if (this.grid.has(cellKey(gx - 1, gz))) mask |= 1
    return mask
  }

  connectedExitCount(gx: number, gz: number): number {
    const cell = this.grid.get(cellKey(gx, gz))
    if (!cell) {
      return 0
    }

    return bitCount(this.getCellExits(cell) & this.getConnectivityMask(gx, gz))
  }

  pickBestPair(mask: number, gx: number, gz: number): number {
    const active = DIR_INFO.filter(dir => mask & dir.bit)
    if (active.length <= 2) {
      return mask
    }

    let bestMask = active[0]!.bit | active[1]!.bit
    let bestScore = -1
    let bestIsCorner = false

    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const first = active[i]!
        const second = active[j]!
        const pairMask = first.bit | second.bit
        const isCorner = pairMask !== 3 && pairMask !== 12
        const score = this.connectedExitCount(gx + first.dx, gz + first.dz)
          + this.connectedExitCount(gx + second.dx, gz + second.dz)

        if ((isCorner && !bestIsCorner) || (isCorner === bestIsCorner && score > bestScore)) {
          bestMask = pairMask
          bestScore = score
          bestIsCorner = isCorner
        }
      }
    }

    return bestMask
  }

  getAvailableMask(gx: number, gz: number): number {
    let mask = 0
    const dirs: Array<[dx: number, dz: number, bit: number, oppBit: number]> = [
      [0, -1, 8, 4],
      [0, 1, 4, 8],
      [1, 0, 2, 1],
      [-1, 0, 1, 2],
    ]

    for (const [dx, dz, bit, oppBit] of dirs) {
      const neighbor = this.grid.get(cellKey(gx + dx, gz + dz))
      if (!neighbor) {
        continue
      }

      const exits = this.getCellExits(neighbor)

      if (exits & oppBit) {
        mask |= bit
        continue
      }

      const conn = this.getConnectivityMask(gx + dx, gz + dz)
      if (bitCount(exits & conn) < 2) {
        mask |= bit
      }
    }

    return mask
  }

  resolveNewTile(gx: number, gz: number): AutoTileChoice {
    const presenceMask = this.getAvailableMask(gx, gz)

    if (bitCount(presenceMask) >= 3) {
      return AUTOTILE[this.pickBestPair(presenceMask, gx, gz)] ?? AUTOTILE[0]!
    }

    return AUTOTILE[presenceMask] ?? AUTOTILE[0]!
  }

  resolveTile(gx: number, gz: number): AutoTileChoice {
    const connectivityMask = this.getConnectivityMask(gx, gz)

    if (connectivityMask !== 0) {
      return AUTOTILE[connectivityMask] ?? AUTOTILE[0]!
    }

    const presenceMask = this.getPresenceMask(gx, gz)
    if (presenceMask !== 0) {
      const dirs: Array<[dx: number, dz: number, bit: number]> = [[0, -1, 8], [0, 1, 4], [1, 0, 2], [-1, 0, 1]]

      for (const [dx, dz, bit] of dirs) {
        if (!(presenceMask & bit)) {
          continue
        }

        const neighbor = this.grid.get(cellKey(gx + dx, gz + dz))
        if (!neighbor) {
          continue
        }

        const exits = this.getCellExits(neighbor)
        if (exits & 12) return ['track-straight', 0]
        if (exits & 3) return ['track-straight', 16]
      }
    }

    return AUTOTILE[0]!
  }

  placeMesh(gx: number, gz: number, cell: EditorCell): void {
    if (cell.mesh) {
      this.trackGroup.remove(cell.mesh)
    }

    const src = this.models[cell.type]
    if (!src) {
      return
    }

    const mesh = src.clone()
    mesh.position.set((gx + 0.5) * CELL_RAW, 0.5, (gz + 0.5) * CELL_RAW)
    mesh.rotation.y = MathUtils.degToRad(ORIENT_DEG[cell.orient])

    mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    this.trackGroup.add(mesh)
    cell.mesh = mesh
  }

  resolveCell(gx: number, gz: number): void {
    const key = cellKey(gx, gz)
    const cell = this.grid.get(key)

    if (!cell) {
      return
    }

    let baseType: AutoTileTrackType
    let orient: OrientKey

    if (!cell.mesh) {
      [baseType, orient] = this.resolveNewTile(gx, gz)
    }
    else {
      const connectivityMask = this.getConnectivityMask(gx, gz)
      const currentExits = this.getCellExits(cell)
      const currentConnected = currentExits & connectivityMask
      ;[baseType, orient] = this.resolveTile(gx, gz)

      const proposedExits = this.getCellExits({ type: baseType, orient })
      if ((proposedExits & currentConnected) !== currentConnected) {
        return
      }
    }

    const type: TrackPieceType = cell.isFinish && baseType === 'track-straight' ? 'track-finish' : baseType
    if (cell.type === type && cell.orient === orient && cell.mesh) {
      return
    }

    cell.type = type
    cell.orient = orient
    this.placeMesh(gx, gz, cell)
  }

  resolveCellAndNeighbors(gx: number, gz: number): void {
    this.resolveCell(gx, gz)
    this.resolveCell(gx, gz - 1)
    this.resolveCell(gx, gz + 1)
    this.resolveCell(gx + 1, gz)
    this.resolveCell(gx - 1, gz)
  }

  placeRoad(gx: number, gz: number): void {
    const key = cellKey(gx, gz)

    if (this.grid.has(key)) {
      const cell = this.grid.get(key)

      if (cell?.isFinish) {
        cell.orient = ORIENT_FLIP[cell.orient]
        this.placeMesh(gx, gz, cell)
        this.save()
      }

      return
    }

    this.grid.set(key, { type: 'track-straight', orient: 0, isFinish: false, mesh: null })
    this.resolveCellAndNeighbors(gx, gz)
    this.save()
  }

  placeFinish(): void {
    const cell: EditorCell = { type: 'track-finish', orient: 0, isFinish: true, mesh: null }
    this.grid.set(cellKey(0, 0), cell)
    this.placeMesh(0, 0, cell)
  }

  eraseRoad(gx: number, gz: number): void {
    const key = cellKey(gx, gz)
    const cell = this.grid.get(key)
    if (!cell || cell.isFinish) {
      return
    }

    if (cell.mesh) {
      this.trackGroup.remove(cell.mesh)
    }

    this.grid.delete(key)
    this.resolveCell(gx, gz - 1)
    this.resolveCell(gx, gz + 1)
    this.resolveCell(gx + 1, gz)
    this.resolveCell(gx - 1, gz)
    this.save()
  }

  clearAll(): void {
    for (const [, cell] of this.grid) {
      if (cell.mesh) {
        this.trackGroup.remove(cell.mesh)
      }
    }

    this.grid.clear()
    this.placeFinish()
    this.save()
  }

  addGhostPiece(type: TrackPieceType, orient: OrientKey, gx: number, gz: number, opacity: number): void {
    const src = this.models[type]
    if (!src) {
      return
    }

    const mesh = src.clone()
    mesh.position.set((gx + 0.5) * CELL_RAW, 0.5, (gz + 0.5) * CELL_RAW)
    mesh.rotation.y = MathUtils.degToRad(ORIENT_DEG[orient])

    mesh.traverse((child) => {
      if (!(child instanceof Mesh)) {
        return
      }

      if (Array.isArray(child.material)) {
        child.material = child.material.map((item) => {
          const cloned = item.clone()
          cloned.transparent = true
          cloned.opacity = opacity
          return cloned
        })
        return
      }

      child.material = child.material.clone()
      child.material.transparent = true
      child.material.opacity = opacity
    })

    this.ghostGroup.add(mesh)
  }

  updateGhost(gx: number, gz: number): void {
    this.clearGhost()

    if (this.tool === 'erase') {
      return
    }

    const key = cellKey(gx, gz)
    if (this.grid.has(key)) {
      return
    }

    const ghostCell: EditorCell = { type: 'track-straight', orient: 0, isFinish: false, mesh: null }
    this.grid.set(key, ghostCell)

    const [type, orient] = this.resolveNewTile(gx, gz)
    ghostCell.type = type
    ghostCell.orient = orient
    this.addGhostPiece(type, orient, gx, gz, 0.4)

    const neighbors: Array<[number, number]> = [[gx, gz - 1], [gx, gz + 1], [gx + 1, gz], [gx - 1, gz]]

    for (const [nx, nz] of neighbors) {
      const neighbor = this.grid.get(cellKey(nx, nz))
      if (!neighbor) {
        continue
      }

      const neighborExits = this.getCellExits(neighbor)
      const neighborConnected = neighborExits & this.getConnectivityMask(nx, nz)
      const [newType, newOrient] = this.resolveTile(nx, nz)
      const proposedExits = this.getCellExits({ type: newType, orient: newOrient })

      if ((proposedExits & neighborConnected) !== neighborConnected) {
        continue
      }

      const finalType: TrackPieceType = neighbor.isFinish && newType === 'track-straight' ? 'track-finish' : newType

      if (finalType !== neighbor.type || newOrient !== neighbor.orient) {
        if (neighbor.mesh) {
          neighbor.mesh.visible = false
          this.ghostNeighborBackups.push({ cell: neighbor })
        }

        this.addGhostPiece(finalType, newOrient, nx, nz, 0.7)
      }
    }

    this.grid.delete(key)
  }

  clearGhost(): void {
    for (const { cell } of this.ghostNeighborBackups) {
      if (cell.mesh) {
        cell.mesh.visible = true
      }
    }

    this.ghostNeighborBackups.length = 0

    while (this.ghostGroup.children.length > 0) {
      const child = this.ghostGroup.children[0]
      if (!child) {
        break
      }
      this.ghostGroup.remove(child)
      disposeGhostObject(child)
    }
  }

  screenToGrid(clientX: number, clientY: number): GridCoord | null {
    this.mouse.x = (clientX / window.innerWidth) * 2 - 1
    this.mouse.y = -(clientY / window.innerHeight) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)

    const hit = new Vector3()
    if (!this.raycaster.ray.intersectPlane(this.pickPlane, hit)) {
      return null
    }

    return {
      gx: Math.floor(hit.x / this.cellWorld),
      gz: Math.floor(hit.z / this.cellWorld),
    }
  }

  save(): void {
    const encoded = encodeCells(this.getCellsArray())
    localStorage.setItem('racing-editor-cells', encoded)
  }

  loadSaved(): void {
    const encoded = this.initialMap ?? localStorage.getItem('racing-editor-cells')
    if (!encoded) {
      return
    }

    try {
      const cells = decodeCells(encoded)

      for (const [gx, gz, type, orient] of cells) {
        const cell: EditorCell = { type, orient, isFinish: type === 'track-finish', mesh: null }
        this.grid.set(cellKey(gx, gz), cell)
        this.placeMesh(gx, gz, cell)
      }
    }
    catch (error) {
      console.warn('Failed to load saved map', error)
    }
  }

  getCellsArray(): TrackCell[] {
    const cells: TrackCell[] = []

    for (const [key, cell] of this.grid) {
      const [gxRaw, gzRaw] = key.split(',')
      const gx = Number(gxRaw)
      const gz = Number(gzRaw)
      cells.push([gx, gz, cell.type, cell.orient])
    }

    return cells
  }

  getTrackUrl(): string {
    const encoded = encodeCells(this.getCellsArray())
    const url = new URL(window.location.href)
    url.pathname = url.pathname.replace(/\/editor\/?$/, '/')
    url.search = `?map=${encoded}`
    url.hash = ''
    return url.toString()
  }

  playTrack(): void {
    if (this.grid.size === 0) {
      this.showToast('Draw some road first!')
      return
    }

    window.open(this.getTrackUrl(), '_blank', 'noopener')
  }

  async shareTrack(): Promise<void> {
    if (this.grid.size === 0) {
      this.showToast('Draw some road first!')
      return
    }

    const url = this.getTrackUrl()

    try {
      await navigator.clipboard.writeText(url)
      this.showToast('Link copied to clipboard!')
    }
    catch {
      this.showToast(url)
    }
  }

  handleDraw(clientX: number, clientY: number): void {
    const cell = this.screenToGrid(clientX, clientY)
    if (!cell) {
      return
    }

    if (this.lastDrawCell && this.lastDrawCell.gx === cell.gx && this.lastDrawCell.gz === cell.gz) {
      return
    }

    this.lastDrawCell = cell

    if (this.isErasing) {
      this.eraseRoad(cell.gx, cell.gz)
    }
    else if (this.isDrawing) {
      this.placeRoad(cell.gx, cell.gz)
    }
  }

  getPinchDist(): number {
    const points = [...this.pointers.values()]
    const first = points[0]!
    const second = points[1]!
    const dx = second.x - first.x
    const dy = second.y - first.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  getPinchMid(): PointerState {
    const points = [...this.pointers.values()]
    const first = points[0]!
    const second = points[1]!
    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    }
  }

  attachInput(): void {
    const canvas = this.canvas

    const onResize = (): void => {
      this.updateCameraFrustum()
    }

    const onContextMenu = (event: MouseEvent): void => {
      event.preventDefault()
    }

    const onPointerDown = (event: PointerEvent): void => {
      canvas.setPointerCapture(event.pointerId)
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (this.pointers.size === 2) {
        this.isDrawing = false
        this.isErasing = false
        this.isPanning = true

        const mid = this.getPinchMid()
        this.panStart.x = mid.x
        this.panStart.y = mid.y
        this.camStart.x = this.camTarget.x
        this.camStart.z = this.camTarget.z
        this.pinchStartDist = this.getPinchDist()
        this.pinchStartZoom = this.camera.zoom
        return
      }

      if (this.pointers.size > 2) {
        return
      }

      if (event.button === 1 || (event.button === 0 && (event.ctrlKey || event.metaKey || this.spaceDown))) {
        this.isPanning = true
        this.panStart.x = event.clientX
        this.panStart.y = event.clientY
        this.camStart.x = this.camTarget.x
        this.camStart.z = this.camTarget.z
        canvas.style.cursor = 'grabbing'
        return
      }

      if (event.button === 0) {
        if (this.tool === 'erase') {
          this.isErasing = true
        }
        else {
          this.isDrawing = true
        }

        this.lastDrawCell = null

        if (event.pointerType !== 'touch') {
          this.handleDraw(event.clientX, event.clientY)
        }
      }
      else if (event.button === 2) {
        this.isErasing = true
        this.lastDrawCell = null
        this.handleDraw(event.clientX, event.clientY)
      }
    }

    const onPointerMove = (event: PointerEvent): void => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

      if (this.pointers.size === 2 && this.isPanning) {
        const mid = this.getPinchMid()
        const scale = this.frustum * 2 / window.innerHeight / this.camera.zoom
        this.camTarget.x = this.camStart.x - (mid.x - this.panStart.x) * scale
        this.camTarget.z = this.camStart.z - (mid.y - this.panStart.y) * scale
        this.camera.position.x = this.camTarget.x
        this.camera.position.z = this.camTarget.z
        this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z)

        const dist = this.getPinchDist()
        this.camera.zoom = Math.max(0.1, Math.min(10, this.pinchStartZoom * (dist / this.pinchStartDist)))
        this.camera.updateProjectionMatrix()
        return
      }

      if (this.isPanning) {
        const zoom = this.camera.zoom
        const dx = (event.clientX - this.panStart.x) / window.innerWidth * this.frustum * 2 * (window.innerWidth / window.innerHeight) / zoom
        const dz = (event.clientY - this.panStart.y) / window.innerHeight * this.frustum * 2 / zoom
        this.camTarget.x = this.camStart.x - dx
        this.camTarget.z = this.camStart.z - dz
        this.camera.position.x = this.camTarget.x
        this.camera.position.z = this.camTarget.z
        this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z)
        return
      }

      if (this.isDrawing || this.isErasing) {
        this.handleDraw(event.clientX, event.clientY)
        return
      }

      if (event.pointerType === 'mouse') {
        const cell = this.screenToGrid(event.clientX, event.clientY)

        if (cell) {
          this.hoveredCell = cell
          this.updateGhost(cell.gx, cell.gz)
        }
        else {
          this.hoveredCell = null
          this.clearGhost()
        }
      }
    }

    const onPointerUp = (event: PointerEvent): void => {
      this.pointers.delete(event.pointerId)

      if (this.pointers.size === 0) {
        if ((this.isDrawing || this.isErasing) && this.lastDrawCell === null && !this.isPanning) {
          this.handleDraw(event.clientX, event.clientY)
        }

        this.isPanning = false
        this.isDrawing = false
        this.isErasing = false
        this.lastDrawCell = null
        canvas.style.cursor = this.spaceDown ? 'grab' : ''
      }
    }

    const onPointerCancel = (event: PointerEvent): void => {
      this.pointers.delete(event.pointerId)
    }

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()

      if (event.ctrlKey) {
        const zoomSpeed = 1.02
        this.camera.zoom *= event.deltaY > 0 ? 1 / zoomSpeed : zoomSpeed
        this.camera.zoom = Math.max(0.1, Math.min(10, this.camera.zoom))
        this.camera.updateProjectionMatrix()
      }
      else {
        const scale = this.frustum * 2 / window.innerHeight / this.camera.zoom
        this.camTarget.x += event.deltaX * scale
        this.camTarget.z += event.deltaY * scale
        this.camera.position.x = this.camTarget.x
        this.camera.position.z = this.camTarget.z
        this.camera.lookAt(this.camTarget.x, 0, this.camTarget.z)
      }
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === ' ') {
        if (!this.spaceDown) {
          this.spaceDown = true
          canvas.style.cursor = 'grab'
        }

        event.preventDefault()
      }
      else if (event.key === '1') {
        this.selectTool('road')
      }
      else if (event.key === '2') {
        this.selectTool('erase')
      }
    }

    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') {
        this.spaceDown = false
        if (!this.isPanning) {
          canvas.style.cursor = ''
        }
      }
    }

    this.addListener(window, 'resize', onResize)
    this.addListener(canvas, 'contextmenu', onContextMenu)
    this.addListener(canvas, 'pointerdown', onPointerDown)
    this.addListener(canvas, 'pointermove', onPointerMove)
    this.addListener(window, 'pointerup', onPointerUp)
    this.addListener(window, 'pointercancel', onPointerCancel)
    this.addListener(canvas, 'wheel', onWheel, { passive: false })
    this.addListener(window, 'keydown', onKeyDown)
    this.addListener(window, 'keyup', onKeyUp)
  }
}
