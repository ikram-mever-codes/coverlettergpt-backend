import { prisma } from 'wasp/server'

import { getCoverLetter } from '../../../../../src/server/queries.js'


export default async function (args, context) {
  return (getCoverLetter as any)(args, {
    ...context,
    entities: {
      CoverLetter: prisma.coverLetter,
    },
  })
}
