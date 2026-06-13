const mongoose = require('mongoose');

const productionDispatchSchema = new mongoose.Schema({
    dcNumber: {
        type: String,
        unique: true,
        index: true,
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
    },
    // Denormalized project info for quick display
    projectName: { type: String, default: '' },
    projectCode: { type: String, default: '' },

    // Customer details
    customerName:    { type: String, required: true, trim: true },
    customerAddress: { type: String, default: '', trim: true },
    customerGSTIN:   { type: String, default: '', trim: true },
    placeOfSupply:   { type: String, default: '', trim: true },

    // Board traceability: unique unit number range
    boardFrom: { type: Number, required: true }, // starting unit number
    boardTo:   { type: Number, required: true }, // ending unit number
    boardCount: { type: Number },                // auto-computed: boardTo - boardFrom + 1

    // Challan / item details
    productDescription: { type: String, default: 'PCB Assembly', trim: true },
    hsnCode:            { type: String, default: '', trim: true },
    ratePerBoard:       { type: Number, default: 0 },  // optional — 0 = logistics-only challan
    igstPercent:        { type: Number, default: 18 },
    challanType:        { type: String, default: 'Job Work', trim: true },
    notes:              { type: String, default: '', trim: true },

    status: {
        type: String,
        enum: ['CREATED', 'DISPATCHED'],
        default: 'CREATED',
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    createdByName: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    dispatchedAt: { type: Date },
});

// Auto-generate DC number (DC-YYYY-NNN) and boardCount before save
productionDispatchSchema.pre('save', async function () {
    // Compute boardCount
    if (this.boardFrom != null && this.boardTo != null) {
        this.boardCount = Math.max(0, this.boardTo - this.boardFrom + 1);
    }

    // Auto DC number on new document
    if (this.isNew && !this.dcNumber) {
        const currentYear = new Date().getFullYear();
        const prefix = `DC-${currentYear}-`;
        const ProductionDispatch = mongoose.model('ProductionDispatch');
        const last = await ProductionDispatch
            .findOne({ dcNumber: { $regex: `^${prefix}` } })
            .sort({ dcNumber: -1 });

        let nextNum = 1;
        if (last && last.dcNumber) {
            const parts = last.dcNumber.split('-');
            const lastNum = parseInt(parts[parts.length - 1], 10);
            if (!Number.isNaN(lastNum)) nextNum = lastNum + 1;
        }
        this.dcNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
    }
});

productionDispatchSchema.set('toJSON', { virtuals: true });
productionDispatchSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ProductionDispatch', productionDispatchSchema);
