import { milliSatsToCents } from '../../../../../src/server/ln.js';
export default async function (args, context) {
    return milliSatsToCents(args, {
        ...context,
        entities: {},
    });
}
//# sourceMappingURL=milliSatsToCents.js.map