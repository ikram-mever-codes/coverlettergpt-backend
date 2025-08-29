import { prisma } from 'wasp/server'

import { updateJob } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (updateJob as any)(args, {
    ...context,
    entities: {
      Job: prisma.job,
    },
  })
}
