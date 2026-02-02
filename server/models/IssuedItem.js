const mongoose = require('mongoose');

const issuedItemSchema = new mongoose.Schema({
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true
    },
    product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    issuedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    issuedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    issuedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['ISSUED', 'RETURNED', 'CONSUMED', 'RETURN_REQUESTED'],
        default: 'ISSUED'
    },
    returnedAt: {
        type: Date
    },
    returnCondition: {
        type: String,
        enum: ['GOOD', 'DEFECTIVE', 'DAMAGED']
    },
    remarks: {
        type: String
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('IssuedItem', issuedItemSchema);
