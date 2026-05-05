const mongoose = require('mongoose');

// --- Inventory Metadata ---

const ClassificationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    prefix: { type: String, required: true, unique: true },
    nextSequenceNumber: { type: Number, default: 1 },
    tracksSerial: { type: Boolean, default: false },
    isToolType: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    department: { type: String } // Added for IPMS context
}, { timestamps: true });

const VendorSchema = new mongoose.Schema({
    vendorCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    website: String,
    gstin: String,
    address: String,
    contactPerson: String,
    email: String,
    phone: String,
    defaultPaymentTerms: String,
    defaultDeliveryTerms: String,
    isLocalSource: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

const ItemSchema = new mongoose.Schema({
    itemCode: { type: String, required: true, unique: true },
    classificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classification', required: true },
    name: { type: String, required: true },
    package: String,
    uom: { type: String, default: 'Nos' },
    description: String,
    isActive: { type: Boolean, default: true },
    skuMappings: [{
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
        sku: String
    }]
}, { timestamps: true });

// --- Stock Management ---

const StockLocationSchema = new mongoose.Schema({
    locationCode: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    label: String,
    address: String,
    description: String,
    isDefault: { type: Boolean, default: false },
    status: { type: String, default: 'ACTIVE' }
}, { timestamps: true });

const StockBalanceSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', required: true },
    quantityOnHand: { type: Number, default: 0 },
    reservedQuantity: { type: Number, default: 0 }
}, { timestamps: true });

StockBalanceSchema.index({ itemId: 1, locationId: 1 }, { unique: true });

const StockMovementSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', required: true },
    movementType: { 
        type: String, 
        enum: [
            'MANUAL_ADDITION', 
            'RECONCILIATION_ADJUSTMENT', 
            'ADMIN_CORRECTION', 
            'STOCK_RESERVED', 
            'STOCK_RESERVATION_RELEASED', 
            'STOCK_DISPATCHED', 
            'PURCHASE_INWARD',
            'PROJECT_RETURN'
        ],
        required: true 
    },
    quantityChange: { type: Number, required: true },
    referenceType: String,
    referenceId: String,
    remarks: String,
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// --- Material Request Workflow ---

const MaterialRequestSchema = new mongoose.Schema({
    requestNumber: { type: String, required: true, unique: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['DRAFT', 'SUBMITTED', 'ROUTED', 'CANCELLED'], 
        default: 'DRAFT' 
    },
    notes: String,
    submittedAt: Date,
    adminReviewedAt: Date,
    reviewedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lines: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        requiredQuantity: { type: Number, required: true },
        availableAtUpload: { type: Number, default: 0 },
        plannedStoreQuantity: { type: Number, default: 0 },
        plannedPurchaseQuantity: { type: Number, default: 0 },
        status: { 
            type: String, 
            enum: ['SUBMITTED', 'ROUTED_TO_STORE', 'ROUTED_TO_PURCHASE', 'PARTIALLY_ROUTED', 'HELD', 'CANCELLED'],
            default: 'SUBMITTED'
        },
        adminRemarks: String,
        rowNumber: Number
    }]
}, { timestamps: true });

// --- Store Workflow ---

const StoreRequestBatchSchema = new mongoose.Schema({
    batchNumber: { type: String, required: true, unique: true },
    materialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true },
    status: { 
        type: String, 
        enum: ['PENDING', 'CONFIRMED', 'SHORTAGE_REPORTED', 'IN_DISPATCH', 'DISPATCHED', 'CANCELLED'],
        default: 'PENDING'
    },
    routedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    routedAt: { type: Date, default: Date.now },
    notes: String,
    lines: [{
        materialRequestLineId: String, // Reference to MR line array element ID
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        requestedQuantity: { type: Number, required: true },
        pendingQuantity: { type: Number, required: true },
        confirmedQuantity: { type: Number, default: 0 },
        shortageQuantity: { type: Number, default: 0 },
        status: { 
            type: String, 
            enum: ['PENDING', 'CONFIRMED', 'SHORTAGE_REPORTED'],
            default: 'PENDING'
        },
        source: { type: String, enum: ['STOCK', 'PURCHASE_INWARD'], default: 'STOCK' },
        shortageReason: String,
        storeRemarks: String
    }]
}, { timestamps: true });

