const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['LOGIN', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
            'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED',
            'PROJECT_STATUS_UPDATED',
            'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_TRANSFERRED',
            'STOCK_ISSUED', 'STOCK_RETURNED',
            'INV_MASTER_CREATE', 'INV_MASTER_UPDATE', 'INV_MASTER_DELETE', 'INV_MASTER_IMPORT',
            'INV_MR_SUBMIT', 'INV_MR_ROUTE', 'INV_MR_BULK_ROUTE',
            'INV_STOCK_ADJUST', 'INV_STOCK_APPROVE',
            'INV_DISPATCH', 'INV_DISPATCH_ACK',
            'INV_PO_CREATE', 'INV_PO_REVIEW', 'INV_PO_PLACE',
            'INV_INWARD', 'INV_STOCK_INWARD', 'INV_STORE_CONFIRM', 'INV_SHORTAGE_APPROVED'],
    },
    message: {
        type: String,
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    userName: {
        type: String,
    },
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    targetName: {
        type: String,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

// Index for faster queries
activitySchema.index({ timestamp: -1 });
activitySchema.index({ userId: 1 });

module.exports = mongoose.model('Activity', activitySchema);
