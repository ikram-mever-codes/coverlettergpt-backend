import { prisma } from 'wasp/server';
import { createJob } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return createJob(args, {
        ...context,
        entities: {
            Job: prisma.job,
        },
    });
}
//# sourceMappingURL=createJob.js.map