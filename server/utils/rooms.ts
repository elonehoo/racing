const ROOM_ID_LENGTH = 5
const MAX_PLAYERS = 6
const PLAYER_TIMEOUT_MS = 15_000
const ROOM_TIMEOUT_MS = 60_000

export interface RoomPlayerStateInput {
  x?: unknown
  y?: unknown
  z?: unknown
  rotationY?: unknown
  speed?: unknown
  steering?: unknown
  drift?: unknown
}

export interface RoomPlayerSnapshot {
  id: string
  name: string
  slot: number
  x: number
  y: number
  z: number
  rotationY: number
  speed: number
  steering: number
  drift: number
  updatedAt: number
}

export interface RoomSessionSnapshot {
  roomId: string
  map: string | null
  maxPlayers: number
  player: {
    id: string
    name: string
    slot: number
  }
  players: RoomPlayerSnapshot[]
}

interface RoomPlayerRecord extends RoomPlayerSnapshot {
  lastSeenAt: number
}

interface RoomRecord {
  id: string
  map: string | null
  createdAt: number
  updatedAt: number
  players: Map<string, RoomPlayerRecord>
}

type GlobalRoomStore = typeof globalThis & {
  __racingRooms__?: Map<string, RoomRecord>
}

const roomStore = (globalThis as GlobalRoomStore).__racingRooms__
  ?? ((globalThis as GlobalRoomStore).__racingRooms__ = new Map<string, RoomRecord>())

export class RoomStateError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'RoomStateError'
    this.statusCode = statusCode
  }
}

export function createRoomSession(input: {
  map?: unknown
  playerName?: unknown
}): RoomSessionSnapshot {
  pruneRooms()

  const now = Date.now()
  const roomId = generateRoomId()
  const room: RoomRecord = {
    id: roomId,
    map: normalizeMap(input.map),
    createdAt: now,
    updatedAt: now,
    players: new Map(),
  }

  const player = createPlayerRecord(normalizePlayerName(input.playerName), 0, now)
  room.players.set(player.id, player)
  roomStore.set(roomId, room)

  return serializeRoom(room, player)
}

export function joinRoomSession(
  roomIdInput: string,
  input: {
    playerName?: unknown
  },
): RoomSessionSnapshot {
  pruneRooms()

  const roomId = normalizeRoomId(roomIdInput)
  const room = roomStore.get(roomId)
  if (!room) {
    throw new RoomStateError('Room not found.', 404)
  }

  const slot = allocateSlot(room)
  if (slot === null) {
    throw new RoomStateError('Room is full.', 409)
  }

  const now = Date.now()
  const player = createPlayerRecord(normalizePlayerName(input.playerName), slot, now)
  room.players.set(player.id, player)
  room.updatedAt = now

  return serializeRoom(room, player)
}

export function syncRoomSession(
  roomIdInput: string,
  input: {
    playerId?: unknown
    state?: RoomPlayerStateInput | null
  },
): RoomSessionSnapshot {
  pruneRooms()

  const roomId = normalizeRoomId(roomIdInput)
  const room = roomStore.get(roomId)
  if (!room) {
    throw new RoomStateError('Room not found.', 404)
  }

  const playerId = typeof input.playerId === 'string' ? input.playerId.trim() : ''
  if (!playerId) {
    throw new RoomStateError('Missing player session.', 400)
  }

  const player = room.players.get(playerId)
  if (!player) {
    throw new RoomStateError('Player session expired.', 404)
  }

  const now = Date.now()
  const state = input.state ?? {}
  player.x = toFiniteNumber(state.x, player.x)
  player.y = toFiniteNumber(state.y, player.y)
  player.z = toFiniteNumber(state.z, player.z)
  player.rotationY = toFiniteNumber(state.rotationY, player.rotationY)
  player.speed = toFiniteNumber(state.speed, player.speed)
  player.steering = toFiniteNumber(state.steering, player.steering)
  player.drift = toFiniteNumber(state.drift, player.drift)
  player.updatedAt = now
  player.lastSeenAt = now
  room.updatedAt = now

  return serializeRoom(room, player)
}

function serializeRoom(room: RoomRecord, player: RoomPlayerRecord): RoomSessionSnapshot {
  const players = [...room.players.values()]
    .sort((left, right) => left.slot - right.slot)
    .map(({ lastSeenAt: _lastSeenAt, ...snapshot }) => snapshot)

  return {
    roomId: room.id,
    map: room.map,
    maxPlayers: MAX_PLAYERS,
    player: {
      id: player.id,
      name: player.name,
      slot: player.slot,
    },
    players,
  }
}

function createPlayerRecord(name: string, slot: number, now: number): RoomPlayerRecord {
  return {
    id: createToken(10),
    name,
    slot,
    x: 0,
    y: 0.5,
    z: 0,
    rotationY: 0,
    speed: 0,
    steering: 0,
    drift: 0,
    updatedAt: now,
    lastSeenAt: now,
  }
}

function allocateSlot(room: RoomRecord): number | null {
  const used = new Set([...room.players.values()].map(player => player.slot))

  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    if (!used.has(slot)) {
      return slot
    }
  }

  return null
}

function pruneRooms(now = Date.now()): void {
  for (const [roomId, room] of roomStore) {
    for (const [playerId, player] of room.players) {
      if (now - player.lastSeenAt > PLAYER_TIMEOUT_MS) {
        room.players.delete(playerId)
      }
    }

    if (room.players.size === 0 && now - room.updatedAt > ROOM_TIMEOUT_MS) {
      roomStore.delete(roomId)
    }
  }
}

function normalizePlayerName(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim().slice(0, 18) : ''
  if (trimmed) {
    return trimmed
  }

  return `Driver ${Math.floor(100 + Math.random() * 900)}`
}

function normalizeMap(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return trimmed.slice(0, 4096)
}

function normalizeRoomId(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_ID_LENGTH)
}

function generateRoomId(): string {
  let candidate = createToken(ROOM_ID_LENGTH)

  while (roomStore.has(candidate)) {
    candidate = createToken(ROOM_ID_LENGTH)
  }

  return candidate
}

function createToken(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = ''

  for (let index = 0; index < length; index++) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]!
  }

  return token
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const next = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(next) ? next : fallback
}
