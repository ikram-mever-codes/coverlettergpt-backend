import http from 'http';
import express, { Router } from 'express';
import * as z from 'zod';
import { z as z$1 } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { Lucia } from 'lucia';
import { PrismaAdapter } from '@lucia-auth/adapter-prisma';
import { hash } from '@node-rs/argon2';
import { registerCustom, deserialize, serialize } from 'superjson';
import fetch$1 from 'node-fetch';
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { randomBytes, createHash as createHash$1 } from 'crypto';
import lnurl from 'lnurl';
import bolt11 from 'bolt11';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import * as arctic from 'arctic';
import { Google } from 'arctic';
import * as jwt from 'oslo/jwt';
import { TimeSpan } from 'oslo';
import { parseCookies } from 'oslo/cookie';
import { createTransport } from 'nodemailer';
import PgBoss from 'pg-boss';

const colors = {
  red: "\x1B[31m",
  yellow: "\x1B[33m"
};
const resetColor = "\x1B[0m";
function getColorizedConsoleFormatString(colorKey) {
  const color = colors[colorKey];
  return `${color}%s${resetColor}`;
}

const redColorFormatString = getColorizedConsoleFormatString("red");
function ensureEnvSchema(data, schema) {
  const result = getValidatedEnvOrError(data, schema);
  if (result.success) {
    return result.data;
  } else {
    console.error(`${redColorFormatString}${formatZodEnvErrors(result.error.issues)}`);
    throw new Error("Error parsing environment variables");
  }
}
function getValidatedEnvOrError(env, schema) {
  return schema.safeParse(env);
}
function formatZodEnvErrors(issues) {
  const errorOutput = ["", "\u2550\u2550 Env vars validation failed \u2550\u2550", ""];
  for (const error of issues) {
    errorOutput.push(` - ${error.message}`);
  }
  errorOutput.push("");
  errorOutput.push("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
  return errorOutput.join("\n");
}

const userServerEnvSchema = z.object({});
const waspServerCommonSchema = z.object({
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string({
    required_error: "DATABASE_URL is required"
  }),
  PG_BOSS_NEW_OPTIONS: z.string().optional(),
  SMTP_HOST: z.string({
    required_error: getRequiredEnvVarErrorMessage("SMTP email sender", "SMTP_HOST")
  }),
  SMTP_PORT: z.coerce.number({
    required_error: getRequiredEnvVarErrorMessage("SMTP email sender", "SMTP_PORT"),
    invalid_type_error: "SMTP_PORT must be a number"
  }),
  SMTP_USERNAME: z.string({
    required_error: getRequiredEnvVarErrorMessage("SMTP email sender", "SMTP_USERNAME")
  }),
  SMTP_PASSWORD: z.string({
    required_error: getRequiredEnvVarErrorMessage("SMTP email sender", "SMTP_PASSWORD")
  }),
  SKIP_EMAIL_VERIFICATION_IN_DEV: z.enum(["true", "false"], {
    message: 'SKIP_EMAIL_VERIFICATION_IN_DEV must be either "true" or "false"'
  }).transform((value) => value === "true").default("false"),
  GOOGLE_CLIENT_ID: z.string({
    required_error: getRequiredEnvVarErrorMessage("Google auth provider", "GOOGLE_CLIENT_ID")
  }),
  GOOGLE_CLIENT_SECRET: z.string({
    required_error: getRequiredEnvVarErrorMessage("Google auth provider", "GOOGLE_CLIENT_SECRET")
  })
});
const serverUrlSchema = z.string({
  required_error: "WASP_SERVER_URL is required"
}).url({
  message: "WASP_SERVER_URL must be a valid URL"
});
const clientUrlSchema = z.string({
  required_error: "WASP_WEB_CLIENT_URL is required"
}).url({
  message: "WASP_WEB_CLIENT_URL must be a valid URL"
});
const jwtTokenSchema = z.string({
  required_error: "JWT_SECRET is required"
});
const serverDevSchema = z.object({
  NODE_ENV: z.literal("development"),
  WASP_SERVER_URL: serverUrlSchema.default("http://localhost:3001"),
  WASP_WEB_CLIENT_URL: clientUrlSchema.default("http://localhost:3000/"),
  JWT_SECRET: jwtTokenSchema.default("DEVJWTSECRET")
});
const serverProdSchema = z.object({
  NODE_ENV: z.literal("production"),
  WASP_SERVER_URL: serverUrlSchema,
  WASP_WEB_CLIENT_URL: clientUrlSchema,
  JWT_SECRET: jwtTokenSchema
});
const serverCommonSchema = userServerEnvSchema.merge(waspServerCommonSchema);
const serverEnvSchema = z.discriminatedUnion("NODE_ENV", [
  serverDevSchema.merge(serverCommonSchema),
  serverProdSchema.merge(serverCommonSchema)
]);
const env = ensureEnvSchema({ NODE_ENV: serverDevSchema.shape.NODE_ENV.value, ...process.env }, serverEnvSchema);
function getRequiredEnvVarErrorMessage(featureName, envVarName) {
  return `${envVarName} is required when using ${featureName}`;
}

function stripTrailingSlash(url) {
  return url?.replace(/\/$/, "");
}

const frontendUrl = stripTrailingSlash(env.WASP_WEB_CLIENT_URL);
const serverUrl = stripTrailingSlash(env.WASP_SERVER_URL);
const allowedCORSOriginsPerEnv = {
  development: "*",
  production: [frontendUrl]
};
const allowedCORSOrigins = allowedCORSOriginsPerEnv[env.NODE_ENV];
const config$1 = {
  frontendUrl,
  serverUrl,
  allowedCORSOrigins,
  env: env.NODE_ENV,
  isDevelopment: env.NODE_ENV === "development",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  auth: {
    jwtSecret: env.JWT_SECRET
  }
};

function createDbClient() {
  return new PrismaClient();
}
const dbClient = createDbClient();

class HttpError extends Error {
  statusCode;
  data;
  constructor(statusCode, message, data, options) {
    super(message, options);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, HttpError);
    }
    this.name = this.constructor.name;
    if (!(Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600)) {
      throw new Error("statusCode has to be integer in range [400, 600).");
    }
    this.statusCode = statusCode;
    if (data) {
      this.data = data;
    }
  }
}

const prismaAdapter$1 = new PrismaAdapter(dbClient.session, dbClient.auth);
const auth$1 = new Lucia(prismaAdapter$1, {
  // Since we are not using cookies, we don't need to set any cookie options.
  // But in the future, if we decide to use cookies, we can set them here.
  // sessionCookie: {
  //   name: "session",
  //   expires: true,
  //   attributes: {
  //     secure: !config.isDevelopment,
  //     sameSite: "lax",
  //   },
  // },
  getUserAttributes({ userId }) {
    return {
      userId
    };
  }
});

const hashingOptions = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
  version: 1
};
async function hashPassword(password) {
  return hash(normalizePassword(password), hashingOptions);
}
function normalizePassword(password) {
  return password.normalize("NFKC");
}

const defineHandler = (middleware) => middleware;
function redirect(res, redirectUri) {
  return res.status(302).setHeader("Location", redirectUri).end();
}

function throwValidationError(message) {
  throw new HttpError(422, "Validation failed", { message });
}

({
  entities: {
    User: dbClient.user
  }
});
function createProviderId(providerName, providerUserId) {
  return {
    providerName,
    providerUserId: normalizeProviderUserId(providerName, providerUserId)
  };
}
function normalizeProviderUserId(providerName, providerUserId) {
  switch (providerName) {
    case "email":
    case "username":
      return providerUserId.toLowerCase();
    case "google":
    case "github":
    case "discord":
    case "keycloak":
    case "slack":
      return providerUserId;
    /*
          Why the default case?
          In case users add a new auth provider in the user-land.
          Users can't extend this function because it is private.
          If there is an unknown `providerName` in runtime, we'll
          return the `providerUserId` as is.
    
          We want to still have explicit OAuth providers listed
          so that we get a type error if we forget to add a new provider
          to the switch statement.
        */
    default:
      return providerUserId;
  }
}
async function findAuthWithUserBy(where) {
  const result = await dbClient.auth.findFirst({ where, include: { user: true } });
  if (result === null) {
    return null;
  }
  if (result.user === null) {
    return null;
  }
  return { ...result, user: result.user };
}
async function createUser(providerId, serializedProviderData, userFields) {
  return dbClient.user.create({
    data: {
      // Using any here to prevent type errors when userFields are not
      // defined. We want Prisma to throw an error in that case.
      ...userFields ?? {},
      auth: {
        create: {
          identities: {
            create: {
              providerName: providerId.providerName,
              providerUserId: providerId.providerUserId,
              providerData: serializedProviderData
            }
          }
        }
      }
    },
    // We need to include the Auth entity here because we need `authId`
    // to be able to create a session.
    include: {
      auth: true
    }
  });
}
function rethrowPossibleAuthError(e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new HttpError(422, "Save failed", {
      message: `user with the same identity already exists`
    });
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    console.error(e);
    throw new HttpError(422, "Save failed", {
      message: "there was a database error"
    });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2021") {
    console.error(e);
    console.info("\u{1F41D} This error can happen if you did't run the database migrations.");
    throw new HttpError(500, "Save failed", {
      message: `there was a database error`
    });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
    console.error(e);
    console.info(`\u{1F41D} This error can happen if you have some relation on your User entity
   but you didn't specify the "onDelete" behaviour to either "Cascade" or "SetNull".
   Read more at: https://www.prisma.io/docs/orm/prisma-schema/data-model/relations/referential-actions`);
    throw new HttpError(500, "Save failed", {
      message: `there was a database error`
    });
  }
  throw e;
}
async function validateAndGetUserFields(data, userSignupFields) {
  const { password: _password, ...sanitizedData } = data;
  const result = {};
  if (!userSignupFields) {
    return result;
  }
  for (const [field, getFieldValue] of Object.entries(userSignupFields)) {
    try {
      const value = await getFieldValue(sanitizedData);
      result[field] = value;
    } catch (e) {
      throwValidationError(e.message);
    }
  }
  return result;
}
function getProviderData(providerData) {
  return sanitizeProviderData(getProviderDataWithPassword(providerData));
}
function getProviderDataWithPassword(providerData) {
  return JSON.parse(providerData);
}
function sanitizeProviderData(providerData) {
  if (providerDataHasPasswordField(providerData)) {
    const { hashedPassword, ...rest } = providerData;
    return rest;
  } else {
    return providerData;
  }
}
async function sanitizeAndSerializeProviderData(providerData) {
  return serializeProviderData(await ensurePasswordIsHashed(providerData));
}
function serializeProviderData(providerData) {
  return JSON.stringify(providerData);
}
async function ensurePasswordIsHashed(providerData) {
  const data = {
    ...providerData
  };
  if (providerDataHasPasswordField(data)) {
    data.hashedPassword = await hashPassword(data.hashedPassword);
  }
  return data;
}
function providerDataHasPasswordField(providerData) {
  return "hashedPassword" in providerData;
}
function createInvalidCredentialsError(message) {
  return new HttpError(401, "Invalid credentials", { message });
}

