const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['LOGIN', 'LOGIN_MICROSOFT', 'LOGIN_GOOGLE', 'LOGIN_GITHUB',
            'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
            'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED', 'PROJECT_STATUS_UPDATED',
            'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_TRANSFERRED',
            'PRODUCT_CREATED', 'EXCEL_IMPORT',
            'STOCK_ISSUED', 'STOCK_CONSUMED', 'RETURN_REQUESTED', 'STOCK_RETURNED'],
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
