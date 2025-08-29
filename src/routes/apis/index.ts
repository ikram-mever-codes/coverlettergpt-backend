import express from "express";
import { prisma } from "wasp/server";
import { defineHandler } from "wasp/server/utils";
import {
  MiddlewareConfigFn,
  globalMiddlewareConfigForExpress,
} from "../../middleware/index.js";
import auth from "wasp/core/auth";
import { type AuthUserData, makeAuthUserIfPossible } from "wasp/auth/user";

import { stripeWebhook as _waspstripeWebhookfn } from "../../../../../../src/server/webhooks.js";
import { lnLogin as _wasplnLoginfn } from "../../../../../../src/server/ln.js";

const idFn: MiddlewareConfigFn = (x) => x;

const _waspstripeWebhookmiddlewareConfigFn = idFn;
const _wasplnLoginmiddlewareConfigFn = idFn;

const router = express.Router();

const stripeWebhookMiddleware = globalMiddlewareConfigForExpress(
  _waspstripeWebhookmiddlewareConfigFn
);
router.post(
  "/stripe-webhook",
  [auth, ...stripeWebhookMiddleware],
  defineHandler(
    (
      req: Parameters<typeof _waspstripeWebhookfn>[0] & {
        user: AuthUserData | null;
      },
      res: Parameters<typeof _waspstripeWebhookfn>[1]
    ) => {
      const context = {
        user: makeAuthUserIfPossible(req.user),
        entities: {
          User: prisma.user,
        },
      };
      return _waspstripeWebhookfn(req, res, context);
    }
  )
);
const lnLoginMiddleware = globalMiddlewareConfigForExpress(
  _wasplnLoginmiddlewareConfigFn
);
router.get(
  "/ln-login",
  [auth, ...lnLoginMiddleware],
  defineHandler(
    (
      req: Parameters<typeof _wasplnLoginfn>[0] & { user: AuthUserData | null },
      res: Parameters<typeof _wasplnLoginfn>[1]
    ) => {
      const context = {
        user: makeAuthUserIfPossible(req.user),
        entities: {
          User: prisma.user,
          LnData: prisma.lnData,
        },
      };
      return _wasplnLoginfn(req, res, context);
    }
  )
);

export default router;
