import type { VehicleModelName } from './Track'

export const ROOM_SYNC_INTERVAL_MS = 120

const VEHICLE_MODELS: VehicleModelName[] = [
  'vehicle-truck-yellow',
  'vehicle-truck-green',
  'vehicle-truck-purple',
  'vehicle-truck-red',
]

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

export interface RoomSessionResponse {
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

export function getVehicleModelForSlot(slot: number): VehicleModelName {
  return VEHICLE_MODELS[Math.abs(slot) % VEHICLE_MODELS.length]!
}

export function makeGuestName(): string {
  return `Driver ${Math.floor(100 + Math.random() * 900)}`
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}
