// Load .env for local development. On Railway the variables are already in the
// environment and this is a no-op (it never overwrites what is already set).
import 'dotenv/config';
import { z } from 'zod';

/**
 * Central, validated view of process.env. Import `env` anywhere; never read
 * process.env directly elsewhere. Fails fast at boot on invalid config.
 */

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim().replace(/\/$/, ''))
        .filter(Boolean),
    ),

  JWT_SECRET: z.string().min(1).default('dev-insecure-secret-change-me'),
  OPERATOR_PASSWORD_HASH: z.string().optional(),
  OPERATOR_PASSWORD: z.string().optional(),
  OPERATOR_JWT_TTL: z.string().default('24h'),

  /** Optional shared secret for the big screen; unset = display connects freely. */
  DISPLAY_KEY: z.string().optional(),

  REDIS_URL: z.string().optional(),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

// Production refuses to boot on dev-grade secrets, rather than quietly running
// with a plaintext password in Railway's variables or a guessable JWT secret.
if (isProd) {
  const problems: string[] = [];
  if (!env.OPERATOR_PASSWORD_HASH) {
    problems.push('OPERATOR_PASSWORD_HASH is required (generate it with `npm run hash -- "password"`).');
  }
  if (env.OPERATOR_PASSWORD) {
    problems.push('Remove OPERATOR_PASSWORD — production uses OPERATOR_PASSWORD_HASH only.');
  }
  if (env.JWT_SECRET.length < 32 || env.JWT_SECRET === 'dev-insecure-secret-change-me') {
    problems.push('JWT_SECRET must be a random string of at least 32 characters.');
  }
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
}
