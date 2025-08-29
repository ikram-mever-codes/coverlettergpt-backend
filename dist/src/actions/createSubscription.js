import { prisma } from 'wasp/server';
import { createSubscription } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return createSubscription(args, {
        ...context,
        entities: {
            User: prisma.user,
        },
    });
}
//# sourceMappingURL=createSubscription.js.map