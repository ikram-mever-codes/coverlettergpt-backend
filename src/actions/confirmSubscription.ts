import { prisma } from 'wasp/server'

import { confirmSubscription } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (confirmSubscription as any)(args, {
    ...context,
    entities: {
      User: prisma.user,
    },
  })
}
