const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    partNumber: {
        type: String,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        required: true,
        enum: ['RESISTOR', 'CAPACITOR', 'IC', 'LED', 'TRANSISTOR', 'DIODE', 'SENSOR', 'MODULE', 'CONNECTOR', 'OTHER'],
    },
    description: {
        type: String,
        default: '',
    },
    specifications: {
        type: Map,
        of: String,
        default: {},
    },
    quantity: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    minQuantity: {
        type: Number,
        required: true,
        default: 10,
        min: 0,
    },
    maxQuantity: {
        type: Number,
        default: 1000,
        min: 0,
    },
    reorderPoint: {
        type: Number,
        required: true,
        default: 20,
        min: 0,
    },
    unitPrice: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
    },
    supplier: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        default: null,
    },
    location: {
        type: String,
        default: '',
        trim: true,
    },
    lastRestocked: {
        type: Date,
        default: null,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Virtual for total value
productSchema.virtual('totalValue').get(function () {
    return this.quantity * this.unitPrice;
});

// Virtual for stock status
productSchema.virtual('stockStatus').get(function () {
    if (this.quantity === 0) return 'OUT_OF_STOCK';
    if (this.quantity <= this.minQuantity) return 'LOW_STOCK';
    if (this.quantity >= this.maxQuantity) return 'OVERSTOCK';
    return 'IN_STOCK';
});

// Indexes
productSchema.index({ category: 1 });
productSchema.index({ quantity: 1 });
productSchema.index({ name: 'text', description: 'text' });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
