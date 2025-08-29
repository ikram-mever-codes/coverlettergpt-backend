import { prisma } from 'wasp/server'

import { deleteJob } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (deleteJob as any)(args, {
    ...context,
    entities: {
      Job: prisma.job,
    },
  })
}
