/**
 * Force HS256 for sign/verify so alg:none / RS confusion cannot bypass symmetric JWT_SECRET (grid 1.2).
 */

import type { SignOptions, VerifyOptions } from 'jsonwebtoken';

export const JWT_SIGN_OPTIONS_BASE: Pick<SignOptions, 'algorithm'> = {
  algorithm: 'HS256',
};

export const JWT_VERIFY_OPTIONS: VerifyOptions = {
  algorithms: ['HS256'],
};