function createAuthUserData(user) {
  const { auth, ...rest } = user;
  if (!auth) {
    throw new Error(`\u{1F41D} Error: trying to create a user without auth data.
This should never happen, but it did which means there is a bug in the code.`);
  }
  const identities = {
    google: getProviderInfo(auth, "google")
  };
  return {
    ...rest,
    identities
  };
}
function getProviderInfo(auth, providerName) {
  const identity = getIdentity(auth, providerName);
  if (!identity) {
    return null;
  }
  return {
    ...getProviderData(identity.providerData),
    id: identity.providerUserId
  };
}
function getIdentity(auth, providerName) {
  return auth.identities.find((i) => i.providerName === providerName) ?? null;
}

async function createSession(authId) {
  return auth$1.createSession(authId, {});
}
async function getSessionAndUserFromBearerToken(req) {
  const authorizationHeader = req.headers["authorization"];
  if (typeof authorizationHeader !== "string") {
    return null;
  }
  const sessionId = auth$1.readBearerToken(authorizationHeader);
  if (!sessionId) {
    return null;
  }
  return getSessionAndUserFromSessionId(sessionId);
}
async function getSessionAndUserFromSessionId(sessionId) {
  const { session, user: authEntity } = await auth$1.validateSession(sessionId);
  if (!session || !authEntity) {
    return null;
  }
  return {
    session,
    user: await getAuthUserData(authEntity.userId)
  };
}
async function getAuthUserData(userId) {
  const user = await dbClient.user.findUnique({
    where: { id: userId },
    include: {
      auth: {
        include: {
          identities: true
        }
      }
    }
  });
  if (!user) {
    throw createInvalidCredentialsError();
  }
  return createAuthUserData(user);
}
function invalidateSession(sessionId) {
  return auth$1.invalidateSession(sessionId);
}

const auth = defineHandler(async (req, res, next) => {
  const authHeader = req.get("Authorization");
  if (!authHeader) {
    req.sessionId = null;
    req.user = null;
    return next();
  }
  const sessionAndUser = await getSessionAndUserFromBearerToken(req);
  if (sessionAndUser === null) {
    throw createInvalidCredentialsError();
  }
  req.sessionId = sessionAndUser.session.id;
  req.user = sessionAndUser.user;
  next();
});

const Decimal = Prisma.Decimal;
if (Decimal) {
  registerCustom({
    isApplicable: (v) => Decimal.isDecimal(v),
    serialize: (v) => v.toJSON(),
    deserialize: (v) => new Decimal(v)
  }, "prisma.decimal");
}

function isNotNull(value) {
  return value !== null;
}

function makeAuthUserIfPossible(user) {
  return user ? makeAuthUser(user) : null;
}
function makeAuthUser(data) {
  return {
    ...data,
    getFirstProviderUserId: () => {
      const identities = Object.values(data.identities).filter(isNotNull);
      return identities.length > 0 ? identities[0].id : null;
    }
  };
}

function createOperation(handlerFn) {
  return defineHandler(async (req, res) => {
    const args = req.body && deserialize(req.body) || {};
    const context = {
      user: makeAuthUserIfPossible(req.user)
    };
    const result = await handlerFn(args, context);
    const serializedResult = serialize(result);
    res.json(serializedResult);
  });
}
function createQuery(handlerFn) {
  return createOperation(handlerFn);
}
function createAction(handlerFn) {
  return createOperation(handlerFn);
}

