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

const ItemVendorSkuSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    sku: String
}, { timestamps: true });

ItemVendorSkuSchema.index({ itemId: 1, vendorId: 1 }, { unique: true });

const ItemSchema = new mongoose.Schema({
    itemCode: { type: String, required: true, unique: true },
    classificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Classification', required: true },
    name: { type: String, required: true },
    package: String,
    uom: { type: String, default: 'Nos' },
    description: String,
    isActive: { type: Boolean, default: true },
    // Legacy embedded skuMappings retained for backward compatibility
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
    notes: String,
    address: String,
    description: String,
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
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
            'PROJECT_RETURN',
            'PROJECT_RETURN_GOOD',
            'PROJECT_RETURN_DAMAGED'
        ],
        required: true 
    },
    quantityChange: { type: Number, required: true },
    referenceType: String,
    referenceId: String,
    serialNumbers: [String],
    remarks: String,
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

StockMovementSchema.index({ itemId: 1 });
StockMovementSchema.index({ locationId: 1 });
StockMovementSchema.index({ referenceType: 1, referenceId: 1 });

// --- Material Request Workflow ---

const MaterialRequestSchema = new mongoose.Schema({
    requestNumber: { type: String, required: true, unique: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    engineerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['DRAFT', 'SUBMITTED', 'ROUTED', 'COMPLETED', 'CANCELLED'], 
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

MaterialRequestSchema.index({ projectId: 1 });
MaterialRequestSchema.index({ engineerId: 1 });
MaterialRequestSchema.index({ status: 1 });

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
        materialRequestLineId: String,
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
        storeRemarks: String,
        purchaseInwardLineId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseInwardBatch' }
    }]
}, { timestamps: true });

StoreRequestBatchSchema.index({ status: 1 });

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
        dispatchedQuantity: { type: Number, required: true },
        serialNumbers: [String]
    }]
}, { timestamps: true });

DispatchBatchSchema.index({ storeRequestId: 1 });
DispatchBatchSchema.index({ status: 1 });

// --- Purchase Workflow ---

