const mongoose = require('mongoose');
const { AUDIT_ACTIONS } = require('../config/constants');

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: String,
      required: true,
      index: true
    },
    actorRole: {
      type: String,
      required: true
    },
    action: {
      type: String,
      enum: Object.values(AUDIT_ACTIONS),
      required: true,
      index: true
    },
    targetUserId: {
      type: String,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      default: 'WALLET'
    },
    referenceId: {
      type: String,
      index: true,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ip: {
      type: String,
      default: 'unknown'
    },
    userAgent: {
      type: String,
      default: 'unknown'
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false } // Append-only, never updated
  }
);

auditLogSchema.index({ targetUserId: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;

