const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true,
      index: true
    },
    endpoint: {
      type: String,
      required: true
    },
    requestHash: {
      type: String
    },
    responseSnapshot: {
      type: mongoose.Schema.Types.Mixed
    },
    statusCode: {
      type: Number,
      default: 200
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 } // TTL index: documents expire when Date.now() >= expiresAt
    }
  },
  {
    timestamps: true
  }
);

idempotencyRecordSchema.index({ userId: 1, key: 1, endpoint: 1 }, { unique: true });

const IdempotencyRecord = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
module.exports = IdempotencyRecord;

