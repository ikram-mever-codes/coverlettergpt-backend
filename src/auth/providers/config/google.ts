import type { ProviderConfig } from "wasp/auth/providers/types";
import { google } from "wasp/server/auth";

import { mergeDefaultAndUserConfig } from "../oauth/config";
import { createOAuthProviderRouter } from "../oauth/handler";

import { getUserFields } from "../../../../../../../src/server/auth";
const _waspUserSignupFields = getUserFields;
import { config } from "../../../../../../../src/server/auth";
const _waspUserDefinedConfigFn = config;

const _waspConfig: ProviderConfig = {
  id: google.id,
  displayName: google.displayName,
  createRouter(provider) {
    const config = mergeDefaultAndUserConfig(
      {
        scopes: ["profile"],
      },
      _waspUserDefinedConfigFn
    );

    async function getGoogleProfile(accessToken: string): Promise<{
      providerProfile: unknown;
      providerUserId: string;
    }> {
      const response = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const providerProfile = (await response.json()) as {
        sub?: string;
      };

      if (!providerProfile.sub) {
        throw new Error("Invalid profile");
      }

      return { providerProfile, providerUserId: providerProfile.sub };
    }

    return createOAuthProviderRouter({
      provider,
      oAuthType: "OAuth2WithPKCE",
      userSignupFields: _waspUserSignupFields,
      getAuthorizationUrl: ({ state, codeVerifier }) =>
        google.oAuthClient.createAuthorizationURL(state, codeVerifier, config),
      getProviderTokens: ({ code, codeVerifier }) =>
        google.oAuthClient.validateAuthorizationCode(code, codeVerifier),
      getProviderInfo: ({ accessToken }) => getGoogleProfile(accessToken),
    });
  },
};

export default _waspConfig;
