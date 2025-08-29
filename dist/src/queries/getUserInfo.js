import { prisma } from 'wasp/server';
import { getUserInfo } from '../../../../../src/server/queries.js';
export default async function (args, context) {
    return getUserInfo(args, {
        ...context,
        entities: {
            User: prisma.user,
        },
    });
}
//# sourceMappingURL=getUserInfo.js.map