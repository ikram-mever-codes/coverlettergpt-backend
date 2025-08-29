import { prisma } from 'wasp/server'

import { updateLnPayment } from '../../../../../src/server/ln.js'


export default async function (args, context) {
  return (updateLnPayment as any)(args, {
    ...context,
    entities: {
      LnPayment: prisma.lnPayment,
    },
  })
}
