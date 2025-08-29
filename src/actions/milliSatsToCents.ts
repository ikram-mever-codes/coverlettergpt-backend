import { prisma } from 'wasp/server'

import { milliSatsToCents } from '../../../../../src/server/ln.js'


export default async function (args, context) {
  return (milliSatsToCents as any)(args, {
    ...context,
    entities: {
    },
  })
}
