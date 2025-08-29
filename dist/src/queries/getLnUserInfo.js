import { prisma } from 'wasp/server';
import { getLnUserInfo } from '../../../../../src/server/ln.js';
export default async function (args, context) {
    return getLnUserInfo(args, {
        ...context,
        entities: {
            User: prisma.user,
            LnData: prisma.lnData,
        },
    });
}
//# sourceMappingURL=getLnUserInfo.js.map