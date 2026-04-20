import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { RoomStateError, syncRoomSession } from '../../../utils/rooms'

export default defineEventHandler(async (event) => {
  try {
    const roomId = getRouterParam(event, 'roomId') ?? ''
    const body = await readBody(event)
    return syncRoomSession(roomId, body ?? {})
  }
  catch (error) {
    if (error instanceof RoomStateError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
      })
    }

    throw error
  }
})
