/**
 * Generate the bcrypt hash for OPERATOR_PASSWORD_HASH.
 *
 *   npm run hash -- 'the operator password'
 *
 * Paste the output into Railway as OPERATOR_PASSWORD_HASH and leave
 * OPERATOR_PASSWORD unset in production.
 */
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash -- 'your password'");
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 10));
