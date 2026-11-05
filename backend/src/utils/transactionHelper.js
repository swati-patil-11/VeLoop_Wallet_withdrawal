const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Execute a unit of work inside a MongoDB transaction with retry on TransientTransactionError.
 * If an existing session is passed, work runs within that session without creating/committing a new one.
 *
 * @param {Function} workFn - async function(session) returning result
 * @param {mongoose.ClientSession|null} [existingSession] - Optional external session
 * @param {number} [maxRetries=3] - Max retries for transient transaction errors
 * @returns {Promise<any>}
 */
async function withTransaction(workFn, existingSession = null, maxRetries = 3) {
  if (existingSession) {
    return await workFn(existingSession);
  }

  let attempt = 0;
  while (true) {
    attempt++;
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await workFn(session);
      });
      return result;
    } catch (err) {
      const isTransient =
        err.hasErrorLabel &&
        (err.hasErrorLabel('TransientTransactionError') ||
          err.hasErrorLabel('UnknownTransactionCommitResult'));

      if (isTransient && attempt < maxRetries) {
        logger.warn(
          { attempt, error: err.message },
          'Transient transaction error detected, retrying transaction...'
        );
        // Exponential backoff with small jitter
        const delay = Math.pow(2, attempt) * 50 + Math.floor(Math.random() * 50);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
}

module.exports = { withTransaction };
