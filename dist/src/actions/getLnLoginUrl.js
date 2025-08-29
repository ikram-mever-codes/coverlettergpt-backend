import { prisma } from 'wasp/server';
import { getLnLoginUrl } from '../../../../../src/server/ln.js';
export default async function (args, context) {
    return getLnLoginUrl(args, {
        ...context,
        entities: {
            User: prisma.user,
            LnData: prisma.lnData,
        },
    });
}
//# sourceMappingURL=getLnLoginUrl.js.map