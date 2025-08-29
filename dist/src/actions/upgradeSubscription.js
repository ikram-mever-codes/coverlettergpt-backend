import { prisma } from 'wasp/server';
import { upgradeSubscription } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return upgradeSubscription(args, {
        ...context,
        entities: {
            User: prisma.user,
        },
    });
}
//# sourceMappingURL=upgradeSubscription.js.map