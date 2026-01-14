const mongoose = require('mongoose');

const issuedItemSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    productName: {
        type: String,
        required: true,
    },
    partNumber: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    employeeName: {
        type: String,
        required: true,
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        default: null,
    },
    purpose: {
        type: String,
        default: '',
        trim: true,
    },
    status: {
        type: String,
        enum: ['ISSUED', 'RETURNED', 'OVERDUE'],
        default: 'ISSUED',
    },
    issueDate: {
        type: Date,
        default: Date.now,
    },
    expectedReturnDate: {
        type: Date,
        default: null,
    },
    actualReturnDate: {
        type: Date,
        default: null,
    },
    returnedQuantity: {
        type: Number,
        default: 0,
        min: 0,
    },
    condition: {
        type: String,
        enum: ['GOOD', 'DAMAGED', 'LOST'],
        default: 'GOOD',
    },
    returnNotes: {
        type: String,
        default: '',
    },
    issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

// Update status to OVERDUE if expected return date has passed
issuedItemSchema.methods.checkOverdue = function () {
    if (this.status === 'ISSUED' && this.expectedReturnDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const returnDate = new Date(this.expectedReturnDate);
        returnDate.setHours(0, 0, 0, 0);

        if (today > returnDate) {
            this.status = 'OVERDUE';
            return true;
        }
    }
    return false;
};

// Indexes
issuedItemSchema.index({ product: 1 });
issuedItemSchema.index({ employee: 1 });
issuedItemSchema.index({ status: 1 });
issuedItemSchema.index({ issueDate: -1 });

const IssuedItem = mongoose.model('IssuedItem', issuedItemSchema);

module.exports = IssuedItem;
