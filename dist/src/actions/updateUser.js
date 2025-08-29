import { prisma } from 'wasp/server';
import { updateUser } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return updateUser(args, {
        ...context,
        entities: {
            User: prisma.user,
        },
    });
}
//# sourceMappingURL=updateUser.js.map