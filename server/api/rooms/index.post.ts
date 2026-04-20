import { createError, defineEventHandler, readBody } from 'h3'
import { createRoomSession, RoomStateError } from '../../utils/rooms'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    return createRoomSession(body ?? {})
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
