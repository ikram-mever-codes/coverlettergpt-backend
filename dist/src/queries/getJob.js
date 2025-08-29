import { prisma } from 'wasp/server';
import { getJob } from '../../../../../src/server/queries.js';
export default async function (args, context) {
    return getJob(args, {
        ...context,
        entities: {
            Job: prisma.job,
        },
    });
}
//# sourceMappingURL=getJob.js.map