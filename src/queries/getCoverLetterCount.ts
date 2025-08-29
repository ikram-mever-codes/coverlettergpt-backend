import { prisma } from 'wasp/server'

import { getCoverLetterCount } from '../../../../../src/server/queries.js'


export default async function (args, context) {
  return (getCoverLetterCount as any)(args, {
    ...context,
    entities: {
      CoverLetter: prisma.coverLetter,
    },
  })
}
