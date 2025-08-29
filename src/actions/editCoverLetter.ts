import { prisma } from 'wasp/server'

import { editCoverLetter } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (editCoverLetter as any)(args, {
    ...context,
    entities: {
      CoverLetter: prisma.coverLetter,
    },
  })
}