const PurchaseRequestBatchSchema = new mongoose.Schema({
    batchNumber: { type: String, required: true, unique: true },
    materialRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaterialRequest', required: true },
    status: { type: String, enum: ['PENDING', 'IN_PO', 'ORDERED', 'RECEIVED', 'CANCELLED'], default: 'PENDING' },
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

PurchaseRequestBatchSchema.index({ status: 1 });

// --- Purchase Plan Line (Normalized, matches original PurchasePlanLine model) ---
const PurchasePlanLineSchema = new mongoose.Schema({
    purchaseRequestLineId: { type: String, required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    requestedQuantity: { type: Number, required: true },
    orderQuantity: { type: Number, default: 0 },
    rate: { type: Number },
    gstPercent: { type: Number, default: 18 },
    sku: String,
    remarks: String
}, { timestamps: true });

PurchasePlanLineSchema.index({ purchaseRequestLineId: 1 }, { unique: true });
PurchasePlanLineSchema.index({ itemId: 1 });
PurchasePlanLineSchema.index({ vendorId: 1 });

const PurchaseOrderSchema = new mongoose.Schema({
    poNumber: { type: String, required: true, unique: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    status: { 
        type: String, 
        enum: ['DRAFT', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED', 'PLACED', 'RECEIVED'],
        default: 'DRAFT' 
    },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    placedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    placedAt: Date,
    submittedForApprovalAt: Date,
    rejectedAt: Date,
    expectedDeliveryDate: Date,
    vendorDocumentNote: String,
    paymentTerms: String,
    deliveryTerms: String,
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

PurchaseOrderSchema.index({ vendorId: 1 });
PurchaseOrderSchema.index({ status: 1 });

// --- Purchase Order Line Allocation (Normalized, matches original) ---
const PurchaseOrderLineAllocationSchema = new mongoose.Schema({
    purchaseOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    purchaseOrderLineId: { type: String, required: true },
    purchaseRequestLineId: { type: String, required: true },
    orderedQuantity: { type: Number, required: true },
    receivedQuantity: { type: Number, default: 0 }
}, { timestamps: true });

PurchaseOrderLineAllocationSchema.index({ purchaseOrderLineId: 1, purchaseRequestLineId: 1 }, { unique: true });
PurchaseOrderLineAllocationSchema.index({ purchaseRequestLineId: 1 });

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
        serials: [String],
        serialNumbers: [String]
    }]
}, { timestamps: true });

PurchaseInwardBatchSchema.index({ purchaseOrderId: 1 });

// --- Project Return Workflow ---

const ProjectReturnBatchSchema = new mongoose.Schema({
    returnNumber: { type: String, required: true, unique: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    destinationLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', required: true },
    submittedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['SUBMITTED', 'APPROVED', 'REJECTED'], default: 'SUBMITTED' },
    sourceDispatchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DispatchBatch' }],
    overallRemarks: String,
    reviewRemarks: String,
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: Date,
    lines: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        dispatchLineRefs: [String],
        issuedQuantity: { type: Number, required: true },
        maxReturnableQuantity: { type: Number, required: true },
        goodQuantity: { type: Number, default: 0 },
        damagedQuantity: { type: Number, default: 0 },
        conditionType: { type: String, enum: ['GOOD', 'DAMAGED', 'MIXED'], required: true },
        damageReason: String,
        responsibleTeam: String,
        responsibleUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        remarks: String
    }]
}, { timestamps: true });

ProjectReturnBatchSchema.index({ projectId: 1, status: 1 });
ProjectReturnBatchSchema.index({ submittedById: 1 });

const AuditLogSchema = new mongoose.Schema({
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    action: { type: String, enum: ['CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'APPROVE', 'REJECT', 'HOLD'], required: true },
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    remarks: String,
    // Legacy compat fields
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

AuditLogSchema.index({ entityType: 1, entityId: 1 });
AuditLogSchema.index({ actorUserId: 1 });

// --- Stock Adjustment & Reconciliation ---

const StockAdjustmentBatchSchema = new mongoose.Schema({
    batchType: { type: String, enum: ['MANUAL_ADDITION', 'RECONCILIATION'], default: 'RECONCILIATION' },
    status: { type: String, enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'], default: 'DRAFT' },
    reason: String,
    uploadedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminRemarks: String,
    submittedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    lines: [{
        itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockLocation', required: true },
        systemQuantity: { type: Number, default: 0 },
        uploadedQuantity: { type: Number, required: true },
        adjustmentQuantity: { type: Number, required: true },
        rowNumber: Number,
        remarks: String
    }]
}, { timestamps: true });

StockAdjustmentBatchSchema.index({ status: 1 });
StockAdjustmentBatchSchema.index({ batchType: 1 });

module.exports = {
    Classification: mongoose.model('Classification', ClassificationSchema),
    Vendor: mongoose.model('Vendor', VendorSchema),
    ItemVendorSku: mongoose.model('ItemVendorSku', ItemVendorSkuSchema),
    Item: mongoose.model('Item', ItemSchema),
    StockLocation: mongoose.model('StockLocation', StockLocationSchema),
    StockBalance: mongoose.model('StockBalance', StockBalanceSchema),
    StockMovement: mongoose.model('StockMovement', StockMovementSchema),
    MaterialRequest: mongoose.model('MaterialRequest', MaterialRequestSchema),
    StoreRequestBatch: mongoose.model('StoreRequestBatch', StoreRequestBatchSchema),
    DispatchBatch: mongoose.model('DispatchBatch', DispatchBatchSchema),
    PurchaseRequestBatch: mongoose.model('PurchaseRequestBatch', PurchaseRequestBatchSchema),
    PurchasePlanLine: mongoose.model('PurchasePlanLine', PurchasePlanLineSchema),
    PurchaseOrder: mongoose.model('PurchaseOrder', PurchaseOrderSchema),
    PurchaseOrderLineAllocation: mongoose.model('PurchaseOrderLineAllocation', PurchaseOrderLineAllocationSchema),
    PurchaseInwardBatch: mongoose.model('PurchaseInwardBatch', PurchaseInwardBatchSchema),
    ProjectReturnBatch: mongoose.model('ProjectReturnBatch', ProjectReturnBatchSchema),
    StockAdjustmentBatch: mongoose.model('StockAdjustmentBatch', StockAdjustmentBatchSchema),
    AuditLog: mongoose.model('AuditLog', AuditLogSchema)
};