const stripe$1 = new Stripe(process.env.STRIPE_KEY, {
  apiVersion: "2023-08-16"
});
const DOMAIN$1 = process.env.WASP_WEB_CLIENT_URL || "http://localhost:3000";
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
}) : null;
const gptConfig = {
  completeCoverLetter: `You are a cover letter generator.
  You will be given a job description along with the job applicant's resume.
  You will write a cover letter for the applicant that matches their past experiences from the resume with the job description. Write the cover letter in the same language as the job description provided!
  Rather than simply outlining the applicant's past experiences, you will give more detail and explain how those experiences will help the applicant succeed in the new job.
  You will write the cover letter in a modern, professional style without being too formal, as a modern employee might do naturally.`,
  coverLetterWithAWittyRemark: `You are a cover letter generator.
  You will be given a job description along with the job applicant's resume.
  You will write a cover letter for the applicant that matches their past experiences from the resume with the job description. Write the cover letter in the same language as the job description provided!
  Rather than simply outlining the applicant's past experiences, you will give more detail and explain how those experiences will help the applicant succeed in the new job.
  You will write the cover letter in a modern, relaxed style, as a modern employee might do naturally.
  Include a job related joke at the end of the cover letter.`,
  ideasForCoverLetter: "You are a cover letter idea generator. You will be given a job description along with the job applicant's resume. You will generate a bullet point list of ideas for the applicant to use in their cover letter. "
};
const PRICING_CONFIG = {
  "cover-letter": {
    weekly: { amount: 800, interval: "week" },
    // $8.00 in cents
    monthly: { amount: 2400, interval: "month" },
    // $24.00 in cents
    yearly: { amount: 15400, interval: "year" }
    // $154.00 in cents
  },
  "full-suite": {
    weekly: { amount: 1200, interval: "week" },
    // $12.00 in cents
    monthly: { amount: 3e3, interval: "month" },
    // $30.00 in cents
    yearly: { amount: 19900, interval: "year" }
    // $199.00 in cents
  }
};
async function checkIfUserPaid({
  context,
  lnPayment
}) {
  if (!context.user.hasPaid && !context.user.credits && !context.user.isUsingLn) {
    throw new HttpError(402, "User must pay to continue");
  }
  if (context.user.subscriptionStatus === "past_due") {
    throw new HttpError(
      402,
      "Your subscription is past due. Please update your payment method."
    );
  }
  if (context.user.isUsingLn) {
    let invoiceStatus;
    if (lnPayment) {
      const lnPaymentInDB = await context.entities.LnPayment.findUnique({
        where: {
          pr: lnPayment.pr
        }
      });
      invoiceStatus = lnPaymentInDB?.status;
    }
    console.table({ lnPayment, invoiceStatus });
    if (invoiceStatus !== "success") {
      throw new HttpError(402, "Your lightning payment has not been paid");
    }
  }
}
function isClaudeModel(model) {
  return model.startsWith("claude-");
}
function getModelForProvider(gptModel) {
  console.log("\u{1F50D} Original model from frontend:", gptModel);
  if (gptModel === "gpt-5") {
    console.log("\u{1F4CD} Mapping gpt-5 to gpt-4o");
    return "gpt-4o";
  }
  if (gptModel === "claude-sonnet-4.1") {
    console.log("\u{1F4CD} Mapping claude-sonnet-4.1 to claude-sonnet-4-20250514");
    return "claude-sonnet-4-20250514";
  }
  if (gptModel.startsWith("claude-") && !gptModel.includes("-20")) {
    if (gptModel === "claude-3-5-sonnet" || gptModel === "claude-sonnet-3.5") {
      console.log("\u{1F4CD} Mapping", gptModel, "to claude-3-5-sonnet-20241022");
      return "claude-3-5-sonnet-20241022";
    }
    if (gptModel === "claude-3-5-haiku" || gptModel === "claude-haiku-3.5") {
      console.log("\u{1F4CD} Mapping", gptModel, "to claude-3-5-haiku-20241022");
      return "claude-3-5-haiku-20241022";
    }
    if (gptModel === "claude-sonnet-4" || gptModel === "claude-4-sonnet") {
      console.log("\u{1F4CD} Mapping", gptModel, "to claude-sonnet-4-20250514");
      return "claude-sonnet-4-20250514";
    }
    if (gptModel === "claude-opus-4" || gptModel === "claude-4-opus") {
      console.log("\u{1F4CD} Mapping", gptModel, "to claude-opus-4-20250514");
      return "claude-opus-4-20250514";
    }
  }
  console.log("\u{1F4CD} No mapping found, using original model:", gptModel);
  return gptModel;
}
async function callOpenAI(payload) {
  const response = await fetch$1("https://api.openai.com/v1/chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    method: "POST",
    body: JSON.stringify(payload)
  });
  return await response.json();
}
async function callClaude(messages, temperature, model) {
  if (!anthropic) {
    throw new HttpError(
      500,
      "ANTHROPIC_API_KEY environment variable is not set"
    );
  }
  const systemMessage = messages.find((m) => m.role === "system")?.content || "";
  const userMessages = messages.filter((m) => m.role !== "system");
  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4e3,
      temperature,
      system: systemMessage,
      messages: userMessages
    });
    if (!response.content || response.content.length === 0) {
      throw new HttpError(500, "Claude returned an empty response");
    }
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || !textContent.text) {
      throw new HttpError(500, "No text content found in Claude response");
    }
    return {
      content: textContent.text,
      tokens: response.usage?.output_tokens || 0
    };
  } catch (error) {
    console.error("Claude API Error:", error);
    if (error.status === 401) {
      throw new HttpError(401, "Invalid Anthropic API key");
    } else if (error.status === 429) {
      throw new HttpError(
        429,
        "Claude API rate limit exceeded. Please try again later."
      );
    } else if (error.status >= 500) {
      throw new HttpError(500, `Claude API server error: ${error.message}`);
    } else {
      throw new HttpError(
        500,
        `Claude API error: ${error.message || "Unknown error"}`
      );
    }
  }
}
async function getOrCreateStripeCustomer(email) {
  const existingCustomers = await stripe$1.customers.list({
    email,
    limit: 1
  });
  if (existingCustomers.data.length > 0) {
    console.log("Using existing Stripe customer");
    return existingCustomers.data[0];
  }
  console.log("Creating new Stripe customer");
  return await stripe$1.customers.create({
    email
  });
}
async function getOrCreatePriceId(planType, duration) {
  const config = PRICING_CONFIG[planType][duration];
  const productId = `${planType}-${duration}`;
  let product;
  try {
    product = await stripe$1.products.retrieve(productId);
  } catch (error) {
    product = await stripe$1.products.create({
      id: productId,
      name: `CoverLetterGPT - ${planType === "cover-letter" ? "Cover Letters Only" : "Full Suite"} (${duration})`,
      description: planType === "cover-letter" ? "Unlimited cover letter generation with Claude AI" : "Unlimited cover letters + resume generation with Claude AI"
    });
  }
  const priceId = `price-${planType}-${duration}`;
  try {
    const existingPrice = await stripe$1.prices.retrieve(priceId);
    return existingPrice.id;
  } catch (error) {
    const newPrice = await stripe$1.prices.create({
      product: product.id,
      unit_amount: config.amount,
      currency: "usd",
      recurring: {
        interval: config.interval
      }
    });
    return newPrice.id;
  }
}
const generateCoverLetter$2 = async ({
  jobId,
  title,
  content,
  description,
  isCompleteCoverLetter,
  includeWittyRemark,
  temperature,
  gptModel,
  lnPayment
}, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  await checkIfUserPaid({ context, lnPayment });
  let command;
  if (isCompleteCoverLetter) {
    command = includeWittyRemark ? gptConfig.coverLetterWithAWittyRemark : gptConfig.completeCoverLetter;
  } else {
    command = gptConfig.ideasForCoverLetter;
  }
  console.log("AI model received:", gptModel);
  const actualModel = getModelForProvider(gptModel);
  const isUsingClaude = isClaudeModel(gptModel);
  console.log("Mapped to actual model:", actualModel);
  console.log("Is using Claude:", isUsingClaude);
  if (isUsingClaude && !anthropic) {
    throw new HttpError(
      500,
      "Claude models are not available. Please configure ANTHROPIC_API_KEY or choose an OpenAI model."
    );
  }
  const messages = [
    {
      role: "system",
      content: command
    },
    {
      role: "user",
      content: `My Resume: ${content}. Job title: ${title} Job Description: ${description}.`
    }
  ];
  try {
    if (!context.user.hasPaid && !context.user.credits && !context.user.isUsingLn) {
      throw new HttpError(402, "User has not paid or is out of credits");
    } else if (context.user.credits && !context.user.hasPaid) {
      console.log("decrementing credits \n\n");
      await context.entities.User.update({
        where: { id: context.user.id },
        data: {
          credits: {
            decrement: 1
          }
        }
      });
    }
    let responseContent;
    let tokenUsage;
    if (isUsingClaude) {
      const claudeResponse = await callClaude(
        messages,
        temperature,
        actualModel
      );
      responseContent = claudeResponse.content;
      tokenUsage = claudeResponse.tokens;
    } else {
      const openaiPayload = {
        model: actualModel,
        messages,
        temperature
      };
      const openaiResponse = await callOpenAI(openaiPayload);
      if (openaiResponse?.error) {
        throw new HttpError(
          500,
          openaiResponse?.error?.message || "Something went wrong with OpenAI API"
        );
      }
      responseContent = openaiResponse.choices[0].message.content;
      tokenUsage = openaiResponse.usage.completion_tokens;
    }
    if (!responseContent || responseContent.trim().length === 0) {
      throw new HttpError(500, "AI returned an empty response");
    }
    return context.entities.CoverLetter.create({
      data: {
        title,
        content: responseContent,
        tokenUsage,
        user: { connect: { id: context.user.id } },
        job: { connect: { id: jobId } }
      }
    });
  } catch (error) {
    if (!context.user.hasPaid && error?.statusCode != 402) {
      await context.entities.User.update({
        where: { id: context.user.id },
        data: {
          credits: {
            increment: 1
          }
        }
      });
    }
    console.error(error);
    throw new HttpError(
      error.statusCode || 500,
      error.message || "Something went wrong"
    );
  }
};
const generateEdit$2 = async ({ content, improvement, lnPayment }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  await checkIfUserPaid({ context, lnPayment });
  let command;
  command = `You are a cover letter editor. You will be given a piece of isolated text from within a cover letter and told how you can improve it. Only respond with the revision. Make sure the revision is in the same language as the given isolated text.`;
  const gptModel = context.user.gptModel === "gpt-4" || context.user.gptModel === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini";
  const isUsingClaude = isClaudeModel(gptModel);
  const actualModel = getModelForProvider(gptModel);
  if (isUsingClaude && !anthropic) {
    throw new HttpError(
      500,
      "Claude models are not available. Please configure ANTHROPIC_API_KEY or choose an OpenAI model."
    );
  }
  const messages = [
    {
      role: "system",
      content: command
    },
    {
      role: "user",
      content: `Isolated text from within cover letter: ${content}. It should be improved by making it more: ${improvement}`
    }
  ];
  try {
    if (!context.user.hasPaid && !context.user.credits && !context.user.isUsingLn) {
      throw new HttpError(402, "User has not paid or is out of credits");
    } else if (context.user.credits && !context.user.hasPaid) {
      console.log("decrementing credits \n\n");
      await context.entities.User.update({
        where: { id: context.user.id },
        data: {
          credits: {
            decrement: 1
          }
        }
      });
    }
    let responseContent;
    if (isUsingClaude) {
      const claudeResponse = await callClaude(messages, 0.5, actualModel);
      responseContent = claudeResponse.content;
    } else {
      const openaiPayload = {
        model: actualModel,
        messages,
        temperature: 0.5
      };
      const openaiResponse = await callOpenAI(openaiPayload);
      if (openaiResponse?.error) {
        throw new HttpError(
          500,
          openaiResponse?.error?.message || "Something went wrong with OpenAI API"
        );
      }
      responseContent = openaiResponse.choices[0].message.content;
    }
    if (responseContent && responseContent.length > 0) {
      return responseContent;
    } else {
      throw new HttpError(500, "AI returned an empty response");
    }
  } catch (error) {
    if (!context.user.hasPaid && error?.statusCode != 402) {
      await context.entities.User.update({
        where: { id: context.user.id },
        data: {
          credits: {
            increment: 1
          }
        }
      });
    }
    console.error(error);
    throw new HttpError(
      error.statusCode || 500,
      error.message || "Something went wrong"
    );
  }
};
const createJob$2 = ({ title, company, location, description }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.Job.create({
    data: {
      title,
      description,
      location,
      company,
      user: { connect: { id: context.user.id } }
    }
  });
};
const updateJob$2 = ({ id, title, company, location, description, isCompleted }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.Job.update({
    where: {
      id
    },
    data: {
      title,
      description,
      location,
      company,
      isCompleted
    }
  });
};
const updateCoverLetter$2 = async ({
  id,
  description,
  content,
  isCompleteCoverLetter,
  includeWittyRemark,
  temperature,
  gptModel,
  lnPayment
}, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  await checkIfUserPaid({ context, lnPayment });
  const job = await context.entities.Job.findFirst({
    where: {
      id,
      user: { id: context.user.id }
    }
  });
  if (!job) {
    throw new HttpError(404, "Job not found");
  }
  const coverLetter = await generateCoverLetter$2(
    {
      jobId: id,
      title: job.title,
      content,
      description: job.description,
      isCompleteCoverLetter,
      includeWittyRemark,
      temperature,
      gptModel,
      lnPayment
    },
    context
  );
  await context.entities.Job.update({
    where: {
      id
    },
    data: {
      description,
      coverLetter: { connect: { id: coverLetter.id } }
    }
  });
  return coverLetter.id;
};
const editCoverLetter$2 = ({ coverLetterId, content }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.CoverLetter.update({
    where: {
      id: coverLetterId
    },
    data: {
      content
    }
  });
};
const deleteJob$2 = ({ jobId }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  if (!jobId) {
    throw new HttpError(401);
  }
  return context.entities.Job.deleteMany({
    where: {
      id: jobId,
      userId: context.user.id
    }
  });
};
const updateUser$2 = async ({ notifyPaymentExpires, gptModel }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.User.update({
    where: {
      id: context.user.id
    },
    data: {
      notifyPaymentExpires,
      gptModel
    },
    select: {
      id: true,
      email: true,
      username: true,
      hasPaid: true,
      datePaid: true,
      notifyPaymentExpires: true,
      checkoutSessionId: true,
      stripeId: true,
      credits: true,
      gptModel: true,
      isUsingLn: true,
      subscriptionStatus: true,
      currentPlanType: true,
      currentPlanDuration: true,
      pendingPlanType: true,
      pendingPlanDuration: true
    }
  });
};
const createSubscription$2 = async ({ planType, duration }, context) => {
  if (!context.user || !context.user.email) {
    throw new HttpError(401, "User or email not found");
  }
  try {
    const customer = await getOrCreateStripeCustomer(context.user.email);
    const priceId = await getOrCreatePriceId(planType, duration);
    const session = await stripe$1.checkout.sessions.create({
      customer: customer.id,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      mode: "subscription",
      // Updated success URL to include session_id and plan info
      success_url: `${DOMAIN$1}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${planType}&duration=${duration}`,
      cancel_url: `${DOMAIN$1}/checkout/success?canceled=true`,
      automatic_tax: { enabled: true },
      customer_update: {
        address: "auto"
      },
      metadata: {
        userId: context.user.id,
        planType,
        duration
      },
      subscription_data: {
        metadata: {
          userId: context.user.id,
          planType,
          duration
        }
      }
    });
    await context.entities.User.update({
      where: { id: context.user.id },
      data: {
        checkoutSessionId: session.id,
        stripeId: customer.id,
        // Store the intended plan info (will be confirmed via success callback)
        pendingPlanType: planType,
        pendingPlanDuration: duration
      }
    });
    return {
      sessionUrl: session.url,
      sessionId: session.id
    };
  } catch (error) {
    console.error("Subscription creation error:", error);
    throw new HttpError(500, `Failed to create subscription: ${error.message}`);
  }
};
const upgradeSubscription$2 = async ({ planType, duration }, context) => {
  if (!context.user || !context.user.email) {
    throw new HttpError(401, "User or email not found");
  }
  if (!context.user.stripeId) {
    throw new HttpError(400, "User does not have existing subscription");
  }
  try {
    const subscriptions = await stripe$1.subscriptions.list({
      customer: context.user.stripeId,
      status: "active",
      limit: 1
    });
    if (subscriptions.data.length === 0) {
      throw new HttpError(400, "No active subscription found");
    }
    const currentSubscription = subscriptions.data[0];
    const newPriceId = await getOrCreatePriceId(planType, duration);
    const session = await stripe$1.checkout.sessions.create({
      customer: context.user.stripeId,
      line_items: [
        {
          price: newPriceId,
          quantity: 1
        }
      ],
      mode: "subscription",
      // Updated success URL for upgrades
      success_url: `${DOMAIN$1}/checkout/success?session_id={CHECKOUT_SESSION_ID}&plan=${planType}&duration=${duration}&upgrade=true`,
      cancel_url: `${DOMAIN$1}/checkout/success?canceled=true`,
      automatic_tax: { enabled: true },
      subscription_data: {
        metadata: {
          userId: context.user.id,
          planType,
          duration,
          isUpgrade: "true",
          previousSubscriptionId: currentSubscription.id
        }
      },
      metadata: {
        userId: context.user.id,
        planType,
        duration,
        isUpgrade: "true"
      }
    });
    await context.entities.User.update({
      where: { id: context.user.id },
      data: {
        checkoutSessionId: session.id,
        pendingPlanType: planType,
        pendingPlanDuration: duration
      }
    });
    return {
      sessionUrl: session.url,
      sessionId: session.id
    };
  } catch (error) {
    console.error("Subscription upgrade error:", error);
    throw new HttpError(
      500,
      `Failed to upgrade subscription: ${error.message}`
    );
  }
};
const stripePayment$2 = async (_args, context) => {
  return await createSubscription$2(
    { planType: "cover-letter", duration: "monthly" },
    context
  );
};
const stripeGpt4Payment$2 = async (_args, context) => {
  return await createSubscription$2(
    { planType: "full-suite", duration: "monthly" },
    context
  );
};
const stripeCreditsPayment$2 = async (_args, context) => {
  if (!context.user || !context.user.email) {
    throw new HttpError(401, "User or email not found");
  }
  try {
    const customer = await getOrCreateStripeCustomer(context.user.email);
    const session = await stripe$1.checkout.sessions.create({
      customer: customer.id,
      line_items: [
        {
          price: process.env.PRODUCT_CREDITS_PRICE_ID,
          quantity: 1
        }
      ],
      mode: "payment",
      success_url: `${DOMAIN$1}/checkout?credits=true`,
      cancel_url: `${DOMAIN$1}/checkout?canceled=true`,
      automatic_tax: { enabled: true },
      customer_update: {
        address: "auto"
      },
      metadata: {
        userId: context.user.id,
        type: "credits"
      }
    });
    await context.entities.User.update({
      where: { id: context.user.id },
      data: {
        stripeId: customer.id
      }
    });
    return {
      sessionUrl: session.url,
      sessionId: session.id
    };
  } catch (error) {
    console.error("Credits payment error:", error);
    throw new HttpError(
      500,
      `Failed to create credits payment: ${error.message}`
    );
  }
};
const confirmSubscription$2 = async ({ sessionId, planType, duration }, context) => {
  if (!context.user) {
    throw new HttpError(401, "User not authenticated");
  }
  try {
    const session = await stripe$1.checkout.sessions.retrieve(sessionId);
    console.log(
      "Session retrieved:",
      session.id,
      "Status:",
      session.payment_status
    );
    if (session.payment_status !== "paid") {
      throw new HttpError(400, "Payment not completed yet");
    }
    const user = await context.entities.User.findFirst({
      where: { id: context.user.id },
      select: {
        pendingPlanType: true,
        pendingPlanDuration: true,
        currentPlanType: true,
        currentPlanDuration: true,
        hasPaid: true
      }
    });
    if (!user) {
      throw new HttpError(404, "User not found");
    }
    if (user.hasPaid && user.currentPlanType) {
      console.log("User already has plan assigned");
      return context.entities.User.findFirst({
        where: { id: context.user.id }
      });
    }
    const finalPlanType = planType || user.pendingPlanType;
    const finalDuration = duration || user.pendingPlanDuration;
    if (!finalPlanType || !finalDuration) {
      throw new HttpError(400, "No plan information found");
    }
    const gptModel = finalPlanType === "full-suite" ? "claude-sonnet-4.1" : "gpt-4o-mini";
    console.log(
      `Assigning plan: ${finalPlanType} (${finalDuration}) to user ${context.user.id}`
    );
    return await context.entities.User.update({
      where: { id: context.user.id },
      data: {
        currentPlanType: finalPlanType,
        currentPlanDuration: finalDuration,
        pendingPlanType: null,
        pendingPlanDuration: null,
        hasPaid: true,
        datePaid: /* @__PURE__ */ new Date(),
        subscriptionStatus: "active",
        gptModel
      }
    });
  } catch (error) {
    console.error("Confirm subscription error:", error);
    throw new HttpError(
      error.statusCode || 500,
      error.message || "Failed to confirm subscription"
    );
  }
};
const fixUserPlan$2 = async ({ userId }, context) => {
  if (!context.user) {
    throw new HttpError(401, "User not authenticated");
  }
  const targetUserId = userId || context.user.id;
  const user = await context.entities.User.findFirst({
    where: { id: targetUserId },
    select: {
      pendingPlanType: true,
      pendingPlanDuration: true,
      checkoutSessionId: true,
      currentPlanType: true,
      hasPaid: true
    }
  });
  if (!user?.checkoutSessionId) {
    throw new HttpError(400, "No checkout session found for user");
  }
  if (user.hasPaid && user.currentPlanType) {
    throw new HttpError(400, "User already has active plan");
  }
  const session = await stripe$1.checkout.sessions.retrieve(
    user.checkoutSessionId
  );
  if (session.payment_status !== "paid") {
    throw new HttpError(400, "Payment not completed in Stripe");
  }
  if (!user.pendingPlanType || !user.pendingPlanDuration) {
    throw new HttpError(400, "No pending plan information found");
  }
  const gptModel = user.pendingPlanType === "full-suite" ? "claude-sonnet-4.1" : "gpt-4o-mini";
  return await context.entities.User.update({
    where: { id: targetUserId },
    data: {
      currentPlanType: user.pendingPlanType,
      currentPlanDuration: user.pendingPlanDuration,
      pendingPlanType: null,
      pendingPlanDuration: null,
      hasPaid: true,
      datePaid: /* @__PURE__ */ new Date(),
      subscriptionStatus: "active",
      gptModel
    }
  });
};

