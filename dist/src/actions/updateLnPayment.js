import { prisma } from 'wasp/server';
import { updateLnPayment } from '../../../../../src/server/ln.js';
export default async function (args, context) {
    return updateLnPayment(args, {
        ...context,
        entities: {
            LnPayment: prisma.lnPayment,
        },
    });
}
//# sourceMappingURL=updateLnPayment.js.map