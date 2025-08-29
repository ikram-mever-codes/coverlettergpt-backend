/*
  These are "internal hook functions" based on the user defined hook functions.

  In the server code (e.g. email signup) we import these functions and call them.

  We want to pass extra params to the user defined hook functions, but we don't want to
  pass them when we call them in the server code.
*/
/**
 * This is a no-op function since the user didn't define the onBeforeSignup hook.
 */
export const onBeforeSignupHook = async (_params) => { };
/**
 * This is a no-op function since the user didn't define the onAfterSignup hook.
 */
export const onAfterSignupHook = async (_params) => { };
/**
 * This is a no-op function since the user didn't define the onAfterSignup hook.
 */
export const onAfterEmailVerifiedHook = async (_params) => { };
/**
 * This is an identity function since the user didn't define the onBeforeOAuthRedirect hook.
 */
export const onBeforeOAuthRedirectHook = async (params) => params;
/**
 * This is a no-op function since the user didn't define the onBeforeLogin hook.
 */
export const onBeforeLoginHook = async (_params) => { };
/**
 * This is a no-op function since the user didn't define the onAfterLogin hook.
 */
export const onAfterLoginHook = async (_params) => { };
//# sourceMappingURL=hooks.js.map