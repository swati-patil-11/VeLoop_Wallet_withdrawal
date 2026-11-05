const { z } = require('zod');
const {
  CURRENCY_LIST,
  CREDIT_SOURCES,
  DEBIT_SOURCES,
  TRANSACTION_TYPES
} = require('../config/constants');

const creditWalletSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
  currency: z.enum(CURRENCY_LIST),
  amount: z.number().int().positive('Amount must be a positive integer'),
  source: z.enum(Object.values(CREDIT_SOURCES)),
  description: z.string().max(255).optional(),
  referenceId: z.string().optional(),
  metadata: z.record(z.any()).optional()
}).strict();

const debitWalletSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
  currency: z.enum(CURRENCY_LIST),
  amount: z.number().int().positive('Amount must be a positive integer'),
  source: z.enum(Object.values(DEBIT_SOURCES)),
  description: z.string().max(255).optional(),
  referenceId: z.string().optional(),
  metadata: z.record(z.any()).optional()
}).strict();

const transactionQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  currency: z.enum(CURRENCY_LIST).optional(),
  type: z.enum(Object.values(TRANSACTION_TYPES)).optional()
}).passthrough();

module.exports = {
  creditWalletSchema,
  debitWalletSchema,
  transactionQuerySchema
};

