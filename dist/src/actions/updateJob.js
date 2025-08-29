import { prisma } from 'wasp/server';
import { updateJob } from '../../../../../src/server/actions.js';
export default async function (args, context) {
    return updateJob(args, {
        ...context,
        entities: {
            Job: prisma.job,
        },
    });
}
//# sourceMappingURL=updateJob.js.map