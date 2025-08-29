import { prisma } from 'wasp/server';
import { getCoverLetters } from '../../../../../src/server/queries.js';
export default async function (args, context) {
    return getCoverLetters(args, {
        ...context,
        entities: {
            CoverLetter: prisma.coverLetter,
        },
    });
}
//# sourceMappingURL=getCoverLetters.js.map