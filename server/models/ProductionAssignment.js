const mongoose = require('mongoose');

const productionAssignmentSchema = new mongoose.Schema({
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
    },
    taskId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Task',
        required: true,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    boardsAssigned: {
        type: Number,
        default: 0,
        min: 0,
    },
    boardsCompleted: {
        type: Number,
        default: 0,
        min: 0,
    },
    boardsCompletedDraft: {
        type: Number,
        default: 0,
        min: 0,
    },
    boardsCompletedApproved: {
        type: Number,
        default: 0,
        min: 0,
    },
    status: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'REJECTED'],
        default: 'NOT_STARTED',
    },
    deadline: {
        type: Date,
        default: null,
    },
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    assignedAt: {
        type: Date,
        default: Date.now,
    },
    completedAt: {
        type: Date,
        default: null,
    },
    allocatedMinutes: {
        type: Number,
        default: null,
    },
    actualMinutes: {
        type: Number,
        default: null,
    },
    performanceScore: {
        type: Number,
        default: null,
    },
    delayReason: {
        type: String,
        default: '',
    },
    delayStatus: {
        type: String,
        enum: ['NONE', 'PENDING_MANAGER', 'APPROVED', 'REJECTED'],
        default: 'NONE',
    },
    delayRequestedAt: {
        type: Date,
        default: null,
    },
    managerDelayApproved: {
        type: Boolean,
        default: false,
    },
    managerDelayReviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    managerDelayReviewedAt: {
        type: Date,
        default: null,
    },
    rejectionReason: {
        type: String,
        default: '',
    },
}, {
    timestamps: true,
});

productionAssignmentSchema.index({ taskId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('ProductionAssignment', productionAssignmentSchema);
