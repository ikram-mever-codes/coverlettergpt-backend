import { prisma } from 'wasp/server';
import { generateCoverLetter } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return generateCoverLetter(args, {
        ...context,
        entities: {
            CoverLetter: prisma.coverLetter,
            User: prisma.user,
            LnPayment: prisma.lnPayment,
        },
    });
}
//# sourceMappingURL=generateCoverLetter.js.map