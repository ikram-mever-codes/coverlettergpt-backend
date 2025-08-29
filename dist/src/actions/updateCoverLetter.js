import { prisma } from 'wasp/server';
import { updateCoverLetter } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return updateCoverLetter(args, {
        ...context,
        entities: {
            Job: prisma.job,
            CoverLetter: prisma.coverLetter,
            User: prisma.user,
            LnPayment: prisma.lnPayment,
        },
    });
}
//# sourceMappingURL=updateCoverLetter.js.map