const mongoose = require('mongoose');
const logger = require('../utils/logger');

async function connectDB() {
  const mongoURI =
    process.env.MONGO_URI || 'mongodb://localhost:27017/veloop_rewards?replicaSet=rs0';

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== 'production'
    });

    logger.info({ host: conn.connection.host }, 'MongoDB connected successfully');

    mongoose.connection.on('error', (err) => {
      logger.error({ error: err.message }, 'MongoDB connection runtime error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to connect to MongoDB');
    process.exit(1);
  }
}

module.exports = { connectDB };
