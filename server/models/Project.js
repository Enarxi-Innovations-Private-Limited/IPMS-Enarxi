const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    projectCode: {
        type: String,
        unique: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        default: '',
    },
    department: {
        type: String,
        enum: ['SOFTWARE', 'HARDWARE'],
        default: 'SOFTWARE',
    },
    status: {
        type: String,
        enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'WAITING_APPROVAL', 'COMPLETED'],
        default: 'PLANNING',
    },
    managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    startDate: {
        type: Date,
        default: Date.now,
    },
    deadline: {
        type: Date,
        required: true,
    },
    budget: {
        type: Number,
        default: 0,
    },
    attachments: [{
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now }
    }],
    templateUsed: {
        type: String,
        default: '',
    },
    teamIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    projectType: {
        type: String,
        enum: ['GENERAL', 'PRODUCTION'],
        default: 'GENERAL',
    },
    totalBatchSize: {
        type: Number,
        default: 0,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Pre-save middleware to generate project code (PRJ-YYYY-NNN)
projectSchema.pre("save", async function () {
    if (this.isNew && !this.projectCode) {
        const currentYear = new Date().getFullYear();
        const prefix = `PRJ-${currentYear}-`;

        // Find the last project created this year
        const Project = mongoose.model('Project');
        const lastProject = await Project
            .findOne({ projectCode: { $regex: `^${prefix}` } })
            .sort({ projectCode: -1 });

        let nextNumber = 1;
        if (lastProject && lastProject.projectCode) {
            const lastNumber = parseInt(lastProject.projectCode.split('-')[2], 10);
            nextNumber = lastNumber + 1;
        }

        this.projectCode = `${prefix}${String(nextNumber).padStart(3, '0')}`;
    }
});

// Virtual for task count
projectSchema.virtual('taskCount', {
    ref: 'Task',
    localField: '_id',
    foreignField: 'projectId',
    count: true,
});

projectSchema.set('toJSON', { virtuals: true });
projectSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Project', projectSchema);

