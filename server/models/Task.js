const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        default: '',
    },
    status: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'ON_HOLD'],
        default: 'NOT_STARTED',
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
    },
    assigneeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    comments: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: String,
        text: String,
        createdAt: { type: Date, default: Date.now }
    }],
    queries: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: String,
        question: String,
        response: String,
        responseBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        responseByName: String,
        status: { type: String, enum: ['PENDING', 'RESOLVED'], default: 'PENDING' },
        createdAt: { type: Date, default: Date.now },
        respondedAt: Date,
        resolvedAt: Date
    }],
    // Deadline and Performance Tracking Fields
    assignedAt: { type: Date, default: null },           // When task was assigned to someone (start date)
    deadline: { type: Date, default: null },             // Deadline set by manager
    completedAt: { type: Date, default: null },          // When task was marked completed
    allocatedMinutes: { type: Number, default: null },   // Time allocated (deadline - assignedAt) in minutes
    actualMinutes: { type: Number, default: null },      // Time taken (completedAt - assignedAt) in minutes
    performanceScore: { type: Number, default: null },   // (allocatedMinutes / actualMinutes) * 100

    // Self-Assignment Tracking (for Manager Performance)
    selfAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Manager who self-assigned
    selfAssignedAt: { type: Date, default: null },       // When manager self-assigned the task
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },     // Who completed the task

    // Delay Reason Workflow
    delayReason: { type: String, default: null }, // Reason submitted by employee
    delayStatus: {
        type: String,
        enum: ['NONE', 'PENDING_MANAGER', 'PENDING_ADMIN', 'APPROVED', 'REJECTED'],
        default: 'NONE'
    },
    delayRequestedAt: { type: Date, default: null },

    // Manager Approval
    managerDelayApproved: { type: Boolean, default: false },
    managerDelayReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    managerDelayReviewedAt: { type: Date },

    // Admin Approval
    adminDelayApproved: { type: Boolean, default: false }, // Final approval (Excused Delay)
    adminDelayReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminDelayReviewedAt: { type: Date },

    // Rejection Tracking
    rejectionReason: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    
    // Production / Flow Control Fields
    isProductionTask: { type: Boolean, default: false },
    isFullProductStage: { type: Boolean, default: false },
    productionPhase: { type: String, default: '' },
    sequence: { type: Number, default: 0 },
    unitsCompleted: { type: Number, default: 0 },
    unitsCurrentlyHere: { type: Number, default: 0 },

    // Manager drag-to-reorder position (independent of production sequence)
    order: { type: Number, default: 0 }
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt
});

module.exports = mongoose.model('Task', taskSchema);
