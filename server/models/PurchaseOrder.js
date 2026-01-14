const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
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
    unitPrice: {
        type: Number,
        required: true,
        min: 0,
    },
    totalPrice: {
        type: Number,
        required: true,
        min: 0,
    },
}, { _id: false });

const purchaseOrderSchema = new mongoose.Schema({
    poNumber: {
        type: String,
        required: true,
        unique: true,
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true,
    },
    items: [purchaseOrderItemSchema],
    totalAmount: {
        type: Number,
        required: true,
        min: 0,
    },
    status: {
        type: String,
        enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'RECEIVED', 'CANCELLED'],
        default: 'DRAFT',
    },
    orderDate: {
        type: Date,
        default: Date.now,
    },
    expectedDelivery: {
        type: Date,
        default: null,
    },
    actualDelivery: {
        type: Date,
        default: null,
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
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    approvedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

// Auto-generate PO number before saving
purchaseOrderSchema.pre('save', async function (next) {
    if (!this.poNumber) {
        const year = new Date().getFullYear();
        const count = await this.constructor.countDocuments();
        this.poNumber = `PO-${year}-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

// Indexes
purchaseOrderSchema.index({ supplier: 1 });
purchaseOrderSchema.index({ status: 1 });
purchaseOrderSchema.index({ orderDate: -1 });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);

module.exports = PurchaseOrder;
