import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DB_TYPE: z.enum(['postgres', 'mysql', 'mariadb', 'sqlite']).default('postgres'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_DATABASE: z.string().min(1),
  DB_SYNCHRONIZE: z
    .string()
    .transform((val) => val === 'true')
    .default(false),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(604800),
  WEBHOOK_EXPIRATION_THRESHOLD_SECONDS: z.coerce.number().default(180),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().min(1),

  PROVIDER_FRONTEND_URL: z.string().url(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const formattedErrors = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    console.error('Falha na validação das variáveis de ambiente:', formattedErrors);
    throw new Error('Configuração de ambiente inválida.');
  }

  return parsed.data;
}