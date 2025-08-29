import { prisma } from 'wasp/server'

import { fixUserPlan } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (fixUserPlan as any)(args, {
    ...context,
    entities: {
      User: prisma.user,
    },
  })
}
