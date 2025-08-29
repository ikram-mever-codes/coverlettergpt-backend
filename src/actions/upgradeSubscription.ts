import { prisma } from 'wasp/server'

import { upgradeSubscription } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (upgradeSubscription as any)(args, {
    ...context,
    entities: {
      User: prisma.user,
    },
  })
}
