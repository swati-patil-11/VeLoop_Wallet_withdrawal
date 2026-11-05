const { z } = require('zod');

const registerSchema = z.object({
  email: z.string().email('Invalid email address').max(255).toLowerCase().trim(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100)
}).strict();

const loginSchema = z.object({
  email: z.string().email('Invalid email address').max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Password is required')
}).strict();

module.exports = {
  registerSchema,
  loginSchema
};
