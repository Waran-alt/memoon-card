import { z } from 'zod';

export const UiThemeSchema = z.enum(['light', 'dark', 'monokai', 'system']);

export const UpdateUserSettingsSchema = z.object({
  knowledge_enabled: z.boolean().optional(),
  ui_theme: UiThemeSchema.optional(),
});

export type UpdateUserSettingsBody = z.infer<typeof UpdateUserSettingsSchema>;
