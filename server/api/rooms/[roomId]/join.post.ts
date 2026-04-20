import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { joinRoomSession, RoomStateError } from '../../../utils/rooms'

export default defineEventHandler(async (event) => {
  try {
    const roomId = getRouterParam(event, 'roomId') ?? ''
    const body = await readBody(event)
    return joinRoomSession(roomId, body ?? {})
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
