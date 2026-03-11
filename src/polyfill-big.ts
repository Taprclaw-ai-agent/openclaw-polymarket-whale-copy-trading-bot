/**
 * Load @vihat/bignum via require() so it uses the CJS build.
 * The CJS build works correctly; the ESM build fails in Node (this=undefined).
 * We then set globalThis.Big for any code that expects global Big.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Big = require('@vihat/bignum');
(globalThis as Record<string, unknown>).Big = Big;
