import { prisma } from 'wasp/server'

import { getCoverLetters } from '../../../../../src/server/queries.js'


export default async function (args, context) {
  return (getCoverLetters as any)(args, {
    ...context,
    entities: {
      CoverLetter: prisma.coverLetter,
    },
  })
}
