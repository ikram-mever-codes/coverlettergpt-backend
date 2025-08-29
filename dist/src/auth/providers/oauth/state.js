import * as arctic from 'arctic';
import { setOAuthCookieValue, getOAuthCookieValue } from './cookies.js';
export function generateAndStoreOAuthState({ oAuthType, provider, res, }) {
    const state = {
        ...generateState(),
        ...(oAuthType === 'OAuth2WithPKCE' && generateCodeVerifier()),
    };
    storeOAuthState(provider, res, state);
    return state;
}
export function validateAndGetOAuthState({ oAuthType, provider, req, }) {
    const state = {
        ...getCode(req),
        ...getState(req),
        ...(oAuthType === 'OAuth2WithPKCE' && getCodeVerifier(provider, req)),
    };
    validateOAuthState(provider, req, state);
    return state;
}
function storeOAuthState(provider, res, state) {
    let key;
    for (key in state) {
        setOAuthCookieValue(provider, res, key, state[key]);
    }
}
function validateOAuthState(provider, req, state) {
    if (typeof state.code !== 'string') {
        throw new Error('Invalid code');
    }
    const storedState = getOAuthCookieValue(provider, req, 'state');
    if (!state.state || !storedState || storedState !== state.state) {
        throw new Error('Invalid state');
    }
    if (isOAuthStateWithPKCE(state) && !state.codeVerifier) {
        throw new Error('Missing code verifier');
    }
}
function generateState() {
    return { state: arctic.generateState() };
}
function generateCodeVerifier() {
    return { codeVerifier: arctic.generateCodeVerifier() };
}
function getCode(req) {
    return { code: `${req.query.code}` };
}
function getState(req) {
    return { state: `${req.query.state}` };
}
function getCodeVerifier(provider, req) {
    const codeVerifier = getOAuthCookieValue(provider, req, 'codeVerifier');
    return { codeVerifier };
}
function isOAuthStateWithPKCE(state) {
    return 'codeVerifier' in state;
}
//# sourceMappingURL=state.js.map