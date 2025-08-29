import { prisma } from 'wasp/server'

import { stripeGpt4Payment } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (stripeGpt4Payment as any)(args, {
    ...context,
    entities: {
      User: prisma.user,
    },
  })
}
