const mongoose = require('mongoose');

const projectDeadlineExtensionRequestSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
    },
    projectName: {
        type: String,
        required: true,
        trim: true,
    },
    projectCode: {
        type: String,
        default: '',
        trim: true,
    },
    currentDeadline: {
        type: Date,
        required: true,
    },
    requestedDeadline: {
        type: Date,
        required: true,
    },
    reason: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED'],
        default: 'PENDING',
        index: true,
    },
    requestedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    requestedByName: {
        type: String,
        required: true,
        trim: true,
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewedByName: {
        type: String,
        default: '',
        trim: true,
    },
    reviewedAt: {
        type: Date,
        default: null,
    },
    rejectionReason: {
        type: String,
        default: '',
        trim: true,
    },
}, {
    timestamps: true,
});

projectDeadlineExtensionRequestSchema.index({ projectId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ProjectDeadlineExtensionRequest', projectDeadlineExtensionRequestSchema);
