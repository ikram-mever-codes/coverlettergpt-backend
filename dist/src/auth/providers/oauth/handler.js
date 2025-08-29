import { Router } from 'express';
import { defineHandler, redirect } from 'wasp/server/utils';
import { rethrowPossibleAuthError } from 'wasp/auth/utils';
import { generateAndStoreOAuthState, validateAndGetOAuthState, } from '../oauth/state.js';
import { finishOAuthFlowAndGetRedirectUri } from '../oauth/user.js';
import { callbackPath, loginPath, handleOAuthErrorAndGetRedirectUri, } from 'wasp/server/auth';
import { onBeforeOAuthRedirectHook } from '../../hooks.js';
export function createOAuthProviderRouter({ provider, oAuthType, userSignupFields, getAuthorizationUrl, getProviderTokens, getProviderInfo, }) {
    const router = Router();
    router.get(`/${loginPath}`, defineHandler(async (req, res) => {
        const oAuthState = generateAndStoreOAuthState({
            oAuthType,
            provider,
            res,
        });
        const redirectUrl = await getAuthorizationUrl(oAuthState);
        const { url: redirectUrlAfterHook } = await onBeforeOAuthRedirectHook({
            req,
            url: redirectUrl,
            oauth: { uniqueRequestId: oAuthState.state }
        });
        redirect(res, redirectUrlAfterHook.toString());
    }));
    router.get(`/${callbackPath}`, defineHandler(async (req, res) => {
        try {
            const oAuthState = validateAndGetOAuthState({
                oAuthType,
                provider,
                req,
            });
            const tokens = await getProviderTokens(oAuthState);
            const { providerProfile, providerUserId } = await getProviderInfo(tokens);
            try {
                const redirectUri = await finishOAuthFlowAndGetRedirectUri({
                    provider,
                    providerProfile,
                    providerUserId,
                    userSignupFields,
                    req,
                    oauth: {
                        uniqueRequestId: oAuthState.state,
                        // OAuth params are built as a discriminated union
                        // of provider names and their respective tokens.
                        // We are using a generic ProviderConfig and tokens type
                        // is inferred from the getProviderTokens function.
                        // Instead of building complex TS machinery to ensure that
                        // the providerName and tokens match, we are using any here.
                        providerName: provider.id,
                        tokens,
                    },
                });
                // Redirect to the client with the one time code
                redirect(res, redirectUri.toString());
            }
            catch (e) {
                rethrowPossibleAuthError(e);
            }
        }
        catch (e) {
            console.error(e);
            const redirectUri = handleOAuthErrorAndGetRedirectUri(e);
            // Redirect to the client with the error
            redirect(res, redirectUri.toString());
        }
    }));
    return router;
}
//# sourceMappingURL=handler.js.map