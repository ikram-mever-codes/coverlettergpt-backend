import { prisma } from 'wasp/server'

import { getJobs } from '../../../../../src/server/queries.js'


export default async function (args, context) {
  return (getJobs as any)(args, {
    ...context,
    entities: {
      Job: prisma.job,
    },
  })
}
