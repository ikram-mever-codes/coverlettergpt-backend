import { prisma } from 'wasp/server';
import { stripePayment } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return stripePayment(args, {
        ...context,
        entities: {
            User: prisma.user,
        },
    });
}
//# sourceMappingURL=stripePayment.js.map