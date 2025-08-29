import { prisma } from 'wasp/server'

import { decodeInvoice } from '../../../../../src/server/ln.js'


export default async function (args, context) {
  return (decodeInvoice as any)(args, {
    ...context,
    entities: {
    },
  })
}
