const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    type: {
        type: String,
        enum: ['PROJECT_ASSIGNMENT', 'TASK_ASSIGNMENT', 'STATUS_UPDATE', 'APPROVAL_REQUEST', 'TASK_UPDATE', 'PROJECT_UPDATE', 'SYSTEM', 'QUERY_RAISED', 'QUERY_RESOLVED'],
        default: 'SYSTEM'
    },
    relatedId: { type: mongoose.Schema.Types.ObjectId }, // ProjectID or TaskID
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