const DispatchBatchSchema = new mongoose.Schema({
    dispatchNumber: { type: String, required: true, unique: true },
    storeRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'StoreRequestBatch', required: true },
    status: { type: String, enum: ['DISPATCHED', 'ACKNOWLEDGED', 'REJECTED'], default: 'DISPATCHED' },
    dispatchedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispatchedAt: { type: Date, default: Date.now },
    acknowledgedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
    engineerRemarks: String,
    storeRemarks: String,
    lines: [{
        storeRequestLineId: String,
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        dispatchedQuantity: { type: Number, required: true }
    }]
}, { timestamps: true });

// --- Purchase Workflow ---

const PurchaseRequestBatchSchema = new mongoose.Schema({
    batchNumber: { type: String, required: true, unique: true },
    materialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true },
    status: { type: String, enum: ['PENDING', 'IN_PO', 'ORDERED', 'CANCELLED'], default: 'PENDING' },
    routedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    routedAt: { type: Date, default: Date.now },
    lines: [{
        materialRequestLineId: String,
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        requiredQuantity: { type: Number, required: true },
        pendingQuantity: { type: Number, required: true },
        purchaseRemarks: String
    }]
}, { timestamps: true });

const PurchaseOrderSchema = new mongoose.Schema({
    poNumber: { type: String, required: true, unique: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    status: { 
        type: String, 
        enum: ['DRAFT', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED', 'PLACED'],
        default: 'DRAFT' 
    },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    placedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    placedAt: Date,
    adminRemarks: String,
    notes: String,
    lines: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        sku: String,
        requestedQuantity: { type: Number, required: true },
        orderQuantity: { type: Number, required: true },
        receivedQuantity: { type: Number, default: 0 },
        rate: { type: Number, required: true },
        gstPercent: { type: Number, default: 18 },
        lineTotal: { type: Number, required: true },
        sourceLines: [{
            purchaseRequestLineId: String,
            quantity: Number
        }]
    }]
}, { timestamps: true });

const PurchaseInwardBatchSchema = new mongoose.Schema({
    inwardNumber: { type: String, required: true, unique: true },
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    receivedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receivedAt: { type: Date, default: Date.now },
    documentNote: String,
    remarks: String,
    lines: [{
        purchaseOrderLineId: String,
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', required: true },
        receivedQuantity: { type: Number, required: true },
        serials: [String]
    }]
}, { timestamps: true });

module.exports = {
    Classification: mongoose.model('Classification', ClassificationSchema),
    Vendor: mongoose.model('Vendor', VendorSchema),
    Item: mongoose.model('Item', ItemSchema),
    StockLocation: mongoose.model('StockLocation', StockLocationSchema),
    StockBalance: mongoose.model('StockBalance', StockBalanceSchema),
    StockMovement: mongoose.model('StockMovement', StockMovementSchema),
    MaterialRequest: mongoose.model('MaterialRequest', MaterialRequestSchema),
    StoreRequestBatch: mongoose.model('StoreRequestBatch', StoreRequestBatchSchema),
    DispatchBatch: mongoose.model('DispatchBatch', DispatchBatchSchema),
    PurchaseRequestBatch: mongoose.model('PurchaseRequestBatch', PurchaseRequestBatchSchema),
    PurchaseOrder: mongoose.model('PurchaseOrder', PurchaseOrderSchema),
    PurchaseInwardBatch: mongoose.model('PurchaseInwardBatch', PurchaseInwardBatchSchema)
};