async function generateCoverLetter$1(args, context) {
  return generateCoverLetter$2(args, {
    ...context,
    entities: {
      CoverLetter: dbClient.coverLetter,
      User: dbClient.user,
      LnPayment: dbClient.lnPayment
    }
  });
}

var generateCoverLetter = createAction(generateCoverLetter$1);

async function createJob$1(args, context) {
  return createJob$2(args, {
    ...context,
    entities: {
      Job: dbClient.job
    }
  });
}

var createJob = createAction(createJob$1);

async function updateJob$1(args, context) {
  return updateJob$2(args, {
    ...context,
    entities: {
      Job: dbClient.job
    }
  });
}

var updateJob = createAction(updateJob$1);

async function updateCoverLetter$1(args, context) {
  return updateCoverLetter$2(args, {
    ...context,
    entities: {
      Job: dbClient.job,
      CoverLetter: dbClient.coverLetter,
      User: dbClient.user,
      LnPayment: dbClient.lnPayment
    }
  });
}

var updateCoverLetter = createAction(updateCoverLetter$1);

async function generateEdit$1(args, context) {
  return generateEdit$2(args, {
    ...context,
    entities: {
      CoverLetter: dbClient.coverLetter,
      User: dbClient.user,
      LnPayment: dbClient.lnPayment
    }
  });
}

