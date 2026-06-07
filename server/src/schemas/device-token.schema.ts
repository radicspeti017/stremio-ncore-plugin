import { z } from 'zod';
import { languageValues } from '@/db/schema/users';

export const createDeviceTokenSchema = z.object({
  name: z.string().min(1),
  preferredLanguage: z.enum(languageValues).optional(),
});

export type CreateDeviceTokenInput = z.infer<typeof createDeviceTokenSchema>;

export const deleteDeviceTokenSchema = z.object({
  token: z.string(),
});

export type DeleteDeviceTokenInput = z.infer<typeof deleteDeviceTokenSchema>;
