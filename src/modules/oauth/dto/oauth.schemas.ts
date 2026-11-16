import { z } from 'zod';

export const geolocationSchema = z
  .object({
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
  })
  .optional();

export const loginInitSchema = z.object({
  email: z.email('E-mail invalido'),
  password: z.string().min(6, 'A senha deve ter no minimo 6 caracteres'),
  clientId: z.string().min(1),
  redirectUri: z.url('redirectUri deve ser uma URL valida'),
  codeChallenge: z.string().min(43, 'codeChallenge PKCE deve ter no minimo 43 caracteres'),
  codeChallengeMethod: z.enum(['S256', 'plain']).default('S256'),
  state: z.string().optional(),
  geolocation: geolocationSchema,
});

export type LoginInitDto = z.infer<typeof loginInitSchema>;

export const verifyTwoFactorSchema = z.object({
  challengeId: z.string().min(10),
  code: z.string().length(6, 'O codigo 2FA possui 6 digitos'),
});

export type VerifyTwoFactorDto = z.infer<typeof verifyTwoFactorSchema>;

export const magicLinkRequestSchema = z.object({
  email: z.email('E-mail invalido'),
  clientId: z.string().min(1),
  redirectUri: z.url(),
  codeChallenge: z.string().min(43),
  codeChallengeMethod: z.enum(['S256', 'plain']).default('S256'),
  state: z.string().optional(),
  geolocation: geolocationSchema,
});

export type MagicLinkRequestDto = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkVerifySchema = z.object({
  token: z.string().min(16),
});

export type MagicLinkVerifyDto = z.infer<typeof magicLinkVerifySchema>;

export const tokenExchangeSchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    client_id: z.string().min(1),
    client_secret: z.string().optional(),
    code: z.string().min(16),
    redirect_uri: z.url(),
    code_verifier: z.string().min(43, 'code_verifier PKCE obrigatorio'),
    ttl_override_seconds: z.number().int().min(30).max(3600).optional(),
  }),
  z.object({
    grant_type: z.literal('client_credentials'),
    client_id: z.string().min(1),
    client_secret: z.string().min(1),
    webhook_url: z.url().optional(),
    ttl_override_seconds: z.number().int().min(30).max(3600).optional(),
    geolocation: geolocationSchema,
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    client_id: z.string().min(1),
    refresh_token: z.string().min(20),
    ttl_override_seconds: z.number().int().min(30).max(3600).optional(),
  }),
]);

export type TokenExchangeDto = z.infer<typeof tokenExchangeSchema>;

export const externalTokenRequestSchema = z.object({
  providerTokenUrl: z.url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  webhookCallbackUrl: z.url(),
  ttlOverrideSeconds: z.number().int().min(30).max(3600).optional(),
  geolocation: geolocationSchema,
});

export type ExternalTokenRequestDto = z.infer<typeof externalTokenRequestSchema>;

export const updateClientWebhookSchema = z.object({
  clientId: z.string().min(1),
  webhookUrl: z.url(),
});

export type UpdateClientWebhookDto = z.infer<typeof updateClientWebhookSchema>;