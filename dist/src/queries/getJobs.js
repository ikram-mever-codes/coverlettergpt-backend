import { prisma } from 'wasp/server';
import { getJobs } from '../../../../../src/server/queries.js';
export default async function (args, context) {
    return getJobs(args, {
        ...context,
        entities: {
            Job: prisma.job,
        },
    });
}
//# sourceMappingURL=getJobs.js.map