import { prisma } from 'wasp/server'

import { generateEdit } from '../../../../../src/server/actions.js'


export default async function (args, context) {
  return (generateEdit as any)(args, {
    ...context,
    entities: {
      CoverLetter: prisma.coverLetter,
      User: prisma.user,
      LnPayment: prisma.lnPayment,
    },
  })
}
