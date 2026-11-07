const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const walletRoutes = require('./routes/walletRoutes');
const payoutRoutes = require('./routes/payoutRoutes');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const adminRoutes = require('./routes/adminRoutes');

const { globalLimiter } = require('./middleware/rateLimiter');
const { mongoSanitize } = require('./middleware/sanitize');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Security HTTP Headers
app.use(helmet());

// CORS configuration: allow environment-specified origins, localhost, and all Vercel deployments
const envOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : [];

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'https://veloop-wallet-withdrawal.vercel.app'
];

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Allow curl, mobile, server-to-server
  if (envOrigins.includes('*')) return true;
  if (envOrigins.includes(origin)) return true;
  if (defaultAllowedOrigins.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    // Allow any .vercel.app domain (production and preview branches)
    if (parsed.hostname.endsWith('.vercel.app')) return true;
    // Allow any localhost port
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
  } catch (e) {
    // ignore URL parsing error
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-internal-api-key']
  })
);

// Body parser with size limit to prevent payload flooding
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// NoSQL Injection sanitization
app.use(mongoSanitize);

// Moderate Global Rate Limiting
app.use(globalLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const isHealthy = dbStatus === 'connected';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/admin', adminRoutes);

// Catch-all 404 handler
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;