var generateEdit = createAction(generateEdit$1);

async function editCoverLetter$1(args, context) {
  return editCoverLetter$2(args, {
    ...context,
    entities: {
      CoverLetter: dbClient.coverLetter
    }
  });
}

var editCoverLetter = createAction(editCoverLetter$1);

async function updateUser$1(args, context) {
  return updateUser$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var updateUser = createAction(updateUser$1);

async function deleteJob$1(args, context) {
  return deleteJob$2(args, {
    ...context,
    entities: {
      Job: dbClient.job
    }
  });
}

var deleteJob = createAction(deleteJob$1);

async function stripePayment$1(args, context) {
  return stripePayment$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var stripePayment = createAction(stripePayment$1);

async function stripeGpt4Payment$1(args, context) {
  return stripeGpt4Payment$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var stripeGpt4Payment = createAction(stripeGpt4Payment$1);

async function stripeCreditsPayment$1(args, context) {
  return stripeCreditsPayment$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var stripeCreditsPayment = createAction(stripeCreditsPayment$1);

const DOMAIN = process.env.REACT_APP_API_URL || "http://localhost:3001";
const prismaAdapter = new PrismaAdapter(
  dbClient.session,
  dbClient.auth
);
new Lucia(prismaAdapter, {
  getUserAttributes({ userId }) {
    return {
      userId
    };
  }
});
function generateK1() {
  return randomBytes(32).toString("hex");
}
function createHash(k1) {
  const hash = createHash$1("sha256");
  hash.update(k1);
  return hash.digest("hex");
}
const getLnLoginUrl$2 = async (_args, context) => {
  const k1 = generateK1();
  const url = `${DOMAIN}/ln-login?tag=login&k1=${k1}&action=login`;
  const hash = createHash(k1);
  const data = {
    encoded: lnurl.encode(url).toUpperCase(),
    k1,
    k1Hash: hash,
    jwt: ""
  };
  console.log("hash: ", data.k1Hash);
  await context.entities.LnData.create({
    data: {
      k1Hash: data.k1Hash
    }
  });
  return data;
};
const lnLogin = async (request, response, context) => {
  console.log("request query: ", request.query);
  const { k1, sig, key } = request.query;
  if (typeof k1 !== "string" || typeof sig !== "string" || typeof key !== "string") {
    throw new Error("Invalid query parameters");
  }
  if (!lnurl.verifyAuthorizationSignature(sig, k1, key)) {
    throw new Error("Invalid signature");
  }
  const storedK1 = await context.entities.LnData.findUniqueOrThrow({
    where: {
      k1Hash: createHash(k1)
    }
  });
  await context.entities.User.upsert({
    where: {
      username: key
    },
    create: {
      username: key,
      email: "Bitcoin Lightning User",
      isUsingLn: true,
      gptModel: "gpt-4o",
      credits: 0,
      lnData: {
        connect: {
          k1Hash: storedK1.k1Hash
        }
      }
    },
    update: {
      lnData: {
        connect: {
          k1Hash: storedK1.k1Hash
        }
      }
    },
    include: {
      lnData: true
    }
  });
  const sessionToken = randomBytes(32).toString("hex");
  await context.entities.LnData.update({
    where: {
      k1Hash: storedK1.k1Hash
    },
    data: {
      token: sessionToken
    }
  });
  response.status(200).json({ status: "OK", token: sessionToken });
};
const getLnUserInfo$2 = async (k1Hash, context) => {
  try {
    return await context.entities.LnData.findUnique({
      where: {
        k1Hash
      }
    });
  } catch (error) {
    console.error("Error fetching LnData:", error);
    return null;
  }
};
const decodeInvoice$2 = async (pr, _context) => {
  const invoice = bolt11.decode(pr);
  return invoice;
};
const updateLnPayment$2 = async (invoice, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  const updatedInvoice = await context.entities.LnPayment.upsert({
    where: {
      pr: invoice.pr
    },
    create: {
      pr: invoice.pr,
      status: invoice.status,
      userId: context.user.id,
      amount: null,
      // Add missing required fields
      settled: false
    },
    update: {
      status: invoice.status
    }
  });
  return updatedInvoice;
};
const getBitcoinPrice = async () => {
  let response = null;
  try {
    response = await axios.get(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest",
      {
        headers: {
          "X-CMC_PRO_API_KEY": process.env.COINMARKETCAP_API_KEY
        }
      }
    );
  } catch (error) {
    console.log("error calling coinmarket cap api: ", error.message);
    return null;
  }
  if (response && response.data && response.data.data && response.data.data[0]) {
    const bitcoinData = response.data.data.find(
      (crypto) => crypto.symbol === "BTC"
    );
    if (bitcoinData && bitcoinData.quote && bitcoinData.quote.USD) {
      return bitcoinData.quote.USD.price;
    }
  }
  return null;
};
const milliSatsToCents$2 = async ({ milliSats }, _context) => {
  const bitcoinPrice = await getBitcoinPrice();
  if (bitcoinPrice === null) return 0;
  const dollarsPerSat = bitcoinPrice / 1e8;
  const centsPerDollar = milliSats / 1e3 * dollarsPerSat * 100;
  return Math.round(centsPerDollar);
};

async function getLnLoginUrl$1(args, context) {
  return getLnLoginUrl$2(args, {
    ...context,
    entities: {
      User: dbClient.user,
      LnData: dbClient.lnData
    }
  });
}

var getLnLoginUrl = createAction(getLnLoginUrl$1);

async function decodeInvoice$1(args, context) {
  return decodeInvoice$2(args, {
    ...context});
}

var decodeInvoice = createAction(decodeInvoice$1);

async function updateLnPayment$1(args, context) {
  return updateLnPayment$2(args, {
    ...context,
    entities: {
      LnPayment: dbClient.lnPayment
    }
  });
}

var updateLnPayment = createAction(updateLnPayment$1);

async function createSubscription$1(args, context) {
  return createSubscription$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var createSubscription = createAction(createSubscription$1);

async function upgradeSubscription$1(args, context) {
  return upgradeSubscription$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var upgradeSubscription = createAction(upgradeSubscription$1);

async function milliSatsToCents$1(args, context) {
  return milliSatsToCents$2(args, {
    ...context});
}

var milliSatsToCents = createAction(milliSatsToCents$1);

async function confirmSubscription$1(args, context) {
  return confirmSubscription$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var confirmSubscription = createAction(confirmSubscription$1);

async function fixUserPlan$1(args, context) {
  return fixUserPlan$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var fixUserPlan = createAction(fixUserPlan$1);

const getCoverLetter$2 = async ({ id }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.CoverLetter.findFirstOrThrow({
    where: {
      id,
      user: { id: context.user.id }
    }
  });
};
const getCoverLetters$2 = async ({ id }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.CoverLetter.findMany({
    where: {
      job: { id },
      user: { id: context.user.id }
    }
  });
};
const getJobs$2 = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.Job.findMany({
    where: {
      user: { id: context.user.id }
    },
    include: {
      coverLetter: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
};
const getJob$2 = async ({ id }, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.Job.findFirstOrThrow({
    where: {
      id,
      user: { id: context.user.id }
    },
    include: {
      coverLetter: true
    }
  });
};
const getUserInfo$2 = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401);
  }
  return context.entities.User.findUniqueOrThrow({
    where: {
      id: context.user.id
    },
    select: {
      letters: true,
      id: true,
      email: true,
      hasPaid: true,
      notifyPaymentExpires: true,
      credits: true,
      gptModel: true,
      isUsingLn: true,
      subscriptionStatus: true
    }
  });
};
const getCoverLetterCount$2 = async (_args, context) => {
  return context.entities.CoverLetter.count();
};

async function getJobs$1(args, context) {
  return getJobs$2(args, {
    ...context,
    entities: {
      Job: dbClient.job
    }
  });
}

var getJobs = createQuery(getJobs$1);

async function getJob$1(args, context) {
  return getJob$2(args, {
    ...context,
    entities: {
      Job: dbClient.job
    }
  });
}

var getJob = createQuery(getJob$1);

async function getCoverLetter$1(args, context) {
  return getCoverLetter$2(args, {
    ...context,
    entities: {
      CoverLetter: dbClient.coverLetter
    }
  });
}

var getCoverLetter = createQuery(getCoverLetter$1);

async function getCoverLetters$1(args, context) {
  return getCoverLetters$2(args, {
    ...context,
    entities: {
      CoverLetter: dbClient.coverLetter
    }
  });
}

var getCoverLetters = createQuery(getCoverLetters$1);

async function getUserInfo$1(args, context) {
  return getUserInfo$2(args, {
    ...context,
    entities: {
      User: dbClient.user
    }
  });
}

var getUserInfo = createQuery(getUserInfo$1);

async function getLnUserInfo$1(args, context) {
  return getLnUserInfo$2(args, {
    ...context,
    entities: {
      User: dbClient.user,
      LnData: dbClient.lnData
    }
  });
}

var getLnUserInfo = createQuery(getLnUserInfo$1);

async function getCoverLetterCount$1(args, context) {
  return getCoverLetterCount$2(args, {
    ...context,
    entities: {
      CoverLetter: dbClient.coverLetter
    }
  });
}

var getCoverLetterCount = createQuery(getCoverLetterCount$1);

const router$4 = express.Router();
router$4.post("/generate-cover-letter", auth, generateCoverLetter);
router$4.post("/create-job", auth, createJob);
router$4.post("/update-job", auth, updateJob);
router$4.post("/update-cover-letter", auth, updateCoverLetter);
router$4.post("/generate-edit", auth, generateEdit);
router$4.post("/edit-cover-letter", auth, editCoverLetter);
router$4.post("/update-user", auth, updateUser);
router$4.post("/delete-job", auth, deleteJob);
router$4.post("/stripe-payment", auth, stripePayment);
router$4.post("/stripe-gpt4-payment", auth, stripeGpt4Payment);
router$4.post("/stripe-credits-payment", auth, stripeCreditsPayment);
router$4.post("/get-ln-login-url", auth, getLnLoginUrl);
router$4.post("/decode-invoice", auth, decodeInvoice);
router$4.post("/update-ln-payment", auth, updateLnPayment);
router$4.post("/create-subscription", auth, createSubscription);
router$4.post("/upgrade-subscription", auth, upgradeSubscription);
router$4.post("/milli-sats-to-cents", auth, milliSatsToCents);
router$4.post("/confirm-subscription", auth, confirmSubscription);
router$4.post("/fix-user-plan", auth, fixUserPlan);
router$4.post("/get-jobs", auth, getJobs);
router$4.post("/get-job", auth, getJob);
router$4.post("/get-cover-letter", auth, getCoverLetter);
router$4.post("/get-cover-letters", auth, getCoverLetters);
router$4.post("/get-user-info", auth, getUserInfo);
router$4.post("/get-ln-user-info", auth, getLnUserInfo);
router$4.post("/get-cover-letter-count", auth, getCoverLetterCount);

const _waspGlobalMiddlewareConfigFn = (mc) => mc;
const defaultGlobalMiddlewareConfig = /* @__PURE__ */ new Map([
  ["helmet", helmet()],
  ["cors", cors({ origin: config$1.allowedCORSOrigins })],
  ["logger", logger("dev")],
  ["express.json", express.json()],
  ["express.urlencoded", express.urlencoded()],
  ["cookieParser", cookieParser()]
]);
const globalMiddlewareConfig = _waspGlobalMiddlewareConfigFn(defaultGlobalMiddlewareConfig);
function globalMiddlewareConfigForExpress(middlewareConfigFn) {
  if (!middlewareConfigFn) {
    return Array.from(globalMiddlewareConfig.values());
  }
  const globalMiddlewareConfigClone = new Map(globalMiddlewareConfig);
  const modifiedMiddlewareConfig = middlewareConfigFn(globalMiddlewareConfigClone);
  return Array.from(modifiedMiddlewareConfig.values());
}

var me = defineHandler(async (req, res) => {
  if (req.user) {
    res.json(serialize(req.user));
  } else {
    res.json(serialize(null));
  }
});

var logout = defineHandler(async (req, res) => {
  if (req.sessionId) {
    await invalidateSession(req.sessionId);
    res.json({ success: true });
  } else {
    throw createInvalidCredentialsError();
  }
});

function defineUserSignupFields(fields) {
  return fields;
}

const loginPath = "login";
const exchangeCodeForTokenPath = "exchange-code";
const callbackPath = "callback";
const clientOAuthCallbackPath = "/oauth/callback";
function getRedirectUriForOneTimeCode(oneTimeCode) {
  return new URL(`${config$1.frontendUrl}${clientOAuthCallbackPath}#${oneTimeCode}`);
}
function handleOAuthErrorAndGetRedirectUri(error) {
  if (error instanceof HttpError) {
    const errorMessage = isHttpErrorWithExtraMessage(error) ? `${error.message}: ${error.data.message}` : error.message;
    return getRedirectUriForError(errorMessage);
  }
  console.error("Unknown OAuth error:", error);
  return getRedirectUriForError("An unknown error occurred while trying to log in with the OAuth provider.");
}
function getRedirectUriForCallback(providerName) {
  return new URL(`${config$1.serverUrl}/auth/${providerName}/${callbackPath}`);
}
function getRedirectUriForError(error) {
  return new URL(`${config$1.frontendUrl}${clientOAuthCallbackPath}?error=${error}`);
}
function isHttpErrorWithExtraMessage(error) {
  return !!error.data && typeof error.data.message === "string";
}

function defineProvider({ id, displayName, oAuthClient }) {
  return {
    id,
    displayName,
    oAuthClient
  };
}

const id = "google";
const displayName = "Google";
const oAuthClient = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, getRedirectUriForCallback(id).toString());
const google = defineProvider({
  id,
  displayName,
  oAuthClient
});

const JWT_SECRET = new TextEncoder().encode(config$1.auth.jwtSecret);
const JWT_ALGORITHM = "HS256";
function createJWT(data, options) {
  return jwt.createJWT(JWT_ALGORITHM, JWT_SECRET, data, options);
}
async function validateJWT(token) {
  const { payload } = await jwt.validateJWT(JWT_ALGORITHM, JWT_SECRET, token);
  return payload;
}

const tokenStore = createTokenStore();
function createTokenStore() {
  const usedTokens = /* @__PURE__ */ new Map();
  const validFor = new TimeSpan(1, "m");
  const cleanupAfter = 1e3 * 60 * 60;
  function createToken(userId) {
    return createJWT({
      id: userId
    }, {
      expiresIn: validFor
    });
  }
  function verifyToken(token) {
    return validateJWT(token);
  }
  function isUsed(token) {
    return usedTokens.has(token);
  }
  function markUsed(token) {
    usedTokens.set(token, Date.now());
    cleanUp();
  }
  function cleanUp() {
    const now = Date.now();
    for (const [token, timestamp] of usedTokens.entries()) {
      if (now - timestamp > cleanupAfter) {
        usedTokens.delete(token);
      }
    }
  }
  return {
    createToken,
    verifyToken,
    isUsed,
    markUsed
  };
}

function setupOneTimeCodeRoute(router) {
  router.post(
    `/${exchangeCodeForTokenPath}`,
    defineHandler(async (req, res) => {
      const { code } = req.body;
      if (code === void 0) {
        throw new HttpError(400, "Unable to login with the OAuth provider. The code is missing.");
      }
      if (tokenStore.isUsed(code)) {
        throw new HttpError(400, "Unable to login with the OAuth provider. The code has already been used.");
      }
      const { id: authId } = await tokenStore.verifyToken(code);
      const auth = await findAuthWithUserBy({ id: authId });
      if (auth === null) {
        throw new HttpError(400, "Unable to login with the OAuth provider. The code is invalid.");
      }
      const session = await createSession(auth.id);
      tokenStore.markUsed(code);
      res.json({
        sessionId: session.id
      });
    })
  );
}

function mergeDefaultAndUserConfig(defaultConfig, userConfigFn) {
  if (!userConfigFn) {
    return defaultConfig;
  }
  return {
    ...defaultConfig,
    ...userConfigFn()
  };
}

function setOAuthCookieValue(provider, res, fieldName, value) {
  const cookieName = `${provider.id}_${fieldName}`;
  res.cookie(cookieName, value, {
    httpOnly: true,
    secure: !config$1.isDevelopment,
    path: "/",
    maxAge: 60 * 60 * 1e3
    // 1 hour
  });
}
function getOAuthCookieValue(provider, req, fieldName) {
  const cookieName = `${provider.id}_${fieldName}`;
  const cookies = parseCookies(req.headers.cookie ?? "");
  return cookies.get(cookieName);
}

function generateAndStoreOAuthState({
  oAuthType,
  provider,
  res
}) {
  const state = {
    ...generateState(),
    ...generateCodeVerifier()
  };
  storeOAuthState(provider, res, state);
  return state;
}
function validateAndGetOAuthState({
  oAuthType,
  provider,
  req
}) {
  const state = {
    ...getCode(req),
    ...getState(req),
    ...getCodeVerifier(provider, req)
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
  if (typeof state.code !== "string") {
    throw new Error("Invalid code");
  }
  const storedState = getOAuthCookieValue(provider, req, "state");
  if (!state.state || !storedState || storedState !== state.state) {
    throw new Error("Invalid state");
  }
  if (isOAuthStateWithPKCE(state) && !state.codeVerifier) {
    throw new Error("Missing code verifier");
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
  const codeVerifier = getOAuthCookieValue(
    provider,
    req,
    "codeVerifier"
  );
  return { codeVerifier };
}
function isOAuthStateWithPKCE(state) {
  return "codeVerifier" in state;
}

const onBeforeSignupHook = async (_params) => {
};
const onAfterSignupHook = async (_params) => {
};
const onBeforeOAuthRedirectHook = async (params) => params;
const onBeforeLoginHook = async (_params) => {
};
const onAfterLoginHook = async (_params) => {
};

async function finishOAuthFlowAndGetRedirectUri({
  provider,
  providerProfile,
  providerUserId,
  userSignupFields,
  req,
  oauth
}) {
  const providerId = createProviderId(provider.id, providerUserId);
  const authId = await getAuthIdFromProviderDetails({
    providerId,
    providerProfile,
    userSignupFields,
    req,
    oauth
  });
  const oneTimeCode = await tokenStore.createToken(authId);
  return getRedirectUriForOneTimeCode(oneTimeCode);
}
async function getAuthIdFromProviderDetails({
  providerId,
  providerProfile,
  userSignupFields,
  req,
  oauth
}) {
  const existingAuthIdentity = await dbClient.authIdentity.findUnique({
    where: {
      providerName_providerUserId: providerId
    },
    include: {
      auth: {
        include: {
          user: true
        }
      }
    }
  });
  if (existingAuthIdentity) {
    const authId = existingAuthIdentity.auth.id;
    const auth = await findAuthWithUserBy({ id: authId });
    if (auth === null) {
      throw new Error("Auth entity not found while trying to log in with OAuth");
    }
    await onBeforeLoginHook({
      user: auth.user
    });
    await onAfterLoginHook({
      user: auth.user
    });
    return authId;
  } else {
    const userFields = await validateAndGetUserFields(
      { profile: providerProfile },
      userSignupFields
    );
    const providerData = await sanitizeAndSerializeProviderData({});
    await onBeforeSignupHook();
    const user = await createUser(
      providerId,
      providerData,
      // Using any here because we want to avoid TypeScript errors and
      // rely on Prisma to validate the data.
      userFields
    );
    await onAfterSignupHook();
    return user.auth.id;
  }
}

function createOAuthProviderRouter({
  provider,
  oAuthType,
  userSignupFields,
  getAuthorizationUrl,
  getProviderTokens,
  getProviderInfo
}) {
  const router = Router();
  router.get(
    `/${loginPath}`,
    defineHandler(async (req, res) => {
      const oAuthState = generateAndStoreOAuthState({
        oAuthType,
        provider,
        res
      });
      const redirectUrl = await getAuthorizationUrl(oAuthState);
      const { url: redirectUrlAfterHook } = await onBeforeOAuthRedirectHook({
        req,
        url: redirectUrl,
        oauth: { uniqueRequestId: oAuthState.state }
      });
      redirect(res, redirectUrlAfterHook.toString());
    })
  );
  router.get(
    `/${callbackPath}`,
    defineHandler(async (req, res) => {
      try {
        const oAuthState = validateAndGetOAuthState({
          oAuthType,
          provider,
          req
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
              tokens
            }
          });
          redirect(res, redirectUri.toString());
        } catch (e) {
          rethrowPossibleAuthError(e);
        }
      } catch (e) {
        console.error(e);
        const redirectUri = handleOAuthErrorAndGetRedirectUri(e);
        redirect(res, redirectUri.toString());
      }
    })
  );
  return router;
}

const googleDataSchema = z$1.object({
  profile: z$1.object({
    email: z$1.string(),
    name: z$1.string()
  })
});
const getUserFields = defineUserSignupFields({
  email: (data) => {
    const googleData = googleDataSchema.parse(data);
    return googleData.profile.email;
  },
  username: (data) => {
    const googleData = googleDataSchema.parse(data);
    return googleData.profile.name;
  }
});
function config() {
  return {
    scopes: ["profile", "email"]
  };
}

const _waspUserSignupFields = getUserFields;
const _waspUserDefinedConfigFn = config;
const _waspConfig = {
  id: google.id,
  displayName: google.displayName,
  createRouter(provider) {
    const config2 = mergeDefaultAndUserConfig(
      {
        scopes: ["profile"]
      },
      _waspUserDefinedConfigFn
    );
    async function getGoogleProfile(accessToken) {
      const response = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      const providerProfile = await response.json();
      if (!providerProfile.sub) {
        throw new Error("Invalid profile");
      }
      return { providerProfile, providerUserId: providerProfile.sub };
    }
    return createOAuthProviderRouter({
      provider,
      oAuthType: "OAuth2WithPKCE",
      userSignupFields: _waspUserSignupFields,
      getAuthorizationUrl: ({ state, codeVerifier }) => google.oAuthClient.createAuthorizationURL(state, codeVerifier, config2),
      getProviderTokens: ({ code, codeVerifier }) => google.oAuthClient.validateAuthorizationCode(code, codeVerifier),
      getProviderInfo: ({ accessToken }) => getGoogleProfile(accessToken)
    });
  }
};

const providers = [
  _waspConfig
];
const router$3 = Router();
setupOneTimeCodeRoute(router$3);
for (const provider of providers) {
  const { createRouter } = provider;
  const providerRouter = createRouter(provider);
  router$3.use(`/${provider.id}`, providerRouter);
  console.log(`\u{1F680} "${provider.displayName}" auth initialized`);
}

const router$2 = express.Router();
router$2.get("/me", auth, me);
router$2.post("/logout", auth, logout);
router$2.use("/", router$3);

function formatFromField({ email, name }) {
  if (name) {
    return `${name} <${email}>`;
  }
  return email;
}
function getDefaultFromField() {
  return {
    email: "ikram0pakitan@gmail.com",
    name: "CoverLetterGPT"
  };
}

function initSmtpEmailSender(config) {
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.username,
      pass: config.password
    }
  });
  const defaultFromField = getDefaultFromField();
  return {
    async send(email) {
      return transporter.sendMail({
        from: formatFromField(email.from || defaultFromField),
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html
      });
    }
  };
}

const emailProvider = {
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  username: env.SMTP_USERNAME,
  password: env.SMTP_PASSWORD
};
const emailSender = initSmtpEmailSender(emailProvider);

const stripe = new Stripe(process.env.STRIPE_KEY, {
  apiVersion: "2023-08-16"
});
const stripeWebhook = async (request, response, context) => {
  console.log("\n\n <<<< custom webhook route >>>> \n\n");
  let event = request.body;
  let userStripeId = null;
  const session = event.data.object;
  userStripeId = session.customer;
  try {
    if (event.type === "payment_intent.succeeded") {
      console.log("payment succeeded", "\n\n", event);
    }
    if (event.type === "checkout.session.completed") {
      console.log("checkout.session.completed", event.type, "\n\n", event);
      const { line_items, metadata } = await stripe.checkout.sessions.retrieve(
        session.id,
        {
          expand: ["line_items.data.price"]
        }
      );
      console.log("line_items: ", line_items);
      console.log("session metadata: ", metadata);
      if (metadata?.planType && metadata?.duration) {
        console.log(
          `New subscription plan purchased: ${metadata.planType} - ${metadata.duration}`
        );
        const whereClause = metadata.userId ? { id: metadata.userId } : { stripeId: userStripeId };
        const user = await context.entities.User.findFirst({
          where: whereClause,
          select: {
            id: true,
            pendingPlanType: true,
            pendingPlanDuration: true
          }
        });
        if (user) {
          const planType = metadata.planType || user.pendingPlanType;
          const duration = metadata.duration || user.pendingPlanDuration;
          const gptModel = planType === "full-suite" ? "claude-sonnet-4.1" : "gpt-4o-mini";
          await context.entities.User.updateMany({
            where: whereClause,
            data: {
              hasPaid: true,
              datePaid: /* @__PURE__ */ new Date(),
              currentPlanType: planType,
              currentPlanDuration: duration,
              pendingPlanType: null,
              pendingPlanDuration: null,
              gptModel,
              subscriptionStatus: "active"
            }
          });
          console.log(`User updated with plan: ${planType} (${duration})`);
        } else {
          console.error("User not found for plan assignment");
        }
      } else if (line_items?.data[0]?.price?.id === process.env.GPT4_PRICE_ID) {
        console.log("GPT4o Subscription purchased (legacy)");
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            hasPaid: true,
            gptModel: "gpt-4o",
            datePaid: /* @__PURE__ */ new Date(),
            currentPlanType: "full-suite",
            currentPlanDuration: "monthly",
            pendingPlanType: null,
            pendingPlanDuration: null,
            subscriptionStatus: "active"
          }
        });
      } else if (line_items?.data[0]?.price?.id === process.env.PRODUCT_PRICE_ID) {
        console.log("gpt-4o-mini Subscription purchased (legacy)");
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            hasPaid: true,
            datePaid: /* @__PURE__ */ new Date(),
            gptModel: "gpt-4o-mini",
            currentPlanType: "cover-letter",
            currentPlanDuration: "monthly",
            pendingPlanType: null,
            pendingPlanDuration: null,
            subscriptionStatus: "active"
          }
        });
      } else if (line_items?.data[0]?.price?.id === process.env.PRODUCT_CREDITS_PRICE_ID) {
        console.log("Credits purchased: ");
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            credits: {
              increment: 10
            },
            gptModel: "gpt-4o-mini"
          }
        });
      }
    } else if (event.type === "invoice.paid") {
      console.log(">>>> invoice.paid");
      const invoice = event.data.object;
      const periodStart = new Date(invoice.period_start * 1e3);
      await context.entities.User.updateMany({
        where: {
          stripeId: userStripeId
        },
        data: {
          hasPaid: true,
          datePaid: periodStart,
          subscriptionStatus: "active"
        }
      });
    } else if (event.type === "invoice.payment_failed") {
      console.log(">>>> invoice.payment_failed for user: ", userStripeId);
      await context.entities.User.updateMany({
        where: {
          stripeId: userStripeId
        },
        data: {
          subscriptionStatus: "past_due"
        }
      });
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      userStripeId = subscription.customer;
      console.log("SUBSCRIPTION UPDATED: ", subscription);
      if (subscription.metadata?.planType && subscription.metadata?.duration) {
        const planType = subscription.metadata.planType;
        const duration = subscription.metadata.duration;
        const gptModel = planType === "full-suite" ? "claude-sonnet-4.1" : "gpt-4o-mini";
        console.log(`Subscription updated to: ${planType} (${duration})`);
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            currentPlanType: planType,
            currentPlanDuration: duration,
            pendingPlanType: null,
            pendingPlanDuration: null,
            gptModel,
            subscriptionStatus: subscription.status
          }
        });
      }
      if (subscription.status === "active") {
        console.log("Subscription active ", userStripeId);
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            subscriptionStatus: "active"
          }
        });
      }
      if (subscription.status === "past_due") {
        console.log("Subscription past due: ", userStripeId);
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            subscriptionStatus: "past_due"
          }
        });
      }
      if (subscription.cancel_at_period_end) {
        console.log("Subscription canceled at period end: ", userStripeId);
        const customer = await context.entities.User.findFirst({
          where: {
            stripeId: userStripeId
          },
          select: {
            email: true
          }
        });
        await context.entities.User.updateMany({
          where: {
            stripeId: userStripeId
          },
          data: {
            subscriptionStatus: "canceled"
          }
        });
        if (customer?.email) {
          await emailSender.send({
            to: customer.email,
            subject: "We hate to see you go :(",
            text: "We're sorry if you weren't satisfied with your experience. We'd love to hear your feedback. Please reply to this email with any comments or concerns. We're always looking to improve! ",
            html: "We're sorry if you weren't satisfied with your experience. We'd love to hear your feedback. Please reply to this email with any comments or concerns. We're always looking to improve! "
          });
        }
      }
    } else if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.canceled") {
      const subscription = event.data.object;
      userStripeId = subscription.customer;
      console.log("Subscription deleted/ended: ", userStripeId);
      await context.entities.User.updateMany({
        where: {
          stripeId: userStripeId
        },
        data: {
          hasPaid: false,
          subscriptionStatus: "ended",
          currentPlanType: null,
          currentPlanDuration: null
        }
      });
    } else {
      console.log(`Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.log("error", error);
  }
  response.json({ received: true });
};

const idFn = (x) => x;
const _waspstripeWebhookmiddlewareConfigFn = idFn;
const _wasplnLoginmiddlewareConfigFn = idFn;
const router$1 = express.Router();
const stripeWebhookMiddleware = globalMiddlewareConfigForExpress(
  _waspstripeWebhookmiddlewareConfigFn
);
router$1.post(
  "/stripe-webhook",
  [auth, ...stripeWebhookMiddleware],
  defineHandler(
    (req, res) => {
      const context = {
        user: makeAuthUserIfPossible(req.user),
        entities: {
          User: dbClient.user
        }
      };
      return stripeWebhook(req, res, context);
    }
  )
);
const lnLoginMiddleware = globalMiddlewareConfigForExpress(
  _wasplnLoginmiddlewareConfigFn
);
router$1.get(
  "/ln-login",
  [auth, ...lnLoginMiddleware],
  defineHandler(
    (req, res) => {
      const context = {
        user: makeAuthUserIfPossible(req.user),
        entities: {
          User: dbClient.user,
          LnData: dbClient.lnData
        }
      };
      return lnLogin(req, res, context);
    }
  )
);

const router = express.Router();
const middleware = globalMiddlewareConfigForExpress();
router.get("/", middleware, function(_req, res) {
  res.status(200).send();
});
router.use("/auth", middleware, router$2);
router.use("/operations", middleware, router$4);
router.use(router$1);

const app = express();
app.use("/", router);
app.use((err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ message: err.message, data: err.data });
  }
  return next(err);
});

const boss = createPgBoss();
function createPgBoss() {
  let pgBossNewOptions = {
    connectionString: config$1.databaseUrl
  };
  if (env.PG_BOSS_NEW_OPTIONS) {
    try {
      pgBossNewOptions = JSON.parse(env.PG_BOSS_NEW_OPTIONS);
    } catch {
      console.error("Environment variable PG_BOSS_NEW_OPTIONS was not parsable by JSON.parse()!");
    }
  }
  return new PgBoss(pgBossNewOptions);
}
let resolvePgBossStarted;
let rejectPgBossStarted;
const pgBossStarted = new Promise((resolve, reject) => {
  resolvePgBossStarted = resolve;
  rejectPgBossStarted = reject;
});
var PgBossStatus;
(function(PgBossStatus2) {
  PgBossStatus2["Unstarted"] = "Unstarted";
  PgBossStatus2["Starting"] = "Starting";
  PgBossStatus2["Started"] = "Started";
  PgBossStatus2["Error"] = "Error";
})(PgBossStatus || (PgBossStatus = {}));
let pgBossStatus = PgBossStatus.Unstarted;
async function startPgBoss() {
  if (pgBossStatus !== PgBossStatus.Unstarted) {
    return;
  }
  pgBossStatus = PgBossStatus.Starting;
  console.log("Starting pg-boss...");
  boss.on("error", (error) => console.error(error));
  try {
    await boss.start();
  } catch (error) {
    console.error("pg-boss failed to start!");
    console.error(error);
    pgBossStatus = PgBossStatus.Error;
    rejectPgBossStarted(boss);
    return;
  }
  resolvePgBossStarted(boss);
  console.log("pg-boss started!");
  pgBossStatus = PgBossStatus.Started;
}

class Job {
  jobName;
  executorName;
  constructor(jobName, executorName) {
    this.jobName = jobName;
    this.executorName = executorName;
  }
}
class SubmittedJob {
  job;
  jobId;
  constructor(job, jobId) {
    this.job = job;
    this.jobId = jobId;
  }
}

const PG_BOSS_EXECUTOR_NAME = Symbol("PgBoss");
function createJobDefinition({ jobName, defaultJobOptions, jobSchedule, entities }) {
  return new PgBossJob(jobName, defaultJobOptions, entities, jobSchedule);
}
function registerJob({ job, jobFn }) {
  pgBossStarted.then(async (boss) => {
    await boss.offWork(job.jobName);
    await boss.work(job.jobName, pgBossCallbackWrapper(jobFn, job.entities));
    if (job.jobSchedule) {
      const options = {
        ...job.defaultJobOptions,
        ...job.jobSchedule.options
      };
      await boss.schedule(job.jobName, job.jobSchedule.cron, job.jobSchedule.args, options);
    }
  });
}
class PgBossJob extends Job {
  defaultJobOptions;
  startAfter;
  entities;
  jobSchedule;
  constructor(jobName, defaultJobOptions, entities, jobSchedule, startAfter) {
    super(jobName, PG_BOSS_EXECUTOR_NAME);
    this.defaultJobOptions = defaultJobOptions;
    this.entities = entities;
    this.jobSchedule = jobSchedule;
    this.startAfter = startAfter;
  }
  delay(startAfter) {
    return new PgBossJob(this.jobName, this.defaultJobOptions, this.entities, this.jobSchedule, startAfter);
  }
  async submit(jobArgs, jobOptions = {}) {
    const boss = await pgBossStarted;
    const jobId = await boss.send(this.jobName, jobArgs, {
      ...this.defaultJobOptions,
      ...this.startAfter && { startAfter: this.startAfter },
      ...jobOptions
    });
    return new PgBossSubmittedJob(boss, this, jobId);
  }
}
class PgBossSubmittedJob extends SubmittedJob {
  pgBoss;
  constructor(boss, job, jobId) {
    super(job, jobId);
    this.pgBoss = {
      cancel: () => boss.cancel(jobId),
      resume: () => boss.resume(jobId),
      // Coarcing here since pg-boss typings are not precise enough.
      details: () => boss.getJobById(jobId)
    };
  }
}
function pgBossCallbackWrapper(jobFn, entities) {
  return (args) => {
    const context = { entities };
    return jobFn(args.data, context);
  };
}

async function updateUserSubscription(_args, context) {
  console.log("Starting CRON JOB: \n\nUpdating user subscriptions...");
  const currentDate = /* @__PURE__ */ new Date();
  const threeMonthsAgo = new Date(currentDate.setMonth(currentDate.getMonth() - 3));
  let expiredUserSubscriptions = await context.entities.User.findMany({
    where: {
      datePaid: {
        lt: threeMonthsAgo
      }
    }
  });
  const updatedSubscriptions = await Promise.allSettled(
    expiredUserSubscriptions.map(async (user) => {
      try {
        const updatedSubscription = await context.entities.User.update({
          where: {
            id: user.id
          },
          data: {
            hasPaid: false,
            datePaid: null
          }
        });
        return updatedSubscription;
      } catch (error) {
        console.error("Error updating User payment fields for user: ", user.id, error);
      }
    })
  );
  console.log("Updated user subscriptions: ", updatedSubscriptions);
}

const entities = {
  User: dbClient.user
};
const jobSchedule = {
  cron: "0 23 * * *",
  options: {}
};
const checkUserSubscription = createJobDefinition({
  jobName: "checkUserSubscription",
  defaultJobOptions: {},
  jobSchedule,
  entities
});

registerJob({
  job: checkUserSubscription,
  jobFn: updateUserSubscription
});

const startServer = async () => {
  await startPgBoss();
  const port = normalizePort(config$1.port);
  app.set("port", port);
  const server = http.createServer(app);
  server.listen(3e3);
  server.on("error", (error) => {
    if (error.syscall !== "listen") throw error;
    const bind = typeof port === "string" ? "Pipe " + port : "Port " + port;
    switch (error.code) {
      case "EACCES":
        console.error(bind + " requires elevated privileges");
        process.exit(1);
      case "EADDRINUSE":
        console.error(bind + " is already in use");
        process.exit(1);
      default:
        throw error;
    }
  });
  server.on("listening", () => {
    const addr = server.address();
    const bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
    console.log("Server listening on " + bind);
  });
};
startServer().catch((e) => console.error(e));
function normalizePort(val) {
  const port = parseInt(val, 10);
  if (isNaN(port)) return val;
  if (port >= 0) return port;
  return false;
}
//# sourceMappingURL=server.js.map
