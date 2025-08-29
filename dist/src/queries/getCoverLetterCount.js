import { prisma } from 'wasp/server';
import { getCoverLetterCount } from '../../../../../src/server/queries.js';
export default async function (args, context) {
    return getCoverLetterCount(args, {
        ...context,
        entities: {
            CoverLetter: prisma.coverLetter,
        },
    });
}
//# sourceMappingURL=getCoverLetterCount.js.map