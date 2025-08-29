import { prisma } from 'wasp/server';
import { generateEdit } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return generateEdit(args, {
        ...context,
        entities: {
            CoverLetter: prisma.coverLetter,
            User: prisma.user,
            LnPayment: prisma.lnPayment,
        },
    });
}
//# sourceMappingURL=generateEdit.js.map