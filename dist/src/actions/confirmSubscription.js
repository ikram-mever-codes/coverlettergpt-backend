import { prisma } from 'wasp/server';
import { confirmSubscription } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return confirmSubscription(args, {
        ...context,
        entities: {
            User: prisma.user,
        },
    });
}
//# sourceMappingURL=confirmSubscription.js.map