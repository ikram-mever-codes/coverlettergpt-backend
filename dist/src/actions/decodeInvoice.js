import { decodeInvoice } from '../../../../../src/server/ln.js';
export default async function (args, context) {
    return decodeInvoice(args, {
        ...context,
        entities: {},
    });
}
//# sourceMappingURL=decodeInvoice.js.map