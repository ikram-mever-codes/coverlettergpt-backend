import { prisma } from 'wasp/server'

import { stripeCreditsPayment } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (stripeCreditsPayment as any)(args, {
    ...context,
    entities: {
      User: prisma.user,
    },
  })
}
