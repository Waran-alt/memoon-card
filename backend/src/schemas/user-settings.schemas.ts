import { z } from 'zod';

const MIN = 1;
const MAX = 120;

export const UpdateSessionAutoEndAwaySchema = z.object({
  session_auto_end_away_minutes: z.coerce.number().int().min(MIN).max(MAX),
});

export const UpdateUserSettingsSchema = z.object({
  session_auto_end_away_minutes: z.coerce.number().int().min(MIN).max(MAX).optional(),
  knowledge_enabled: z.boolean().optional(),
});

export type UpdateSessionAutoEndAwayBody = z.infer<typeof UpdateSessionAutoEndAwaySchema>;
export type UpdateUserSettingsBody = z.infer<typeof UpdateUserSettingsSchema>;
