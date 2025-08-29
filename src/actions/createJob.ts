import { prisma } from 'wasp/server'

import { createJob } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (createJob as any)(args, {
    ...context,
    entities: {
      Job: prisma.job,
    },
  })
}
