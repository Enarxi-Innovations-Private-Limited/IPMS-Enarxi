const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    contactPerson: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
    },
    address: {
        type: String,
        default: '',
        trim: true,
    },
    city: {
        type: String,
        default: '',
        trim: true,
    },
    country: {
        type: String,
        default: 'India',
        trim: true,
    },
    paymentTerms: {
        type: String,
        default: 'Net 30',
        trim: true,
    },
    deliveryTime: {
        type: String,
        default: '7-14 days',
        trim: true,
    },
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    notes: {
        type: String,
        default: '',
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
});

// Indexes
supplierSchema.index({ name: 1 });
supplierSchema.index({ isActive: 1 });

const Supplier = mongoose.model('Supplier', supplierSchema);

module.exports = Supplier;
