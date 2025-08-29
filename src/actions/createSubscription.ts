import { prisma } from 'wasp/server'

import { createSubscription } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (createSubscription as any)(args, {
    ...context,
    entities: {
      User: prisma.user,
    },
  })
}
