import { prisma } from 'wasp/server';
import { getCoverLetter } from '../../../../../src/server/queries.js';
export default async function (args, context) {
    return getCoverLetter(args, {
        ...context,
        entities: {
            CoverLetter: prisma.coverLetter,
        },
    });
}
//# sourceMappingURL=getCoverLetter.js.map