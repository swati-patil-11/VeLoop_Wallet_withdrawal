const { z } = require('zod');
const { PAYOUT_METHODS, WITHDRAWAL_STATUS } = require('../config/constants');

// Header schema for mutation routes
const idempotencyHeaderSchema = z.object({
  'idempotency-key': z
    .string({ required_error: 'Idempotency-Key header is required.' })
    .uuid('Idempotency-Key must be a valid UUID v4.')
}).passthrough();

// Method-specific payoutDetails schemas
const upiDetailsSchema = z.object({
  upiId: z
    .string()
    .trim()
    .min(3, 'UPI ID is required')
    .max(100)
    .regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI ID format (expected user@bank)')
}).strict();

const paypalDetailsSchema = z.object({
  email: z.string().email('Invalid PayPal email address').trim().toLowerCase()
}).strict();

const giftCardDetailsSchema = z.object({
  email: z.string().email('Valid delivery email address is required').trim().toLowerCase(),
  phone: z.string().optional()
}).strict();

// Create withdrawal schema: STRICTLY ONLY method, optionId, payoutDetails
const createWithdrawalSchema = z.object({
  method: z.enum(Object.values(PAYOUT_METHODS), {
    required_error: 'Payout method is required'
  }),
  optionId: z.string().min(1, 'optionId is required').trim(),
  payoutDetails: z.record(z.any(), { required_error: 'payoutDetails is required' })
}).strict();

// Rejection schema
const rejectWithdrawalSchema = z.object({
  rejectionReason: z
    .string({ required_error: 'rejectionReason is required' })
    .min(3, 'Rejection reason must be at least 3 characters')
    .max(500)
    .trim(),
  reviewNote: z.string().max(500).optional()
}).strict();

// Approval / Processing schema
const reviewWithdrawalSchema = z.object({
  reviewNote: z.string().max(500).optional()
}).strict();

// Update Payout Option schema (Admin)
const updatePayoutOptionSchema = z.object({
  active: z.boolean().optional(),
  payoutValue: z.number().positive().optional(),
  requiredAmount: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  metadata: z.record(z.any()).optional()
}).strict();

module.exports = {
  idempotencyHeaderSchema,
  upiDetailsSchema,
  paypalDetailsSchema,
  giftCardDetailsSchema,
  createWithdrawalSchema,
  rejectWithdrawalSchema,
  reviewWithdrawalSchema,
  updatePayoutOptionSchema
};
