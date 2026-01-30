const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['LOGIN', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED',
            'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED',
            'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_TRANSFERRED',
            'STOCK_ISSUED', 'STOCK_RETURNED'],
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
