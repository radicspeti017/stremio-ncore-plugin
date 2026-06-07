import { z } from 'zod';

function sanitizeEnvString(value: string): string {
  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.startsWith('"') && trimmed.endsWith('"');
  const isSingleQuoted = trimmed.startsWith("'") && trimmed.endsWith("'");
  if (isDoubleQuoted || isSingleQuoted) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function sanitizeEnvValue(value: unknown): unknown {
  return typeof value === 'string' ? sanitizeEnvString(value) : value;
}

export const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    HTTPS_PORT: z.coerce.number().default(3443),
    TORRENT_SERVER_PORT: z.coerce.number().default(8080),
    ADDON_DIR: z.preprocess(sanitizeEnvValue, z.string()),
    NCORE_USERNAME: z.preprocess(sanitizeEnvValue, z.string()),
    NCORE_PASSWORD: z.preprocess(sanitizeEnvValue, z.string()),
    NCORE_COOKIE: z.preprocess(sanitizeEnvValue, z.string().optional()),
    TORRENTS_DIR: z.preprocess(sanitizeEnvValue, z.string().optional()),
    DOWNLOADS_DIR: z.preprocess(sanitizeEnvValue, z.string().optional()),
    NCORE_URL: z.preprocess(
      sanitizeEnvValue,
      z.string().url().default('https://ncore.pro'),
    ),
    CINEMETA_URL: z.preprocess(
      sanitizeEnvValue,
      z.string().url().default('https://v3-cinemeta.strem.io'),
    ),
  })
  .transform((env) => {
    return {
      ...env,
      TORRENTS_DIR: env.TORRENTS_DIR ?? `${env.ADDON_DIR}/torrents`,
      DOWNLOADS_DIR: env.DOWNLOADS_DIR ?? `${env.ADDON_DIR}/downloads`,
    };
  });

export type Env = z.infer<typeof envSchema>;
