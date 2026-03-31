/**
 * Ensures a dev user exists from env (DEV_EMAIL, DEV_PASSWORD, DEV_USERNAME).
 * Call after DB is ready. No-op if DEV_EMAIL or DEV_PASSWORD is not set.
 * Production: enable only on purpose — creates/updates role `dev` (grid 1.7); keep DEV_PASSWORD secret.
 * - If a user with DEV_EMAIL exists: set role to 'dev', update password and name.
 * - Otherwise: create user with that email, role 'dev', and default user_settings.
 */
import { userService } from '@/services/user.service';
import { DEV_EMAIL, DEV_PASSWORD, DEV_USERNAME } from '@/config/env';
import { logger } from '@/utils/logger';

export async function ensureDevUser(): Promise<void> {
  const email = DEV_EMAIL;
  const password = DEV_PASSWORD;
  if (!email || !password) {
    logger.info('Dev account skipped (DEV_EMAIL or DEV_PASSWORD not set)');
    return;
  }

  const name = DEV_USERNAME ?? null;
  const existing = await userService.getUserByEmail(email);
  if (existing) {
    await userService.updateUserToDev(existing.id, password, name);
    logger.info('Dev account updated', { email });
    return;
  }

  await userService.createUser(email, password, name, 'dev');
  logger.info('Dev account created', { email });
}
