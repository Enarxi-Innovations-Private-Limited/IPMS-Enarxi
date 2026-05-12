const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { 
    Classification, Vendor, Item, ItemVendorSku, StockLocation, StockBalance, StockMovement, 
    MaterialRequest, StoreRequestBatch, DispatchBatch, PurchaseRequestBatch,
    PurchasePlanLine, PurchaseOrder, PurchaseOrderLineAllocation,
    PurchaseInwardBatch, StockAdjustmentBatch, Activity, User, Notification, Project, Task
} = require('./models');

// Helper to log inventory activity
const logInvActivity = async (type, message, userId, userName, targetId, targetName) => {
    try {
        await Activity.create({ type, message, userId, userName, targetId, targetName });
    } catch (err) {
        console.error('Failed to log inventory activity:', err);
    }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findLocationByReference = async (reference) => {
    const normalized = (reference || '').toString().trim();
    if (!normalized) return null;

    return StockLocation.findOne({
        $or: [
            { locationCode: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
            { name: new RegExp(`^${escapeRegex(normalized)}$`, 'i') }
        ]
    });
};

const logAudit = async (entityType, entityId, action, before, after, req, metadata = {}) => {
    try {
        const AuditLog = mongoose.model('AuditLog');
        await AuditLog.create({
            actorUserId: req.user?._id,
            actorRole: req.user?.role,
            entityType,
            entityId: String(entityId),
            action,
            before,
            after,
            remarks: metadata.remarks || null,
            // Legacy compat
            userId: req.user?._id,
            userName: req.user?.name,
            metadata
        });
    } catch (err) {
        console.error('Failed to log audit entry:', err);
    }
};

const roles = {
    ADMIN: 'ADMIN',
    SUPER_ADMIN: 'SUPER_ADMIN',
    SUPER_USER: 'SUPER_USER',
    MANAGER: 'MANAGER',
    EMPLOYEE: 'EMPLOYEE',
    INTERN: 'INTERN',
    STORE_MANAGER: 'STORE_MANAGER',
    PURCHASE_MANAGER: 'PURCHASE_MANAGER',
    ENGINEER: 'ENGINEER',
    JUNIOR_ENGINEER: 'JUNIOR_ENGINEER',
    STOCK_ADMIN: 'STOCK_ADMIN'
};

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn(`🚫 [Inventory Auth] No token for ${req.path}`);
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            console.warn(`🚫 [Inventory Auth] User not found for ID: ${decoded.id}`);
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        // Normalize role for consistency
        req.user.role = (user.role || '').toUpperCase().replace(/\s+/g, '_');
        next();
    } catch (err) {
        console.error(`🚫 [Inventory Auth] Error: ${err.message}`);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

// Apply authMiddleware to all inventory routes
router.use(authMiddleware);

function requireAnyRole(req, res, allowedRoles) {
    const currentRole = (req.user?.role || '').toUpperCase();
    if (!allowedRoles.includes(currentRole)) {
        res.status(403).json({ message: `Access denied. Allowed roles: ${allowedRoles.join(', ')}` });
        return false;
    }
    return true;
}

async function reserveItemQuantity(itemId, quantity, session = null) {
    if (quantity <= 0) return;

    const balances = await StockBalance.find({ itemId })
        .sort({ updatedAt: 1 })
        .session(session);

    let remaining = quantity;

    for (const balance of balances) {
        if (remaining <= 0.0001) break;
        const available = Math.max(0, Number(balance.quantityOnHand) - Number(balance.reservedQuantity));
        const reserveHere = Math.min(available, remaining);
        if (reserveHere <= 0) continue;

        balance.reservedQuantity += reserveHere;
        await balance.save({ session });
        remaining -= reserveHere;
    }

    if (remaining > 0.0001) {
        throw new Error('Insufficient stock available to reserve the required quantity.');
    }
}

async function releaseItemReservation(itemId, quantity, session = null) {
    if (quantity <= 0) return;

    const balances = await StockBalance.find({ itemId })
        .sort({ reservedQuantity: -1, updatedAt: -1 })
        .session(session);

    let remaining = quantity;

    for (const balance of balances) {
        if (remaining <= 0.0001) break;
        const reserved = Number(balance.reservedQuantity || 0);
        const releaseHere = Math.min(reserved, remaining);
        if (releaseHere <= 0) continue;

        balance.reservedQuantity -= releaseHere;
        await balance.save({ session });
        remaining -= releaseHere;
    }

    if (remaining > 0.0001) {
        throw new Error('Unable to release the requested reserved quantity.');
    }
}

async function reconcileStorePhysicalCount(itemId, targetOnHand, targetReserved, referenceId, userId, session = null) {
    if (targetOnHand < 0 || targetReserved < 0 || targetReserved > targetOnHand) {
        throw new Error('Store amendment quantities are invalid.');
    }

    let balances = await StockBalance.find({ itemId }).sort({ updatedAt: -1 }).session(session);

    const currentOnHand = balances.reduce((total, balance) => total + Number(balance.quantityOnHand || 0), 0);
    const currentReserved = balances.reduce((total, balance) => total + Number(balance.reservedQuantity || 0), 0);

    let remainingOnHandReduction = Math.max(0, currentOnHand - targetOnHand);
    let remainingReservedReduction = Math.max(0, currentReserved - targetReserved);

    for (const balance of balances) {
        if (remainingOnHandReduction <= 0.0001) break;

        const onHand = Number(balance.quantityOnHand || 0);
        const reserved = Number(balance.reservedQuantity || 0);
        const unreserved = Math.max(0, onHand - reserved);
        const reduceHere = Math.min(unreserved, remainingOnHandReduction);

        if (reduceHere > 0) {
            balance.quantityOnHand -= reduceHere;
            await balance.save({ session });

            await StockMovement.create([{
                itemId,
                locationId: balance.locationId,
                movementType: 'ADMIN_CORRECTION',
                quantityChange: -reduceHere,
                referenceType: 'StoreShortageAmendment',
                referenceId,
                remarks: `Admin amended Store shortage. Physical count corrected by ${-reduceHere}.`,
                createdById: userId
            }], { session });

            remainingOnHandReduction -= reduceHere;
        }
    }

    balances = await StockBalance.find({ itemId }).sort({ reservedQuantity: -1, updatedAt: -1 }).session(session);

    for (const balance of balances) {
        if (remainingOnHandReduction <= 0.0001) break;

        const onHand = Number(balance.quantityOnHand || 0);
        const reserved = Number(balance.reservedQuantity || 0);
        const reduceHere = Math.min(onHand, remainingOnHandReduction);
        const releaseHere = Math.min(reserved, reduceHere, remainingReservedReduction);

        if (reduceHere > 0) {
            balance.quantityOnHand -= reduceHere;
            if (releaseHere > 0) {
                balance.reservedQuantity -= releaseHere;
            }
            await balance.save({ session });

            await StockMovement.create([{
                itemId,
                locationId: balance.locationId,
                movementType: 'ADMIN_CORRECTION',
                quantityChange: -reduceHere,
                referenceType: 'StoreShortageAmendment',
                referenceId,
                remarks: `Admin amended Store shortage. Physical count corrected by ${-reduceHere}.`,
                createdById: userId
            }], { session });

            remainingOnHandReduction -= reduceHere;
            remainingReservedReduction -= releaseHere;
        }
    }

    if (remainingOnHandReduction > 0.0001) {
        throw new Error('Unable to reduce stock to the Store-reported physical quantity.');
    }

    const onHandIncrease = Math.max(0, targetOnHand - currentOnHand);
    if (onHandIncrease > 0) {
        const balance = balances[0];
        if (!balance) {
            throw new Error('Cannot increase physical stock because no stock location exists for this item.');
        }

        balance.quantityOnHand += onHandIncrease;
        await balance.save({ session });

        await StockMovement.create([{
            itemId,
            locationId: balance.locationId,
            movementType: 'ADMIN_CORRECTION',
            quantityChange: onHandIncrease,
            referenceType: 'StoreShortageAmendment',
            referenceId,
            remarks: `Admin amended Store shortage. Physical count corrected by ${onHandIncrease}.`,
            createdById: userId
        }], { session });
    }

    const reservedAfterCount = (await StockBalance.find({ itemId }).session(session))
        .reduce((sum, balance) => sum + Number(balance.reservedQuantity || 0), 0);
    const reservationChange = targetReserved - reservedAfterCount;

    if (reservationChange > 0) {
        await reserveItemQuantity(itemId, reservationChange, session);
    } else if (reservationChange < 0) {
        await releaseItemReservation(itemId, Math.abs(reservationChange), session);
    }
}

async function updateStoreBatchStatus(batch, session = null) {
    const hasShortage = batch.lines.some((line) => line.status === 'SHORTAGE_REPORTED');
    const hasPending = batch.lines.some((line) => line.status === 'PENDING');
    batch.status = hasShortage ? 'SHORTAGE_REPORTED' : hasPending ? 'PENDING' : 'CONFIRMED';
    await batch.save({ session });
}

function normalizeId(value) {
    return value ? String(value) : '';
}

async function getCurrentAvailableStock(itemId, session = null) {
    const balances = await StockBalance.find({ itemId }).session(session);
    return balances.reduce((total, balance) => {
        const onHand = Number(balance.quantityOnHand || 0);
        const reserved = Number(balance.reservedQuantity || 0);
        return total + Math.max(0, onHand - reserved);
    }, 0);
}

async function buildPurchasePlanningRows() {
    const requests = await PurchaseRequestBatch.find({ status: 'PENDING' })
        .populate('materialRequestId', 'requestNumber projectId')
        .populate({
            path: 'lines.itemId',
            populate: [
                { path: 'classificationId', select: 'name tracksSerial' },
                { path: 'skuMappings.vendorId', select: 'vendorCode name gstin' }
            ]
        });

    const totals = new Map();

    requests.forEach((batch) => {
        batch.lines.forEach((line) => {
            const quantity = Number(line.pendingQuantity || 0);
            if (quantity <= 0 || !line.itemId) return;

            const item = line.itemId;
            const key = normalizeId(item._id);
            const existing = totals.get(key);
            const skuMappings = (item.skuMappings || []).map((mapping) => ({
                vendorId: normalizeId(mapping.vendorId?._id || mapping.vendorId),
                vendorCode: mapping.vendorId?.vendorCode || '',
                vendorName: mapping.vendorId?.name || '',
                sku: mapping.sku || ''
            }));

            const sourceLine = {
                purchaseRequestLineId: normalizeId(line._id),
                requestedQuantity: quantity,
                batchId: normalizeId(batch._id),
                materialRequestId: normalizeId(batch.materialRequestId?._id || batch.materialRequestId),
                requestNumber: batch.materialRequestId?.requestNumber || '',
                projectId: normalizeId(batch.materialRequestId?.projectId),
                projectName: ''
            };

            if (existing) {
                existing.requestedQuantity += quantity;
                existing.sourceLineIds.push(sourceLine.purchaseRequestLineId);
                existing.sourceLines.push(sourceLine);
            } else {
                totals.set(key, {
                    id: key,
                    itemId: key,
                    itemCode: item.itemCode,
                    name: item.name,
                    package: item.package || null,
                    classification: item.classificationId?.name || '',
                    requestedQuantity: quantity,
                    sourceLineIds: [sourceLine.purchaseRequestLineId],
                    sourceLines: [sourceLine],
                    skuMappings
                });
            }
        });
    });

    return Array.from(totals.values()).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
}

// --- Master Data Routes ---

router.get('/classifications', async (req, res) => {
    try {
        const data = await Classification.find().sort({ name: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/createClassification', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const classification = await Classification.create(req.body);
        await logAudit('Classification', classification._id, 'CREATE', null, classification.toObject(), req);
        await logInvActivity('INV_MASTER_CREATE', `Classification ${classification.name} created`, req.user._id, req.user.name, classification._id, classification.name);
        res.status(201).json(classification);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/items', async (req, res) => {
    try {
        const data = await Item.find().populate('classificationId').sort({ itemCode: 1 });
        const mapped = data.map(item => {
            const obj = item.toObject();
            return {
                ...obj,
                classification: obj.classificationId, // Map for frontend compatibility
                id: obj._id
            };
        });
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/createItem', async (req, res) => {
    try {
        let { name, classificationId, uom, package: itemPackage, description, itemCode } = req.body;

        if (!classificationId) return res.status(400).json({ message: 'Classification ID is required' });

        // Resolve Classification (handle name vs ID)
        let classification;
        if (mongoose.Types.ObjectId.isValid(classificationId)) {
            classification = await Classification.findById(classificationId);
        } else {
            classification = await Classification.findOne({ name: classificationId.toUpperCase() });
        }

        if (!classification) return res.status(404).json({ message: 'Classification not found' });

        // Auto-generate itemCode if not provided
        if (!itemCode) {
            const sequence = classification.nextSequenceNumber || 1;
            itemCode = `${classification.prefix}-${sequence.toString().padStart(6, '0')}`;
            
            // Increment sequence for next time
            classification.nextSequenceNumber = sequence + 1;
            await classification.save();
        }

        const item = await Item.create({
            name,
            classificationId: classification._id,
            uom: uom || 'Nos',
            package: itemPackage,
            description,
            itemCode
        });

        await logAudit('Item', item._id, 'CREATE', null, item.toObject(), req);
        await logInvActivity('INV_MASTER_CREATE', `Item ${item.name} (${item.itemCode}) created`, req.user._id, req.user.name, item._id, item.name);
        res.status(201).json(item);
    } catch (err) {
        console.error('❌ [Create Item Error]:', err);
        res.status(400).json({ message: err.message });
    }
});

router.get('/vendors', async (req, res) => {
    try {
        const data = await Vendor.find().sort({ name: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/createVendor', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER, roles.PURCHASE_MANAGER])) return;
        const vendor = await Vendor.create(req.body);
        await logAudit('Vendor', vendor._id, 'CREATE', null, vendor.toObject(), req);
        await logInvActivity('INV_MASTER_CREATE', `Vendor ${vendor.name} created`, req.user._id, req.user.name, vendor._id, vendor.name);
        res.status(201).json(vendor);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/stock-locations', async (req, res) => {
    try {
        const data = await StockLocation.find().sort({ locationCode: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/createStockLocation', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const location = await StockLocation.create(req.body);
        await logAudit('StockLocation', location._id, 'CREATE', null, location.toObject(), req);
        await logInvActivity('INV_MASTER_CREATE', `Location ${location.name} created`, req.user._id, req.user.name, location._id, location.name);
        res.status(201).json(location);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});


// --- Master Data UPDATE / DELETE Routes (Parity with original tracker) ---

router.put('/classifications/:id', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        await session.withTransaction(async () => {
            const before = await Classification.findById(req.params.id).session(session);
            if (!before) throw new Error('Classification not found');
            const beforeObj = before.toObject();
            Object.assign(before, req.body);
            await before.save({ session });
            await logAudit('Classification', before._id, 'UPDATE', beforeObj, before.toObject(), req);
            await logInvActivity('INV_MASTER_UPDATE', `Classification ${before.name} updated`, req.user._id, req.user.name, before._id, before.name);
            res.json(before);
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    } finally { await session.endSession(); }
});

router.delete('/classifications/:id', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const classification = await Classification.findById(req.params.id);
        if (!classification) return res.status(404).json({ message: 'Classification not found' });
        const itemCount = await Item.countDocuments({ classificationId: classification._id });
        if (itemCount > 0) return res.status(400).json({ message: `Cannot delete: ${itemCount} items use this classification.` });
        await Classification.findByIdAndDelete(req.params.id);
        await logAudit('Classification', classification._id, 'DELETE', classification.toObject(), null, req);
        await logInvActivity('INV_MASTER_DELETE', `Classification ${classification.name} deleted`, req.user._id, req.user.name, classification._id, classification.name);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/items/:id', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        await session.withTransaction(async () => {
            const item = await Item.findById(req.params.id).session(session);
            if (!item) throw new Error('Item not found');
            const beforeObj = item.toObject();
            const { name, uom, package: itemPackage, description, isActive, classificationId, itemCode } = req.body;
            if (name !== undefined) item.name = name;
            if (uom !== undefined) item.uom = uom;
            if (itemPackage !== undefined) item.package = itemPackage;
            if (description !== undefined) item.description = description;
            if (isActive !== undefined) item.isActive = isActive;
            if (itemCode !== undefined) item.itemCode = itemCode;
            if (classificationId !== undefined) item.classificationId = classificationId;
            await item.save({ session });
            await logAudit('Item', item._id, 'UPDATE', beforeObj, item.toObject(), req);
            await logInvActivity('INV_MASTER_UPDATE', `Item ${item.itemCode} updated`, req.user._id, req.user.name, item._id, item.name);
            res.json(item);
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    } finally { await session.endSession(); }
});

router.delete('/items/:id', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const item = await Item.findById(req.params.id);
        if (!item) return res.status(404).json({ message: 'Item not found' });
        const balances = await StockBalance.find({ itemId: item._id });
        const hasStock = balances.some(b => Number(b.quantityOnHand) > 0 || Number(b.reservedQuantity) > 0);
        if (hasStock) return res.status(400).json({ message: 'Cannot delete item with active stock.' });
        await Item.findByIdAndDelete(req.params.id);
        await ItemVendorSku.deleteMany({ itemId: item._id });
        await logAudit('Item', item._id, 'DELETE', item.toObject(), null, req);
        await logInvActivity('INV_MASTER_DELETE', `Item ${item.itemCode} deleted`, req.user._id, req.user.name, item._id, item.name);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/vendors/:id', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        await session.withTransaction(async () => {
            const vendor = await Vendor.findById(req.params.id).session(session);
            if (!vendor) throw new Error('Vendor not found');
            const beforeObj = vendor.toObject();
            Object.assign(vendor, req.body);
            await vendor.save({ session });
            await logAudit('Vendor', vendor._id, 'UPDATE', beforeObj, vendor.toObject(), req);
            await logInvActivity('INV_MASTER_UPDATE', `Vendor ${vendor.name} updated`, req.user._id, req.user.name, vendor._id, vendor.name);
            res.json(vendor);
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    } finally { await session.endSession(); }
});

router.delete('/vendors/:id', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const vendor = await Vendor.findById(req.params.id);
        if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
        const poCount = await PurchaseOrder.countDocuments({ vendorId: vendor._id });
        if (poCount > 0) return res.status(400).json({ message: `Cannot delete: ${poCount} purchase orders reference this vendor.` });
        await Vendor.findByIdAndDelete(req.params.id);
        await ItemVendorSku.deleteMany({ vendorId: vendor._id });
        await logAudit('Vendor', vendor._id, 'DELETE', vendor.toObject(), null, req);
        await logInvActivity('INV_MASTER_DELETE', `Vendor ${vendor.name} deleted`, req.user._id, req.user.name, vendor._id, vendor.name);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.put('/stock-locations/:id', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        await session.withTransaction(async () => {
            const location = await StockLocation.findById(req.params.id).session(session);
            if (!location) throw new Error('Stock location not found');
            const beforeObj = location.toObject();
            Object.assign(location, req.body);
            await location.save({ session });
            await logAudit('StockLocation', location._id, 'UPDATE', beforeObj, location.toObject(), req);
            await logInvActivity('INV_MASTER_UPDATE', `Location ${location.name} updated`, req.user._id, req.user.name, location._id, location.name);
            res.json(location);
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    } finally { await session.endSession(); }
});

router.delete('/stock-locations/:id', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const location = await StockLocation.findById(req.params.id);
        if (!location) return res.status(404).json({ message: 'Stock location not found' });
        const balances = await StockBalance.find({ locationId: location._id });
        const hasStock = balances.some(b => Number(b.quantityOnHand) > 0);
        if (hasStock) return res.status(400).json({ message: 'Cannot delete location with active stock.' });
        await StockLocation.findByIdAndDelete(req.params.id);
        await logAudit('StockLocation', location._id, 'DELETE', location.toObject(), null, req);
        await logInvActivity('INV_MASTER_DELETE', `Location ${location.name} deleted`, req.user._id, req.user.name, location._id, location.name);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Bulk Item Import ---
router.post('/admin/items/bulk-import', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { items: rows } = req.body;
        if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: 'Items array is required.' });

        const results = [];
        const errors = [];

        await session.withTransaction(async () => {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    let classification;
                    if (mongoose.Types.ObjectId.isValid(row.classificationId)) {
                        classification = await Classification.findById(row.classificationId).session(session);
                    } else {
                        classification = await Classification.findOne({ name: (row.classificationId || '').toUpperCase() }).session(session);
                    }
                    if (!classification) { errors.push({ row: i + 1, message: `Classification not found: ${row.classificationId}` }); continue; }

                    const normalizedSkuMappings = [];
                    const skuMappingMap = new Map();
                    const rawSkuMappings = Array.isArray(row.skuMappings) ? row.skuMappings : [];

                    for (const rawMapping of rawSkuMappings) {
                        const vendorRef = String(rawMapping?.vendorId || rawMapping?.vendorCode || '').trim();
                        const skuValue = String(rawMapping?.sku || '').trim();
                        if (!vendorRef || !skuValue) continue;

                        let vendor = null;
                        if (mongoose.Types.ObjectId.isValid(vendorRef)) {
                            vendor = await Vendor.findById(vendorRef).session(session);
                        }
                        if (!vendor) {
                            vendor = await Vendor.findOne({ vendorCode: vendorRef }).session(session);
                        }
                        if (!vendor) {
                            throw new Error(`Vendor not found for SKU mapping: ${vendorRef}`);
                        }

                        skuMappingMap.set(String(vendor._id), {
                            vendorId: vendor._id,
                            sku: skuValue
                        });
                    }

                    normalizedSkuMappings.push(...skuMappingMap.values());

                    const sequence = classification.nextSequenceNumber || 1;
                    const itemCode = row.itemCode || `${classification.prefix}-${sequence.toString().padStart(6, '0')}`;

                    const item = await Item.create([{
                        itemCode,
                        classificationId: classification._id,
                        name: row.name,
                        uom: row.uom || 'Nos',
                        package: row.package,
                        description: row.description,
                        skuMappings: normalizedSkuMappings
                    }], { session });

                    if (normalizedSkuMappings.length > 0) {
                        await ItemVendorSku.insertMany(
                            normalizedSkuMappings.map((mapping) => ({
                                itemId: item[0]._id,
                                vendorId: mapping.vendorId,
                                sku: mapping.sku
                            })),
                            { session }
                        );
                    }

                    if (!row.itemCode) {
                        classification.nextSequenceNumber = sequence + 1;
                        await classification.save({ session });
                    }

                    await logAudit('Item', item[0]._id, 'IMPORT', null, item[0].toObject(), req, { row: i + 1 });
                    results.push(item[0]);
                } catch (rowErr) {
                    errors.push({ row: i + 1, message: rowErr.message });
                }
            }
        });

        await logInvActivity('INV_MASTER_IMPORT', `Bulk imported ${results.length} items (${errors.length} errors)`, req.user._id, req.user.name, null, 'Bulk Import');
        res.status(201).json({ imported: results.length, errors, items: results });
    } catch (err) {
        res.status(400).json({ message: err.message });
    } finally { await session.endSession(); }
});

// --- Vendor SKU Mapping Management ---
router.get('/vendor-sku-mappings', async (req, res) => {
    try {
        const mappings = await ItemVendorSku.find()
            .populate('itemId', 'name itemCode')
            .populate('vendorId', 'name vendorCode')
            .sort({ createdAt: -1 });
        res.json(mappings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/vendor-sku-mappings/item/:itemId', async (req, res) => {
    try {
        const mappings = await ItemVendorSku.find({ itemId: req.params.itemId })
            .populate('vendorId', 'name vendorCode');
        res.json(mappings);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/vendor-sku-mappings', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER, roles.PURCHASE_MANAGER])) return;
        const { itemId, vendorId, sku } = req.body;
        const mapping = await ItemVendorSku.findOneAndUpdate(
            { itemId, vendorId },
            { sku },
            { upsert: true, new: true }
        );
        // Also update legacy embedded mapping
        await Item.updateOne(
            { _id: itemId },
            { $pull: { skuMappings: { vendorId } } }
        );
        await Item.updateOne(
            { _id: itemId },
            { $push: { skuMappings: { vendorId, sku } } }
        );
        await logAudit('ItemVendorSku', mapping._id, 'CREATE', null, mapping.toObject(), req);
        res.status(201).json(mapping);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.delete('/vendor-sku-mappings/:id', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER, roles.PURCHASE_MANAGER])) return;
        const mapping = await ItemVendorSku.findById(req.params.id);
        if (!mapping) return res.status(404).json({ message: 'Mapping not found' });
        await ItemVendorSku.findByIdAndDelete(req.params.id);
        await Item.updateOne(
            { _id: mapping.itemId },
            { $pull: { skuMappings: { vendorId: mapping.vendorId } } }
        );
        await logAudit('ItemVendorSku', mapping._id, 'DELETE', mapping.toObject(), null, req);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Audit Log Query ---
router.get('/audit-logs', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { entityType, entityId, limit = 100 } = req.query;
        const filter = {};
        if (entityType) filter.entityType = entityType;
        if (entityId) filter.entityId = entityId;
        const logs = await mongoose.model('AuditLog').find(filter)
            .populate('actorUserId', 'name')
            .sort({ createdAt: -1 })
            .limit(Number(limit));
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Stock Overview ---

router.get('/stock/current', async (req, res) => {
    try {
        const balances = await StockBalance.find()
            .populate({
                path: 'itemId',
                populate: { path: 'classificationId' }
            })
            .populate('locationId');

        const rows = balances
            .filter((balance) => balance.itemId && balance.locationId)
            .map((balance) => ({
                id: balance._id,
                balanceId: balance._id,
                itemId: balance.itemId._id,
                itemCode: balance.itemId.itemCode,
                name: balance.itemId.name,
                package: balance.itemId.package,
                uom: balance.itemId.uom,
                description: balance.itemId.description,
                tracksSerial: Boolean(balance.itemId.classificationId?.tracksSerial),
                classificationId: balance.itemId.classificationId,
                classification: balance.itemId.classificationId,
                locationId: balance.locationId,
                quantityOnHand: balance.quantityOnHand,
                reservedQuantity: balance.reservedQuantity,
                availableQuantity: balance.quantityOnHand - balance.reservedQuantity,
                createdAt: balance.createdAt,
                updatedAt: balance.updatedAt
            }));

        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Legacy Compatibility Aliases ---

router.get('/dashboard-stats', async (req, res) => {
    try {
        const role = req.user.role;
        const userId = req.user._id;

        const [
            pendingMRs,
            shortageLines,
            pendingStockApps,
            pendingPOApps,
            storeBatches,
            purchaseBatches,
            purchaseOrders,
            dispatches,
            recentMovements
        ] = await Promise.all([
            MaterialRequest.find({ status: 'SUBMITTED' }).populate('projectId engineerId').limit(10),
            StoreRequestBatch.find({ "lines.status": 'SHORTAGE_REPORTED' }).populate('materialRequestId lines.itemId').limit(10),
            StockAdjustmentBatch.find({ status: 'SUBMITTED' }).populate('uploadedById').limit(10),
            PurchaseOrder.find({ status: 'PENDING_ADMIN_APPROVAL' }).populate('vendorId createdById').limit(10),
            StoreRequestBatch.find({ status: { $in: ['PENDING', 'CONFIRMED', 'SHORTAGE_REPORTED'] } }).populate('materialRequestId routedById').limit(10),
            PurchaseRequestBatch.find({ status: 'PENDING' }).populate('materialRequestId routedById').limit(10),
            PurchaseOrder.find({ status: { $in: ['DRAFT', 'REJECTED', 'APPROVED', 'PLACED'] } }).populate('vendorId createdById').limit(10),
            DispatchBatch.find({ status: 'DISPATCHED' }).populate('storeRequestId dispatchedById').limit(10),
            StockMovement.find().populate('itemId locationId createdById').sort({ createdAt: -1 }).limit(10)
        ]);

        res.json({
            pendingMRs,
            shortageLines,
            pendingStockApps,
            pendingPOApps,
            storeBatches,
            purchaseBatches,
            purchaseOrders,
            dispatches,
            recentMovements,
            counts: {
                mrs: pendingMRs.length,
                stockApps: pendingStockApps.length,
                poApps: pendingPOApps.length,
                store: storeBatches.length,
                purchase: purchaseBatches.length
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/ledger', async (req, res) => {
    try {
        const history = await StockMovement.find()
            .populate('itemId', 'name itemCode')
            .populate('locationId', 'name locationCode')
            .populate('createdById', 'name')
            .sort({ createdAt: -1 })
            .limit(200);
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/history/:itemId', async (req, res) => {
    try {
        const history = await StockMovement.find({ itemId: req.params.itemId })
            .populate('locationId', 'name')
            .sort({ createdAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/low-stock', async (req, res) => {
    try {
        const stock = await StockBalance.find({ quantityOnHand: { $lt: 10 } })
            .populate('itemId', 'name itemCode');
        res.json(stock);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Legacy Compatibility Aliases ---

router.get('/dashboard-stats', async (req, res) => {
    try {
        const role = req.user.role;
        const userId = req.user._id;

        const [
            pendingMRs,
            shortageLines,
            pendingStockApps,
            pendingPOApps,
            storeBatches,
            purchaseBatches,
            purchaseOrders,
            dispatches,
            recentMovements
        ] = await Promise.all([
            MaterialRequest.find({ status: 'SUBMITTED' }).populate('projectId engineerId').limit(10),
            StoreRequestBatch.find({ "lines.status": 'SHORTAGE_REPORTED' }).populate('materialRequestId lines.itemId').limit(10),
            StockAdjustmentBatch.find({ status: 'SUBMITTED' }).populate('uploadedById').limit(10),
            PurchaseOrder.find({ status: 'PENDING_ADMIN_APPROVAL' }).populate('vendorId createdById').limit(10),
            StoreRequestBatch.find({ status: { $in: ['PENDING', 'CONFIRMED', 'SHORTAGE_REPORTED'] } }).populate('materialRequestId routedById').limit(10),
            PurchaseRequestBatch.find({ status: 'PENDING' }).populate('materialRequestId routedById').limit(10),
            PurchaseOrder.find({ status: { $in: ['DRAFT', 'REJECTED', 'APPROVED', 'PLACED'] } }).populate('vendorId createdById').limit(10),
            DispatchBatch.find({ status: 'DISPATCHED' }).populate('storeRequestId dispatchedById').limit(10),
            StockMovement.find().populate('itemId locationId createdById').sort({ createdAt: -1 }).limit(10)
        ]);

        res.json({
            pendingMRs,
            shortageLines,
            pendingStockApps,
            pendingPOApps,
            storeBatches,
            purchaseBatches,
            purchaseOrders,
            dispatches,
            recentMovements,
            counts: {
                mrs: pendingMRs.length,
                stockApps: pendingStockApps.length,
                poApps: pendingPOApps.length,
                store: storeBatches.length,
                purchase: purchaseBatches.length
            }
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/ledger', async (req, res) => {
    try {
        const history = await StockMovement.find()
            .populate('itemId', 'name itemCode')
            .populate('locationId', 'name locationCode')
            .populate('createdById', 'name')
            .sort({ createdAt: -1 })
            .limit(200);
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/history/:itemId', async (req, res) => {
    try {
        const history = await StockMovement.find({ itemId: req.params.itemId })
            .populate('locationId', 'name')
            .sort({ createdAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/low-stock', async (req, res) => {
    try {
        const stock = await StockBalance.find({ quantityOnHand: { $lt: 10 } })
            .populate('itemId', 'name itemCode');
        res.json(stock);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/submitStockAdjustment', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.STOCK_ADMIN, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;

        const { batchType, reason, payload, rows: directRows } = req.body;
        const rows = Array.isArray(directRows)
            ? directRows
            : (typeof payload === 'string' ? JSON.parse(payload) : payload);
        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({ message: 'No stock adjustment rows provided.' });
        }
        const currentRole = (req.user.role || '').toUpperCase().replace(/\s+/g, '_');
        console.log(`DEBUG: submitStockAdjustment - User: ${req.user.name}, Role: ${currentRole}`);
        const isAdmin = ['SUPER_ADMIN', 'SUPER_USER', 'ADMIN', 'STORE_MANAGER'].includes(currentRole);

        const batch = await StockAdjustmentBatch.create({
            batchType,
            status: isAdmin ? 'APPROVED' : 'SUBMITTED',
            reason: reason || null,
            uploadedById: req.user._id,
            approvedById: isAdmin ? req.user._id : null,
            submittedAt: new Date(),
            approvedAt: isAdmin ? new Date() : null,
            adminRemarks: isAdmin ? 'Admin upload applied directly.' : null,
            lines: []
        });

        for (const row of rows) {
            const item = await Item.findOne({ itemCode: row.itemCode?.toString().trim() });
            const location = await findLocationByReference(row.locationCode || row.locationName);

            if (!item) {
                console.warn(`⚠️ [Stock Adjust] Item not found for code: ${row.itemCode}`);
                continue;
            }
            if (!location) {
                console.warn(`⚠️ [Stock Adjust] Location not found for ref: ${row.locationCode || row.locationName}`);
                continue;
            }

            const balance = await StockBalance.findOne({ itemId: item._id, locationId: location._id });
            const systemQuantity = Number(balance?.quantityOnHand || 0);
            const adjustmentQuantity = batchType === 'RECONCILIATION'
                ? Number(row.quantity) - systemQuantity
                : Number(row.quantity);

            batch.lines.push({
                itemId: item._id,
                locationId: location._id,
                systemQuantity,
                uploadedQuantity: Number(row.quantity),
                adjustmentQuantity,
                rowNumber: row.rowNumber,
                remarks: row.remarks || null
            });

            if (isAdmin) {
                console.log(`DEBUG: Applying Stock Adjust - Item: ${item.itemCode}, Loc: ${location.locationCode}, TargetQty: ${row.quantity}`);
                const updateOp = batchType === 'RECONCILIATION' 
                    ? { $set: { quantityOnHand: Number(row.quantity) } }
                    : { $inc: { quantityOnHand: Number(row.quantity) } };

                await StockBalance.findOneAndUpdate(
                    { itemId: item._id, locationId: location._id },
                    updateOp,
                    { upsert: true }
                );

                await StockMovement.create({
                    itemId: item._id,
                    locationId: location._id,
                    movementType: batchType === 'RECONCILIATION' ? 'RECONCILIATION_ADJUSTMENT' : 'MANUAL_ADDITION',
                    quantityChange: adjustmentQuantity,
                    referenceType: 'StockAdjustmentBatch',
                    referenceId: batch._id,
                    remarks: row.remarks || reason || 'Admin stock upload',
                    createdById: req.user._id
                });
            }
        }

        await batch.save();

        if (isAdmin) {
            await logInvActivity('INV_STOCK_ADJUST', `Stock reconciliation batch ${batch._id} applied by admin`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        } else {
            await logInvActivity('INV_STOCK_ADJUST', `Stock adjustment batch ${batch._id} submitted for approval`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        }

        res.status(201).json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/approveStockAdjustment', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { batchId, adminRemarks } = req.body;
        const batch = await StockAdjustmentBatch.findById(batchId);

        if (!batch || batch.status !== 'SUBMITTED') {
            return res.status(400).json({ message: 'Only submitted batches can be approved.' });
        }

        const before = batch.toObject();

        for (const line of batch.lines) {
            await StockBalance.findOneAndUpdate(
                { itemId: line.itemId, locationId: line.locationId },
                { $inc: { quantityOnHand: line.adjustmentQuantity } },
                { upsert: true }
            );

            await StockMovement.create({
                itemId: line.itemId,
                locationId: line.locationId,
                movementType: batch.batchType === 'RECONCILIATION' ? 'RECONCILIATION_ADJUSTMENT' : 'MANUAL_ADDITION',
                quantityChange: line.adjustmentQuantity,
                referenceType: 'StockAdjustmentBatch',
                referenceId: batch._id,
                remarks: line.remarks || batch.reason,
                createdById: batch.uploadedById
            });
        }

        batch.status = 'APPROVED';
        batch.adminRemarks = adminRemarks;
        batch.approvedById = req.user._id;
        batch.approvedAt = new Date();
        await batch.save();

        await logAudit('StockAdjustmentBatch', batch._id, 'APPROVE', before, batch.toObject(), req);
        await logInvActivity('INV_STOCK_APPROVE', `Stock adjustment batch ${batch._id} approved`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        res.json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/stock-adjustments', async (req, res) => {
    try {
        const batches = await StockAdjustmentBatch.find()
            .populate('uploadedById', 'name')
            .populate('approvedById', 'name')
            .populate('lines.itemId', 'name itemCode uom')
            .populate('lines.locationId', 'name locationCode')
            .sort({ createdAt: -1 });

        const mapped = batches.map((batch) => ({
            ...batch.toObject(),
            id: batch._id,
            uploadedBy: batch.uploadedById,
            approvedBy: batch.approvedById,
            lines: (batch.lines || []).map((line) => ({
                ...line.toObject(),
                id: line._id,
                item: line.itemId,
                location: line.locationId
            }))
        }));

        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/rejectStockAdjustment', async (req, res) => {
    try {
        const { batchId, adminRemarks } = req.body;
        const batch = await StockAdjustmentBatch.findByIdAndUpdate(batchId, {
            status: 'REJECTED',
            adminRemarks,
            approvedById: req.user._id,
            rejectedAt: new Date()
        }, { new: true });
        res.json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/acknowledgeDispatch', async (req, res) => {
    try {
        const { dispatchId, receiptAction, engineerRemarks } = req.body;
        const dispatch = await DispatchBatch.findById(dispatchId).populate({
            path: 'storeRequestId',
            populate: { path: 'materialRequestId' }
        });

        if (!dispatch) return res.status(404).json({ message: 'Dispatch not found' });
        
        // Check if engineer is authorized (Admin or the assigned engineer)
        const isAuthorized = req.user.role === 'SUPER_ADMIN' || 
                             req.user.role === 'ADMIN' || 
                             dispatch.storeRequestId.materialRequestId.engineerId.toString() === req.user._id.toString();

        if (!isAuthorized) {
            return res.status(403).json({ message: 'Only the project engineer or Admin can acknowledge this dispatch.' });
        }

        dispatch.status = receiptAction === 'reject' ? 'REJECTED' : 'ACKNOWLEDGED';
        dispatch.acknowledgedById = req.user._id;
        dispatch.acknowledgedAt = new Date();
        dispatch.engineerRemarks = engineerRemarks;
        
        await dispatch.save();
        res.json(dispatch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/bridge/material-requests', async (req, res) => {
    try {
        const requests = await MaterialRequest.find()
            .populate('projectId', 'name projectCode')
            .populate('engineerId', 'name')
            .sort({ createdAt: -1 });
        
        // Map _id to id for frontend compatibility
        const mapped = requests.map(req => ({
            ...req.toObject(),
            id: req._id,
            project: req.projectId,
            engineer: req.engineerId,
            lines: (req.lines || []).map(l => ({ 
                ...(l.toObject ? l.toObject() : l), 
                id: l._id 
            })),
            _count: { lines: (req.lines || []).length }
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/bridge/material-requests/:id', async (req, res) => {
    try {
        const request = await MaterialRequest.findById(req.params.id)
            .populate('projectId')
            .populate('engineerId', 'name')
            .populate('lines.itemId');
        
        if (!request) return res.status(404).json({ message: 'Request not found' });

        const [storeBatches, purchaseBatches] = await Promise.all([
            StoreRequestBatch.find({ materialRequestId: request._id }),
            PurchaseRequestBatch.find({ materialRequestId: request._id })
        ]);

        // Map _id to id for frontend compatibility
        const mapped = {
            ...request.toObject(),
            id: request._id,
            project: request.projectId,
            engineer: request.engineerId,
            lines: (request.lines || []).map(l => ({ 
                ...(l.toObject ? l.toObject() : l),
                storeWorkflow: (() => {
                    for (const batch of storeBatches) {
                        const storeLine = (batch.lines || []).find((item) => normalizeId(item.materialRequestLineId) === normalizeId(l._id));
                        if (storeLine) {
                            return {
                                batchId: batch._id,
                                batchNumber: batch.batchNumber,
                                status: storeLine.status,
                                source: storeLine.source,
                                requestedQuantity: storeLine.requestedQuantity,
                                pendingQuantity: storeLine.pendingQuantity,
                                confirmedQuantity: storeLine.confirmedQuantity,
                                shortageQuantity: storeLine.shortageQuantity,
                                shortageReason: storeLine.shortageReason,
                                storeRemarks: storeLine.storeRemarks
                            };
                        }
                    }
                    return null;
                })(),
                purchaseWorkflow: (() => {
                    for (const batch of purchaseBatches) {
                        const purchaseLine = (batch.lines || []).find((item) => normalizeId(item.materialRequestLineId) === normalizeId(l._id));
                        if (purchaseLine) {
                            return {
                                batchId: batch._id,
                                batchNumber: batch.batchNumber,
                                requiredQuantity: purchaseLine.requiredQuantity,
                                pendingQuantity: purchaseLine.pendingQuantity,
                                purchaseRemarks: purchaseLine.purchaseRemarks
                            };
                        }
                    }
                    return null;
                })(),
                id: l._id,
                item: l.itemId
            })),
            _count: { lines: (request.lines || []).length }
        };
        res.json(mapped);
    } catch (err) {
        res.status(404).json({ message: 'Request not found' });
    }
});

router.post('/projects/material-request', async (req, res) => {
    console.log('📥 [Material Request] Incoming Body:', JSON.stringify(req.body, null, 2));
    try {
        let { projectId, notes, lines, payload } = req.body;

        // Support payload as string (legacy/compatibility)
        if (payload && !lines) {
            try {
                lines = typeof payload === 'string' ? JSON.parse(payload) : payload;
            } catch (pErr) {
                return res.status(400).json({ message: 'Invalid payload format' });
            }
        }

        if (!lines || !Array.isArray(lines)) {
            return res.status(400).json({ message: 'Lines array is required' });
        }

        const requestNumber = await getNextMRNumber();
        const enrichedLines = await Promise.all(lines.map(async (line, index) => {
            let itemId = line.itemId;
            
            // If itemId is missing but itemCode is present, resolve it
            if (!itemId && line.itemCode) {
                const item = await Item.findOne({ itemCode: line.itemCode });
                if (item) itemId = item._id;
            }

            if (!itemId) {
                throw new Error(`Item ${line.itemCode || 'Unknown'} not found`);
            }

            const stock = await StockBalance.find({ itemId });
            const totalAvailable = stock.reduce((sum, s) => sum + (s.quantityOnHand - s.reservedQuantity), 0);
            
            return { 
                itemId,
                requiredQuantity: line.requiredQuantity || line.quantity || 0,
                availableAtUpload: totalAvailable, 
                status: 'SUBMITTED', 
                rowNumber: line.rowNumber || index + 1 
            };
        }));

        const request = await MaterialRequest.create({
            requestNumber, projectId, engineerId: req.user._id, notes,
            status: 'SUBMITTED', submittedAt: new Date(), lines: enrichedLines
        });

        await logInvActivity('INV_MR_SUBMIT', `MR ${requestNumber} submitted`, req.user._id, req.user.name, request._id, requestNumber);
        res.status(201).json(request);
    } catch (err) {
        console.error('❌ [Material Request Submission Error]:', err);
        res.status(400).json({ message: err.message });
    }
});

// --- Shared Handlers for Aliasing ---

async function handleRouteMaterialRequestLine(req, res) {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { lineId, plannedStoreQuantity, plannedPurchaseQuantity, adminRemarks } = req.body;
        const storeQty = Math.max(0, Number(plannedStoreQuantity) || 0);
        const purchaseQty = Math.max(0, Number(plannedPurchaseQuantity) || 0);

        const request = await MaterialRequest.findOne({ "lines._id": lineId });
        if (!request) return res.status(404).json({ message: 'Line not found' });

        const line = request.lines.id(lineId);
        const totalPlanned = storeQty + purchaseQty;
        const previousStoreQty = Number(line.plannedStoreQuantity || 0);
        const availableNow = (await getCurrentAvailableStock(line.itemId, session)) + previousStoreQty;
        const maxStoreQuantity = Math.min(Number(line.requiredQuantity || 0), availableNow);
        const maxPurchaseQuantity = Math.max(0, Number(line.requiredQuantity || 0) - maxStoreQuantity);

        if (totalPlanned > line.requiredQuantity) {
            return res.status(400).json({ message: 'Planned quantity exceeds required quantity' });
        }
        if (totalPlanned <= 0) {
            return res.status(400).json({ message: 'At least one routing quantity is required' });
        }
        if (storeQty > maxStoreQuantity) {
            return res.status(400).json({ message: `Store quantity cannot exceed available stock. Available now: ${maxStoreQuantity}.` });
        }
        if (purchaseQty > maxPurchaseQuantity) {
            return res.status(400).json({ message: `Purchase quantity cannot exceed shortage after available stock. Maximum purchase quantity now: ${maxPurchaseQuantity}.` });
        }

        const before = request.toObject();
        const reservationChange = storeQty - previousStoreQty;
        if (reservationChange > 0) {
            await reserveItemQuantity(line.itemId, reservationChange, session);
        } else if (reservationChange < 0) {
            await releaseItemReservation(line.itemId, Math.abs(reservationChange), session);
        }

        line.plannedStoreQuantity = storeQty;
        line.plannedPurchaseQuantity = purchaseQty;
        line.adminRemarks = adminRemarks || 'Routed via IPMS';
        line.status = storeQty > 0 && purchaseQty > 0
            ? 'PARTIALLY_ROUTED'
            : storeQty > 0
                ? 'ROUTED_TO_STORE'
                : 'ROUTED_TO_PURCHASE';

        const allRouted = request.lines.every((entry) => entry.status !== 'SUBMITTED');
        if (allRouted) {
            request.status = 'ROUTED';
            request.reviewedById = req.user._id;
            request.adminReviewedAt = new Date();
        }

        await request.save();

        let storeBatch = await StoreRequestBatch.findOne({ materialRequestId: request._id, status: 'PENDING' });
        let purchaseBatch = await PurchaseRequestBatch.findOne({ materialRequestId: request._id, status: 'PENDING' });

        if (storeQty > 0) {
            if (!storeBatch) {
                const batchCount = await StoreRequestBatch.countDocuments();
                storeBatch = new StoreRequestBatch({
                    batchNumber: `STR-${new Date().getTime()}-${batchCount + 1}`,
                    materialRequestId: request._id,
                    routedById: req.user._id,
                    lines: []
                });
            }
            const existingStoreLine = storeBatch.lines.find((batchLine) => String(batchLine.materialRequestLineId) === String(lineId));
            if (existingStoreLine) {
                existingStoreLine.itemId = line.itemId;
                existingStoreLine.requestedQuantity = storeQty;
                existingStoreLine.pendingQuantity = storeQty;
            } else {
                storeBatch.lines.push({
                    materialRequestLineId: lineId,
                    itemId: line.itemId,
                    requestedQuantity: storeQty,
                    pendingQuantity: storeQty
                });
            }
            await storeBatch.save();
        } else if (storeBatch) {
            const existingStoreLine = storeBatch.lines.find((batchLine) => String(batchLine.materialRequestLineId) === String(lineId));
            if (existingStoreLine) {
                storeBatch.lines.pull(existingStoreLine._id);
                if (storeBatch.lines.length === 0) {
                    await storeBatch.deleteOne();
                } else {
                    await storeBatch.save();
                }
            }
        }

        if (purchaseQty > 0) {
            if (!purchaseBatch) {
                const batchCount = await PurchaseRequestBatch.countDocuments();
                purchaseBatch = new PurchaseRequestBatch({
                    batchNumber: `PRB-${new Date().getTime()}-${batchCount + 1}`,
                    materialRequestId: request._id,
                    routedById: req.user._id,
                    lines: []
                });
            }
            const existingPurchaseLine = purchaseBatch.lines.find((batchLine) => String(batchLine.materialRequestLineId) === String(lineId));
            if (existingPurchaseLine) {
                existingPurchaseLine.itemId = line.itemId;
                existingPurchaseLine.requiredQuantity = purchaseQty;
                existingPurchaseLine.pendingQuantity = purchaseQty;
            } else {
                purchaseBatch.lines.push({
                    materialRequestLineId: lineId,
                    itemId: line.itemId,
                    requiredQuantity: purchaseQty,
                    pendingQuantity: purchaseQty
                });
            }
            await purchaseBatch.save();
        } else if (purchaseBatch) {
            const existingPurchaseLine = purchaseBatch.lines.find((batchLine) => String(batchLine.materialRequestLineId) === String(lineId));
            if (existingPurchaseLine) {
                purchaseBatch.lines.pull(existingPurchaseLine._id);
                if (purchaseBatch.lines.length === 0) {
                    await purchaseBatch.deleteOne();
                } else {
                    await purchaseBatch.save();
                }
            }
        }

        await logAudit('MaterialRequest', request._id, 'UPDATE', before, request.toObject(), req, {
            action: 'ROUTE_LINE',
            lineId,
            storeQty,
            purchaseQty
        });
        await logInvActivity('INV_MR_ROUTE', `Line ${line.rowNumber} of MR ${request.requestNumber} routed`, req.user._id, req.user.name, request._id, request.requestNumber);
        res.json(request);
    } catch (err) {
        console.error('[Route MR Line Error]:', err);
        res.status(400).json({ message: err.message });
    } finally {
        await session.endSession();
    }
}

async function handleRouteMaterialRequestBulk(req, res) {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { requestId, routeTarget, lineId: lineIds } = req.body;
        if (!requestId) return res.status(400).json({ message: 'Request ID is required' });

        const request = await MaterialRequest.findById(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        const ids = Array.isArray(lineIds) ? lineIds : lineIds ? [lineIds] : [];
        if (ids.length === 0) return res.status(400).json({ message: 'No lines selected' });

        const before = request.toObject();

        for (const id of ids) {
            const line = request.lines.id(id);
            if (!line || line.status !== 'SUBMITTED') continue;

            const qty = Number(line.requiredQuantity || 0);
            const availableNow = await getCurrentAvailableStock(line.itemId, session);
            const maxStoreQuantity = Math.min(qty, availableNow);
            const maxPurchaseQuantity = Math.max(0, qty - maxStoreQuantity);

            if (routeTarget === 'store') {
                if (qty > maxStoreQuantity) {
                    return res.status(400).json({ message: `Store quantity cannot exceed available stock. Available now: ${maxStoreQuantity}.` });
                }

                await reserveItemQuantity(line.itemId, qty, session);
                line.plannedStoreQuantity = qty;
                line.plannedPurchaseQuantity = 0;
                line.status = 'ROUTED_TO_STORE';
                line.adminRemarks = 'Bulk routed to Store via IPMS';

                let storeBatch = await StoreRequestBatch.findOne({ materialRequestId: request._id, status: 'PENDING' });
                if (!storeBatch) {
                    const batchCount = await StoreRequestBatch.countDocuments();
                    storeBatch = new StoreRequestBatch({
                        batchNumber: `STR-${new Date().getTime()}-${batchCount + 1}`,
                        materialRequestId: request._id,
                        routedById: req.user._id,
                        lines: []
                    });
                }
                const existingStoreLine = storeBatch.lines.find((batchLine) => String(batchLine.materialRequestLineId) === String(id));
                if (existingStoreLine) {
                    existingStoreLine.itemId = line.itemId;
                    existingStoreLine.requestedQuantity = qty;
                    existingStoreLine.pendingQuantity = qty;
                } else {
                    storeBatch.lines.push({
                        materialRequestLineId: id,
                        itemId: line.itemId,
                        requestedQuantity: qty,
                        pendingQuantity: qty
                    });
                }
                await storeBatch.save();
            } else if (routeTarget === 'purchase') {
                if (qty > maxPurchaseQuantity) {
                    return res.status(400).json({ message: `Purchase quantity cannot exceed shortage after available stock. Maximum purchase quantity now: ${maxPurchaseQuantity}.` });
                }

                line.plannedStoreQuantity = 0;
                line.plannedPurchaseQuantity = qty;
                line.status = 'ROUTED_TO_PURCHASE';
                line.adminRemarks = 'Bulk routed to Purchase via IPMS';

                let purchaseBatch = await PurchaseRequestBatch.findOne({ materialRequestId: request._id, status: 'PENDING' });
                if (!purchaseBatch) {
                    const batchCount = await PurchaseRequestBatch.countDocuments();
                    purchaseBatch = new PurchaseRequestBatch({
                        batchNumber: `PRB-${new Date().getTime()}-${batchCount + 1}`,
                        materialRequestId: request._id,
                        routedById: req.user._id,
                        lines: []
                    });
                }
                const existingPurchaseLine = purchaseBatch.lines.find((batchLine) => String(batchLine.materialRequestLineId) === String(id));
                if (existingPurchaseLine) {
                    existingPurchaseLine.itemId = line.itemId;
                    existingPurchaseLine.requiredQuantity = qty;
                    existingPurchaseLine.pendingQuantity = qty;
                } else {
                    purchaseBatch.lines.push({
                        materialRequestLineId: id,
                        itemId: line.itemId,
                        requiredQuantity: qty,
                        pendingQuantity: qty
                    });
                }
                await purchaseBatch.save();
            }
        }

        const allRouted = request.lines.every(l => l.status !== 'SUBMITTED');
        if (allRouted) {
            request.status = 'ROUTED';
            request.reviewedById = req.user._id;
            request.adminReviewedAt = new Date();
        }
        await request.save();

        await logAudit('MaterialRequest', request._id, 'UPDATE', before, request.toObject(), req, {
            action: 'ROUTE_BULK',
            routeTarget,
            lineIds: ids
        });
        await logInvActivity('INV_MR_BULK_ROUTE', `Bulk routed lines for MR ${request.requestNumber}`, req.user._id, req.user.name, request._id, request.requestNumber);
        res.json(request);
    } catch (err) {
        console.error('[Bulk Route MR Error]:', err);
        res.status(400).json({ message: err.message });
    } finally {
        await session.endSession();
    }
}

router.post('/projects/material-request/route-line', handleRouteMaterialRequestLine);
router.post('/projects/material-request/bulk-route', handleRouteMaterialRequestBulk);
router.post('/routeMaterialRequestLine', handleRouteMaterialRequestLine);
router.post('/routeMaterialRequestBulk', handleRouteMaterialRequestBulk);

router.get('/inventory/purchase-planning', async (req, res) => {
    try {
        const rows = await buildPurchasePlanningRows();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/purchase/generate', (req, res, next) => {
    // Alias for generatePurchaseOrders
    req.url = '/generatePurchaseOrders';
    router.handle(req, res, next);
});

router.get('/bridge/purchase-orders', async (req, res) => {
    try {
        const orders = await PurchaseOrder.find().populate('vendorId', 'name vendorCode').populate('createdById', 'name').sort({ createdAt: -1 });
        res.json(orders.map(o => ({ ...o.toObject(), vendor: o.vendorId, id: o._id })));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/purchase/review', (req, res, next) => {
    // Map poId to purchaseOrderId for reviewPurchaseOrder compatibility
    req.body.purchaseOrderId = req.body.orderId;
    req.url = '/reviewPurchaseOrder';
    router.handle(req, res, next);
});

router.post('/purchase/placed', (req, res, next) => {
    req.url = '/markPurchaseOrderPlaced';
    router.handle(req, res, next);
});

router.post('/purchase/receive', (req, res, next) => {
    req.url = '/receivePurchaseOrderLines';
    router.handle(req, res, next);
});


router.post('/submitPurchaseOrderForApproval', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.PURCHASE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { purchaseOrderId } = req.body;
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) return res.status(404).json({ message: 'PO not found' });
        if (!['DRAFT', 'REJECTED'].includes(po.status)) {
            return res.status(400).json({ message: 'Only draft or rejected purchase orders can be submitted for approval.' });
        }

        const before = po.toObject();
        po.status = 'PENDING_ADMIN_APPROVAL';
        po.submittedForApprovalAt = new Date();
        po.adminRemarks = null;
        po.rejectedAt = null;
        po.approvedAt = null;
        po.approvedById = null;
        await po.save();

        await logAudit('PurchaseOrder', po._id, 'UPDATE', before, po.toObject(), req, { action: 'SUBMIT_FOR_APPROVAL' });
        await logInvActivity('INV_PO_SUBMIT', `Purchase Order ${po.poNumber} submitted for approval`, req.user._id, req.user.name, po._id, po.poNumber);
        res.json(po);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/bridge/store-requests', async (req, res) => {
    try {
        const batches = await StoreRequestBatch.find({ status: { $ne: 'DISPATCHED' } })
            .populate({
                path: 'materialRequestId',
                select: 'requestNumber projectId engineerId',
                populate: [
                    { path: 'projectId', select: 'name projectCode' },
                    { path: 'engineerId', select: 'name email' }
                ]
            })
            .populate('lines.itemId');
        res.json(batches.map((batch) => ({
            ...batch.toObject(),
            id: batch._id,
            materialRequestId: batch.materialRequestId ? {
                ...batch.materialRequestId.toObject(),
                project: batch.materialRequestId.projectId,
                engineer: batch.materialRequestId.engineerId,
                id: batch.materialRequestId._id
            } : null
        })));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/bridge/dispatches', async (req, res) => {
    try {
        const dispatches = await DispatchBatch.find()
            .populate({ path: 'storeRequestId', populate: { path: 'materialRequestId', populate: { path: 'projectId', select: 'name projectCode' } } })
            .populate('lines.itemId').sort({ dispatchedAt: -1 });
        res.json(dispatches.map(d => ({ ...d.toObject(), storeRequest: d.storeRequestId, id: d._id })));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/store/dispatch/acknowledge', async (req, res) => {
    try {
        const { batchId, remarks } = req.body;
        const dispatch = await DispatchBatch.findById(batchId);
        if (!dispatch) return res.status(404).json({ message: 'Dispatch not found' });
        dispatch.status = 'ACKNOWLEDGED';
        dispatch.acknowledgedById = req.user._id;
        dispatch.acknowledgedAt = new Date();
        dispatch.engineerRemarks = remarks;
        await dispatch.save();
        res.json(dispatch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Alias for standalone compatibility
router.get('/inventory', async (req, res) => {
    try {
        const items = await Item.find().populate('classificationId').sort({ itemCode: 1 });
        const balances = await StockBalance.find();
        
        const data = items.map(item => {
            const itemBalances = balances.filter(b => b.itemId && b.itemId.toString() === item._id.toString());
            return {
                ...item.toObject(),
                stockBalances: itemBalances
            };
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Admin Master Data Aliases ---
router.post('/admin/classifications', async (req, res) => {
    console.log('📥 [Inventory API] Received Create Classification Request:', req.body);
    try {
        const classification = await Classification.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Classification ${classification.name} created`, req.user._id, req.user.name, classification._id, classification.name);
        res.status(201).json(classification);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/admin/items', async (req, res) => {
    try {
        let { classificationId, name, uom, package, description } = req.body;
        
        // 1. Resolve Classification (handle name or ID safely)
        let classification;
        if (mongoose.Types.ObjectId.isValid(classificationId)) {
            classification = await Classification.findById(classificationId);
        }
        
        if (!classification) {
            classification = await Classification.findOne({ name: classificationId });
        }
        
        if (!classification) return res.status(400).json({ message: 'Invalid Classification: ' + classificationId });

        // 2. Auto-generate Item Code (Prefix + Sequence)
        const sequence = classification.nextSequenceNumber;
        const itemCode = `${classification.prefix}-${sequence.toString().padStart(6, '0')}`;
        
        // 3. Create Item
        const item = await Item.create({
            itemCode,
            classificationId: classification._id,
            name,
            uom,
            package,
            description
        });

        // 4. Increment Classification Sequence
        classification.nextSequenceNumber += 1;
        await classification.save();

        await logInvActivity('INV_MASTER_CREATE', `Item ${item.name} (${itemCode}) created`, req.user._id, req.user.name, item._id, item.name);
        res.status(201).json(item);
    } catch (err) {
        console.error('Item Create Error:', err);
        res.status(400).json({ message: err.message });
    }
});

router.post('/admin/locations', async (req, res) => {
    try {
        const location = await StockLocation.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Location ${location.name} created`, req.user._id, req.user.name, location._id, location.name);
        res.status(201).json(location);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/admin/vendors', async (req, res) => {
    try {
        const vendor = await Vendor.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Vendor ${vendor.name} created`, req.user._id, req.user.name, vendor._id, vendor.name);
        res.status(201).json(vendor);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/purchase/vendors', async (req, res) => {
    try {
        const vendor = await Vendor.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Vendor ${vendor.name} created`, req.user._id, req.user.name, vendor._id, vendor.name);
        res.status(201).json(vendor);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const items = await Item.find().populate('classificationId').sort({ itemCode: 1 });
        const balances = await StockBalance.find();
        
        const data = items.map(item => {
            const itemBalances = balances.filter(b => b.itemId.toString() === item._id.toString());
            return {
                ...item.toObject(),
                stockBalances: itemBalances
            };
        });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// --- Bridge Compatibility ---
router.get('/bridge/classifications', async (req, res) => {
    try {
        const data = await Classification.find().sort({ name: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/bridge/stock-locations', async (req, res) => {
    try {
        const data = await StockLocation.find().sort({ locationCode: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/bridge/vendors', async (req, res) => {
    try {
        const data = await Vendor.find().sort({ name: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/bridge/projects', async (req, res) => {
    try {
        const data = await Project.find({ department: 'HARDWARE' }).sort({ name: 1 });
        // Map _id to id for frontend compatibility
        const mapped = data.map(p => ({
            ...p.toObject(),
            id: p._id
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/stock/submit', async (req, res) => {
    try {
        const { batchType, reason, rows } = req.body;
        const isAdmin = ['SUPER_ADMIN', 'SUPER_USER'].includes(req.user.role);

        // 1. Create the Batch
        const batch = await StockAdjustmentBatch.create({
            batchType: batchType || 'RECONCILIATION',
            status: isAdmin ? 'APPROVED' : 'SUBMITTED',
            reason: reason || 'Bulk Upload',
            uploadedById: req.user._id,
            approvedById: isAdmin ? req.user._id : null,
            submittedAt: new Date(),
            approvedAt: isAdmin ? new Date() : null,
            lines: (rows || []).map(r => ({
                itemId: r.itemId,
                locationId: r.locationId,
                systemQuantity: r.systemQuantity || 0,
                uploadedQuantity: r.quantity,
                adjustmentQuantity: (batchType === 'RECONCILIATION') ? (r.quantity - (r.systemQuantity || 0)) : r.quantity,
                rowNumber: r.rowNumber,
                remarks: r.remarks
            }))
        });

        // 2. If Admin, apply changes immediately
        if (isAdmin) {
            for (const row of rows) {
                let itemId = row.itemId;
                let locationId = row.locationId;

                if (!itemId && row.itemCode) {
                    const item = await Item.findOne({ itemCode: row.itemCode });
                    if (item) itemId = item._id;
                }
                if (!locationId && (row.locationCode || row.locationName)) {
                    const loc = await findLocationByReference(row.locationCode || row.locationName);
                    if (loc) locationId = loc._id;
                }

                if (!itemId || !locationId) continue;

                const adjustment = (batchType === 'RECONCILIATION') ? (row.quantity - (row.systemQuantity || 0)) : row.quantity;

                await StockBalance.findOneAndUpdate(
                    { itemId, locationId },
                    { $inc: { quantityOnHand: adjustment } },
                    { upsert: true, new: true }
                );

                await StockMovement.create({
                    itemId,
                    locationId,
                    movementType: batchType === 'RECONCILIATION' ? 'RECONCILIATION_ADJUSTMENT' : 'MANUAL_ADDITION',
                    quantityChange: adjustment,
                    referenceType: 'StockAdjustmentBatch',
                    referenceId: batch._id,
                    remarks: row.remarks || reason || 'Admin Stock Upload',
                    createdById: req.user._id
                });
            }
            
            await logInvActivity('INV_STOCK_ADJUST', `Stock reconciliation batch ${batch._id} applied by admin`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        } else {
            await logInvActivity('INV_STOCK_ADJUST', `Stock adjustment batch ${batch._id} submitted for approval`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        }

        res.status(201).json(batch);
    } catch (err) {
        console.error('Stock Submit Error:', err);
        res.status(500).json({ message: err.message });
    }
});

// --- Material Request Native Logic ---

const getNextMRNumber = async () => {
    const count = await MaterialRequest.countDocuments();
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `MR-${stamp}-${(count + 1).toString().padStart(4, '0')}`;
};

router.post('/submitMaterialRequest', async (req, res) => {
    try {
        let { projectId, notes, lines, payload } = req.body;

        // Support payload as string (legacy/compatibility)
        if (payload && !lines) {
            try {
                lines = typeof payload === 'string' ? JSON.parse(payload) : payload;
            } catch (pErr) {
                return res.status(400).json({ message: 'Invalid payload format' });
            }
        }

        if (!lines || !Array.isArray(lines)) {
            return res.status(400).json({ message: 'Lines array is required' });
        }

        if (!projectId) {
            return res.status(400).json({ message: 'Project ID is required' });
        }

        const requestNumber = await getNextMRNumber();
        
        // Enrich lines with current availability
        const enrichedLines = await Promise.all(lines.map(async (line, index) => {
            let itemId = line.itemId;
            
            // Resolve itemCode to itemId if needed
            if (!itemId && line.itemCode) {
                const item = await Item.findOne({ itemCode: line.itemCode });
                if (item) itemId = item._id;
            }

            if (!itemId) {
                throw new Error(`Item ${line.itemCode || 'Unknown'} not found`);
            }

            const stock = await StockBalance.find({ itemId });
            const totalAvailable = stock.reduce((sum, s) => sum + (s.quantityOnHand - s.reservedQuantity), 0);
            
            return {
                itemId,
                requiredQuantity: line.requiredQuantity || line.quantity || 0,
                availableAtUpload: totalAvailable,
                status: 'SUBMITTED',
                rowNumber: line.rowNumber || index + 1
            };
        }));

        const request = await MaterialRequest.create({
            requestNumber,
            projectId,
            engineerId: req.user._id,
            notes,
            status: 'SUBMITTED',
            submittedAt: new Date(),
            lines: enrichedLines
        });

        await logInvActivity('INV_MR_SUBMIT', `Material Request ${requestNumber} submitted`, req.user._id, req.user.name, request._id, requestNumber);
        
        res.status(201).json(request);
    } catch (err) {
        console.error('❌ [Submit MR Error]:', err);
        res.status(400).json({ message: err.message });
    }
});


router.post('/routeMaterialRequestBulk', async (req, res) => {
    try {
        const { requestId, routeTarget, lineId: lineIds } = req.body;
        
        if (!requestId) return res.status(400).json({ message: 'Request ID is required' });
        
        const request = await MaterialRequest.findById(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        const ids = Array.isArray(lineIds) ? lineIds : lineIds ? [lineIds] : [];
        if (ids.length === 0) return res.status(400).json({ message: 'No lines selected' });

        for (const id of ids) {
            const line = request.lines.id(id);
            if (!line || line.status !== 'SUBMITTED') continue;

            const qty = line.requiredQuantity;

            if (routeTarget === 'store') {
                line.plannedStoreQuantity = qty;
                line.plannedPurchaseQuantity = 0;
                line.status = 'ROUTED_TO_STORE';

                let storeBatch = await StoreRequestBatch.findOne({ materialRequestId: request._id, status: 'PENDING' });
                if (!storeBatch) {
                    const batchCount = await StoreRequestBatch.countDocuments();
                    storeBatch = new StoreRequestBatch({
                        batchNumber: `STR-${new Date().getTime()}-${batchCount + 1}`,
                        materialRequestId: request._id,
                        routedById: req.user._id,
                        lines: []
                    });
                }
                storeBatch.lines.push({
                    materialRequestLineId: id,
                    itemId: line.itemId,
                    requestedQuantity: qty,
                    pendingQuantity: qty
                });
                await storeBatch.save();

            } else if (routeTarget === 'purchase') {
                line.plannedStoreQuantity = 0;
                line.plannedPurchaseQuantity = qty;
                line.status = 'ROUTED_TO_PURCHASE';

                let purchaseBatch = await PurchaseRequestBatch.findOne({ materialRequestId: request._id, status: 'PENDING' });
                if (!purchaseBatch) {
                    const batchCount = await PurchaseRequestBatch.countDocuments();
                    purchaseBatch = new PurchaseRequestBatch({
                        batchNumber: `PRB-${new Date().getTime()}-${batchCount + 1}`,
                        materialRequestId: request._id,
                        routedById: req.user._id,
                        lines: []
                    });
                }
                purchaseBatch.lines.push({
                    materialRequestLineId: id,
                    itemId: line.itemId,
                    requiredQuantity: qty,
                    pendingQuantity: qty
                });
                await purchaseBatch.save();
            }
        }

        const allRouted = request.lines.every(l => l.status !== 'SUBMITTED');
        if (allRouted) request.status = 'ROUTED';

        await request.save();
        await logInvActivity('INV_MR_BULK_ROUTE', `Bulk routed ${ids.length} lines of MR ${request.requestNumber} to ${routeTarget}`, req.user._id, req.user.name, request._id, request.requestNumber);

        res.json(request);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/material-requests', async (req, res) => {
    try {
        const requests = await MaterialRequest.find()
            .populate('projectId', 'name projectCode')
            .populate('engineerId', 'name')
            .sort({ createdAt: -1 });
        res.json(requests);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/material-requests/:id', async (req, res) => {
    try {
        const request = await MaterialRequest.findById(req.params.id)
            .populate('projectId')
            .populate('engineerId', 'name')
            .populate('lines.itemId');
        res.json(request);
    } catch (err) {
        res.status(404).json({ message: 'Request not found' });
    }
});

router.get('/purchase/requests', async (req, res) => {
    try {
        const rows = await buildPurchasePlanningRows();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/generatePurchaseOrders', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.PURCHASE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { payload, notes } = req.body;
        const items = JSON.parse(payload);

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: 'Purchase planning payload is required.' });
        }

        const vendorGroups = {};
        items.forEach(item => {
            const orderQuantity = Number(item.orderQuantity || 0);
            const rate = Number(item.rate || 0);
            const vendorId = normalizeId(item.vendorId);

            if (!vendorId) throw new Error(`Vendor selection is required for ${item.itemCode || item.itemId}.`);
            if (orderQuantity <= 0) throw new Error(`Order quantity must be greater than zero for ${item.itemCode || item.itemId}.`);
            if (rate <= 0) throw new Error(`Rate must be greater than zero for ${item.itemCode || item.itemId}.`);
            if (!Array.isArray(item.sourceLines) && !Array.isArray(item.sourceLineIds)) {
                throw new Error(`Source allocation is missing for ${item.itemCode || item.itemId}.`);
            }

            if (!vendorGroups[vendorId]) vendorGroups[vendorId] = [];
            vendorGroups[vendorId].push(item);
        });

        const results = [];

        await session.withTransaction(async () => {
            for (const [vendorId, lines] of Object.entries(vendorGroups)) {
                const poCount = await PurchaseOrder.countDocuments().session(session);
                const poNumber = `PO-${new Date().getFullYear()}-${(poCount + 1).toString().padStart(4, '0')}`;
                
                const poLines = [];

                for (const line of lines) {
                    const requestedQuantity = Number(line.requestedQuantity || 0);
                    const orderQuantity = Number(line.orderQuantity || 0);
                    const rate = Number(line.rate || 0);
                    const gstPercent = Number(line.gstPercent || 18);
                    const sourceEntries = Array.isArray(line.sourceLines)
                        ? line.sourceLines
                        : (line.sourceLineIds || []).map((sourceLineId) => ({ purchaseRequestLineId: sourceLineId }));

                    let remainingAllocation = orderQuantity;
                    const allocations = [];

                    for (const sourceEntry of sourceEntries) {
                        if (remainingAllocation <= 0.0001) break;

                        const pendingAvailable = Number(sourceEntry.requestedQuantity || sourceEntry.pendingQuantity || 0);
                        let allocateHere = pendingAvailable;

                        if (allocateHere <= 0) {
                            const batch = await PurchaseRequestBatch.findOne({ 'lines._id': sourceEntry.purchaseRequestLineId }).session(session);
                            const batchLine = batch?.lines.id(sourceEntry.purchaseRequestLineId);
                            allocateHere = Number(batchLine?.pendingQuantity || 0);
                        }

                        const quantity = Math.min(allocateHere, remainingAllocation);
                        if (quantity <= 0) continue;

                        allocations.push({
                            purchaseRequestLineId: sourceEntry.purchaseRequestLineId,
                            quantity
                        });
                        remainingAllocation -= quantity;
                    }

                    if (remainingAllocation > 0.0001) {
                        throw new Error(`Order quantity exceeds pending source quantities for ${line.itemCode || line.itemId}.`);
                    }

                    // Persist normalized PurchasePlanLine
                    for (const alloc of allocations) {
                        await PurchasePlanLine.findOneAndUpdate(
                            { purchaseRequestLineId: alloc.purchaseRequestLineId },
                            {
                                itemId: line.itemId,
                                vendorId,
                                requestedQuantity: alloc.quantity,
                                orderQuantity: alloc.quantity,
                                rate,
                                gstPercent,
                                sku: line.sku || null,
                                remarks: notes || null
                            },
                            { upsert: true, session }
                        );
                    }

                    poLines.push({
                        itemId: line.itemId,
                        sku: line.sku || null,
                        requestedQuantity,
                        orderQuantity,
                        rate,
                        gstPercent,
                        lineTotal: orderQuantity * rate * (1 + gstPercent / 100),
                        sourceLines: allocations
                    });
                }

                const po = (await PurchaseOrder.create([{
                    poNumber,
                    vendorId,
                    status: 'DRAFT',
                    createdById: req.user._id,
                    notes,
                    lines: poLines
                }], { session }))[0];

                // Create normalized PurchaseOrderLineAllocation records
                for (const poLine of po.lines) {
                    for (const src of poLine.sourceLines) {
                        await PurchaseOrderLineAllocation.create([{
                            purchaseOrderId: po._id,
                            purchaseOrderLineId: String(poLine._id),
                            purchaseRequestLineId: src.purchaseRequestLineId,
                            orderedQuantity: src.quantity,
                            receivedQuantity: 0
                        }], { session });
                    }
                }

                // Update PurchaseRequestBatch lines
                for (const line of poLines) {
                    for (const sourceLine of line.sourceLines) {
                        await PurchaseRequestBatch.updateOne(
                            { "lines._id": sourceLine.purchaseRequestLineId },
                            { $inc: { "lines.$.pendingQuantity": -sourceLine.quantity } }
                        ).session(session);
                    }
                }

                const affectedBatches = new Set(
                    poLines.flatMap((line) => line.sourceLines.map((sourceLine) => normalizeId(sourceLine.purchaseRequestLineId)))
                );

                for (const sourceLineId of affectedBatches) {
                    const batch = await PurchaseRequestBatch.findOne({ 'lines._id': sourceLineId }).session(session);
                    if (!batch) continue;
                    const hasPending = batch.lines.some((entry) => Number(entry.pendingQuantity || 0) > 0);
                    batch.status = hasPending ? 'IN_PO' : 'ORDERED';
                    await batch.save({ session });
                }

                results.push(po);
                await logAudit('PurchaseOrder', po._id, 'CREATE', null, po.toObject(), req, { poNumber });
                await logInvActivity('INV_PO_CREATE', `Purchase Order ${poNumber} created as DRAFT`, req.user._id, req.user.name, po._id, poNumber);
            }
        });

        res.status(201).json(results);
    } catch (err) {
        res.status(400).json({ message: err.message });
    } finally { await session.endSession(); }
});

router.get('/purchase/orders', async (req, res) => {
    try {
        const orders = await PurchaseOrder.find()
            .populate('vendorId', 'name vendorCode')
            .populate('createdById', 'name')
            .populate('lines.itemId', 'name itemCode uom classificationId')
            .sort({ createdAt: -1 });
        
        // Map vendorId to vendor for frontend compatibility
        const mapped = orders.map(o => ({
            ...o.toObject(),
            vendor: o.vendorId,
            lines: (o.lines || []).map((line) => ({
                ...line.toObject(),
                item: line.itemId ? {
                    ...line.itemId.toObject(),
                    classification: line.itemId.classificationId
                } : null
            })),
            id: o._id
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/purchase/orders/:id', async (req, res) => {
    try {
        const order = await PurchaseOrder.findById(req.params.id)
            .populate('vendorId', 'name vendorCode')
            .populate('createdById', 'name')
            .populate('approvedById', 'name')
            .populate('placedById', 'name')
            .populate('lines.itemId', 'name itemCode uom classificationId');

        if (!order) {
            return res.status(404).json({ message: 'PO not found' });
        }

        res.json({
            ...order.toObject(),
            vendor: order.vendorId,
            lines: (order.lines || []).map((line) => ({
                ...line.toObject(),
                item: line.itemId ? {
                    ...line.itemId.toObject(),
                    classification: line.itemId.classificationId
                } : null
            })),
            id: order._id
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/reviewPurchaseOrder', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { purchaseOrderId, decision, adminRemarks } = req.body;
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) return res.status(404).json({ message: 'PO not found' });

        const normalizedDecision = decision === 'APPROVE'
            ? 'APPROVED'
            : decision === 'REJECT'
                ? 'REJECTED'
                : decision;

        if (!['APPROVED', 'REJECTED'].includes(normalizedDecision)) {
            return res.status(400).json({ message: 'Invalid PO review decision' });
        }

        const before = po.toObject();

        po.status = normalizedDecision;
        po.adminRemarks = adminRemarks;
        po.approvedById = req.user._id;
        po.approvedAt = new Date();
        
        // If REJECTED, recover the pending quantities in PR batches
        if (normalizedDecision === 'REJECTED') {
            for (const line of po.lines) {
                if (line.sourceLines && line.sourceLines.length > 0) {
                    for (const src of line.sourceLines) {
                        await PurchaseRequestBatch.updateOne(
                            { "lines._id": src.purchaseRequestLineId },
                            { 
                                $inc: { "lines.$.pendingQuantity": src.quantity },
                                $set: { status: 'PENDING' } // Move batch back to pending if needed
                            }
                        );
                    }
                }
            }
        }

        await po.save();
        await logAudit('PurchaseOrder', po._id, 'UPDATE', before, po.toObject(), req, { decision: normalizedDecision });

        await logInvActivity('INV_PO_REVIEW', `Purchase Order ${po.poNumber} ${normalizedDecision}`, req.user._id, req.user.name, po._id, po.poNumber);
        res.json(po);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/markPurchaseOrderPlaced', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.PURCHASE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { purchaseOrderId, expectedDeliveryDate, vendorDocumentNote } = req.body;
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) return res.status(404).json({ message: 'PO not found' });

        const before = po.toObject();
        po.status = 'PLACED';
        po.placedById = req.user._id;
        po.placedAt = new Date();
        po.expectedDeliveryDate = expectedDeliveryDate || null;
        po.vendorDocumentNote = vendorDocumentNote || null;
        await po.save();
        await logAudit('PurchaseOrder', po._id, 'UPDATE', before, po.toObject(), req, { action: 'MARK_PLACED' });

        await logInvActivity('INV_PO_PLACE', `Purchase Order ${po.poNumber} marked as PLACED`, req.user._id, req.user.name, po._id, po.poNumber);
        res.json(po);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/stock-locations', async (req, res) => {
    try {
        const data = await StockLocation.find({ status: 'ACTIVE' }).sort({ locationCode: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/receivePurchaseOrderLines', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { purchaseOrderId, locationId, documentNote, remarks, lineIds } = req.body;
        const ids = Array.isArray(lineIds) ? lineIds : lineIds ? [lineIds] : [];
        if (ids.length === 0) return res.status(400).json({ message: 'No lines to receive' });
        if (!locationId) return res.status(400).json({ message: 'Location is required' });
        let inward;
        let poNumber;
        let inwardNumber;
        let receivedLineCount = 0;

        await session.withTransaction(async () => {
            const po = await PurchaseOrder.findById(purchaseOrderId).session(session);
            if (!po) {
                throw new Error('PO not found');
            }

            if (po.status !== 'PLACED') {
                throw new Error('Only placed purchase orders can be received.');
            }

            poNumber = po.poNumber;
            const inwardCount = await PurchaseInwardBatch.countDocuments().session(session);
            inwardNumber = `GRN-${new Date().getTime()}-${inwardCount + 1}`;

            inward = new PurchaseInwardBatch({
                inwardNumber,
                purchaseOrderId,
                receivedById: req.user._id,
                documentNote,
                remarks,
                lines: []
            });

            for (const lineId of ids) {
                const qty = Number(req.body[`receive:${lineId}`]);
                if (qty <= 0) continue;
                receivedLineCount += 1;

                const poLine = po.lines.id(lineId);
                if (!poLine) {
                    throw new Error(`PO line not found for ${lineId}.`);
                }

                const remainingOnLine = Number(poLine.orderQuantity || 0) - Number(poLine.receivedQuantity || 0);
                if (qty > remainingOnLine + 0.0001) {
                    throw new Error(`Received quantity cannot exceed pending quantity for ${lineId}.`);
                }

                const serials = req.body[`serials:${lineId}`]
                    ? req.body[`serials:${lineId}`].split(',').map((s) => s.trim()).filter(Boolean)
                    : [];

                const inwardLineId = new mongoose.Types.ObjectId();
                inward.lines.push({
                    _id: inwardLineId,
                    purchaseOrderLineId: lineId,
                    itemId: poLine.itemId,
                    locationId,
                    receivedQuantity: qty,
                    serials,
                    serialNumbers: serials
                });

                poLine.receivedQuantity = Number(poLine.receivedQuantity || 0) + qty;

                await StockBalance.findOneAndUpdate(
                    { itemId: poLine.itemId, locationId },
                    { $inc: { quantityOnHand: qty } },
                    { upsert: true, new: true, session }
                );

                let remainingToRoute = qty;
                const allocations = await PurchaseOrderLineAllocation.find({
                    purchaseOrderLineId: String(poLine._id)
                }).sort({ createdAt: 1 }).session(session);

                for (const allocation of allocations) {
                    if (remainingToRoute <= 0.0001) break;

                    const allocationPending = Number(allocation.orderedQuantity || 0) - Number(allocation.receivedQuantity || 0);
                    const quantityForRequest = Math.min(allocationPending, remainingToRoute);
                    if (quantityForRequest <= 0) continue;

                    const prBatch = await PurchaseRequestBatch.findOne({
                        'lines._id': allocation.purchaseRequestLineId
                    }).session(session);
                    if (!prBatch) continue;

                    const prLine = prBatch.lines.id(allocation.purchaseRequestLineId);
                    if (!prLine) continue;

                    allocation.receivedQuantity = Number(allocation.receivedQuantity || 0) + quantityForRequest;
                    await allocation.save({ session });

                    // CRITICAL: Decrement pending quantity on the purchase request line
                    prLine.pendingQuantity = Math.max(0, Number(prLine.pendingQuantity || 0) - quantityForRequest);
                    
                    // Check if entire PR batch is received
                    const prBatchFullyReceived = prBatch.lines.every(l => Number(l.pendingQuantity || 0) <= 0.0001);
                    if (prBatchFullyReceived) {
                        prBatch.status = 'RECEIVED';
                    } else if (prBatch.status === 'PENDING' || prBatch.status === 'ORDERED') {
                         // Optional: could set to 'PARTIAL' if you add that status, but keeping it simple for now
                    }

                    await prBatch.save({ session });

                    await StockBalance.findOneAndUpdate(
                        { itemId: poLine.itemId, locationId },
                        { $inc: { reservedQuantity: quantityForRequest } },
                        { session }
                    );

                    let storeBatch = await StoreRequestBatch.findOne({
                        materialRequestId: prBatch.materialRequestId,
                        status: { $nin: ['DISPATCHED', 'CANCELLED'] }
                    }).session(session);

                    if (!storeBatch) {
                        const batchCount = await StoreRequestBatch.countDocuments().session(session);
                        storeBatch = new StoreRequestBatch({
                            batchNumber: `STR-AUTO-${new Date().getTime()}-${batchCount + 1}`,
                            materialRequestId: prBatch.materialRequestId,
                            status: 'CONFIRMED',
                            routedById: req.user._id,
                            routedAt: new Date(),
                            notes: `Automatically routed from Purchase Inward ${inwardNumber}`,
                            lines: []
                        });
                    } else {
                        storeBatch.routedById = req.user._id;
                        storeBatch.routedAt = new Date();
                        storeBatch.notes = `Automatically routed from Purchase Inward ${inwardNumber}`;
                    }

                    storeBatch.lines.push({
                        materialRequestLineId: prLine.materialRequestLineId,
                        itemId: poLine.itemId,
                        requestedQuantity: quantityForRequest,
                        pendingQuantity: quantityForRequest,
                        confirmedQuantity: quantityForRequest,
                        shortageQuantity: 0,
                        status: 'CONFIRMED',
                        source: 'PURCHASE_INWARD',
                        purchaseInwardLineId: inwardLineId,
                        storeRemarks: remarks || `Received via PO ${po.poNumber}`
                    });

                    const hasShortage = storeBatch.lines.some((line) => line.status === 'SHORTAGE_REPORTED');
                    const hasPending = storeBatch.lines.some((line) => line.status === 'PENDING');
                    storeBatch.status = hasShortage ? 'SHORTAGE_REPORTED' : hasPending ? 'PENDING' : 'CONFIRMED';

                    await storeBatch.save({ session });
                    remainingToRoute -= quantityForRequest;
                }

                await StockMovement.create([{
                    itemId: poLine.itemId,
                    locationId,
                    movementType: 'PURCHASE_INWARD',
                    quantityChange: qty,
                    referenceType: 'PurchaseInwardBatch',
                    referenceId: inward._id,
                    serialNumbers: serials,
                    remarks: remarks || `Received via ${po.poNumber}. ${serials.length > 0 ? `Serials: ${serials.join(', ')}` : ''}`.trim(),
                    createdById: req.user._id
                }], { session });
            }

            if (receivedLineCount === 0) {
                throw new Error('At least one positive receive quantity is required.');
            }

            // Check if PO is fully received
            const poFullyReceived = po.lines.every(line => 
                Number(line.receivedQuantity || 0) >= Number(line.orderQuantity || 0) - 0.0001
            );
            if (poFullyReceived) {
                po.status = 'RECEIVED';
            }

            await inward.save({ session });
            await po.save({ session });
        });

        await logAudit('PurchaseInwardBatch', inward._id, 'CREATE', null, inward.toObject(), req, { poNumber, inwardNumber });
        await logInvActivity('INV_INWARD', `Goods received and auto-routed for PO ${poNumber}. GRN: ${inwardNumber}`, req.user._id, req.user.name, inward._id, inwardNumber);
        res.status(201).json(inward);
    } catch (err) {
        const status = err.message === 'PO not found' ? 404 : 400;
        res.status(status).json({ message: err.message });
    } finally {
        await session.endSession();
    }
});

router.get('/store/requests', async (req, res) => {
    try {
        const batches = await StoreRequestBatch.find({ status: { $ne: 'DISPATCHED' } })
            .populate({
                path: 'materialRequestId',
                select: 'requestNumber projectId engineerId',
                populate: [
                    { path: 'projectId', select: 'name projectCode' },
                    { path: 'engineerId', select: 'name email' }
                ]
            })
            .populate('lines.itemId');
        res.json(batches.map((batch) => ({
            ...batch.toObject(),
            id: batch._id,
            materialRequestId: batch.materialRequestId ? {
                ...batch.materialRequestId.toObject(),
                project: batch.materialRequestId.projectId,
                engineer: batch.materialRequestId.engineerId,
                id: batch.materialRequestId._id
            } : null
        })));
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/confirmStoreAvailability', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;

        const { batchId, lineIds } = req.body;
        const confirmedIds = new Set(req.body.confirmed || []);
        
        const batch = await StoreRequestBatch.findById(batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        const beforeBatch = batch.toObject();

        let hasShortage = false;

        for (const lineId of lineIds) {
            const line = batch.lines.id(lineId);
            const isConfirmed = confirmedIds.has(lineId);
            const actualQty = isConfirmed ? line.requestedQuantity : Number(req.body[`actual:${lineId}`] || 0);
            
            line.confirmedQuantity = actualQty;
            line.shortageQuantity = line.requestedQuantity - actualQty;
            line.pendingQuantity = actualQty;
            line.status = line.shortageQuantity > 0 ? 'SHORTAGE_REPORTED' : 'CONFIRMED';
            line.shortageReason = req.body[`reason:${lineId}`];

            if (line.shortageQuantity > 0) hasShortage = true;

            // Reserve the confirmed quantity
            if (actualQty > 0) {
                // Find a location with stock to reserve from
                // For simplicity, we find the first location with enough stock.
                // In a real system, we'd allow the store manager to pick locations.
                const balance = await StockBalance.findOne({ itemId: line.itemId, quantityOnHand: { $gte: actualQty } });
                if (balance) {
                    balance.reservedQuantity += actualQty;
                    await balance.save();
                    
                    await StockMovement.create({
                        itemId: line.itemId,
                        locationId: balance.locationId,
                        movementType: 'STOCK_RESERVED',
                        quantityChange: 0, // Quantity on hand doesn't change yet
                        remarks: `Reserved ${actualQty} for MR ${batch.batchNumber}`,
                        createdById: req.user._id
                    });
                }
            }
        }

        batch.status = hasShortage ? 'SHORTAGE_REPORTED' : 'CONFIRMED';
        await batch.save();

        await logAudit('StoreRequestBatch', batch._id, 'UPDATE', beforeBatch, batch.toObject(), req, { action: 'CONFIRM_AVAILABILITY' });
        await logInvActivity('INV_STORE_CONFIRM', `Store confirmed availability for ${batch.batchNumber}`, req.user._id, req.user.name, batch._id, batch.batchNumber);
        res.json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/amendStoreShortageLine', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;

        const lineId = req.body.lineId || req.body.amendLineId;
        if (!lineId) {
            return res.status(400).json({ message: 'Material request line is required.' });
        }

        const request = await MaterialRequest.findOne({ 'lines._id': lineId });
        if (!request) {
            return res.status(404).json({ message: 'Material request line not found.' });
        }

        const line = request.lines.id(lineId);
        const storeBatch = await StoreRequestBatch.findOne({ materialRequestId: request._id, 'lines.materialRequestLineId': String(lineId) });
        const storeLine = storeBatch?.lines.find(
            (item) => normalizeId(item.materialRequestLineId) === normalizeId(lineId) &&
                item.source === 'STOCK' &&
                item.status === 'SHORTAGE_REPORTED'
        );

        if (!line || !storeBatch || !storeLine) {
            return res.status(400).json({ message: 'Only shortage lines returned by Store can be amended.' });
        }

        const availableQuantity = Number(storeLine.confirmedQuantity || 0);
        const requiredQuantity = Number(line.requiredQuantity || 0);
        const purchaseQuantity = Math.max(0, requiredQuantity - availableQuantity);

        await reconcileStorePhysicalCount(
            line.itemId,
            availableQuantity,
            availableQuantity,
            normalizeId(storeLine._id),
            req.user._id
        );

        const beforeLine = line.toObject();
        line.plannedStoreQuantity = availableQuantity;
        line.plannedPurchaseQuantity = purchaseQuantity;
        line.status = availableQuantity > 0 && purchaseQuantity > 0
            ? 'PARTIALLY_ROUTED'
            : purchaseQuantity > 0
                ? 'ROUTED_TO_PURCHASE'
                : 'ROUTED_TO_STORE';
        line.adminRemarks = `Store confirmed ${availableQuantity}. Balance ${purchaseQuantity} moved to Purchase.`;
        await request.save();

        await logAudit('MaterialRequestLine', line._id, 'UPDATE', beforeLine, line.toObject(), req, { requestId: request._id, action: 'AMEND_SHORTAGE' });

        const beforeStoreLine = { ...storeLine.toObject() };
        storeLine.requestedQuantity = availableQuantity;
        storeLine.pendingQuantity = availableQuantity;
        storeLine.confirmedQuantity = availableQuantity;
        storeLine.shortageQuantity = 0;
        storeLine.status = 'CONFIRMED';
        storeLine.shortageReason = null;
        await updateStoreBatchStatus(storeBatch);

        await logAudit('StoreRequestLine', storeLine._id, 'UPDATE', beforeStoreLine, storeLine.toObject(), req, { batchId: storeBatch._id, action: 'AMEND_SHORTAGE' });

        let purchaseBatch = await PurchaseRequestBatch.findOne({ materialRequestId: request._id, status: { $in: ['PENDING', 'IN_PO'] } });
        if (!purchaseBatch && purchaseQuantity > 0) {
            const batchCount = await PurchaseRequestBatch.countDocuments();
            purchaseBatch = new PurchaseRequestBatch({
                batchNumber: `PRB-${new Date().getTime()}-${batchCount + 1}`,
                materialRequestId: request._id,
                routedById: req.user._id,
                status: 'PENDING',
                lines: []
            });
        }

        if (purchaseBatch) {
            const existingPurchaseLine = purchaseBatch.lines.find((item) => normalizeId(item.materialRequestLineId) === normalizeId(lineId));

            if (purchaseQuantity > 0) {
                if (existingPurchaseLine) {
                    existingPurchaseLine.requiredQuantity = purchaseQuantity;
                    existingPurchaseLine.pendingQuantity = purchaseQuantity;
                    existingPurchaseLine.purchaseRemarks = line.adminRemarks;
                } else {
                    purchaseBatch.lines.push({
                        materialRequestLineId: normalizeId(lineId),
                        itemId: line.itemId,
                        requiredQuantity: purchaseQuantity,
                        pendingQuantity: purchaseQuantity,
                        purchaseRemarks: line.adminRemarks
                    });
                }
            } else if (existingPurchaseLine) {
                existingPurchaseLine.pendingQuantity = 0;
                existingPurchaseLine.requiredQuantity = 0;
                existingPurchaseLine.purchaseRemarks = line.adminRemarks;
            }

            purchaseBatch.status = 'PENDING';
            await purchaseBatch.save();
        }

        await logInvActivity(
            'INV_MR_ROUTE',
            `Admin amended shortage for line ${line.rowNumber} in MR ${request.requestNumber}`,
            req.user._id,
            req.user.name,
            request._id,
            request.requestNumber
        );

        res.json({
            success: true,
            requestId: request._id,
            lineId,
            availableQuantity,
            purchaseQuantity
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/dispatchConfirmedStoreRequest', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { batchId, storeRemarks } = req.body;
        const batch = await StoreRequestBatch.findById(batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });
        const beforeBatch = batch.toObject();

        const dispatchCount = await DispatchBatch.countDocuments();
        const dispatchNumber = `DSP-${new Date().getTime()}-${dispatchCount + 1}`;
        
        const dispatchLines = [];

        for (const line of batch.lines) {
            if (line.status !== 'CONFIRMED' || line.pendingQuantity <= 0) continue;

            const qty = line.pendingQuantity;
            
            // Release reservation and decrement on-hand
            const balance = await StockBalance.findOne({ itemId: line.itemId, reservedQuantity: { $gte: qty } });
            if (balance) {
                balance.quantityOnHand -= qty;
                balance.reservedQuantity -= qty;
                await balance.save();

                await StockMovement.create({
                    itemId: line.itemId,
                    locationId: balance.locationId,
                    movementType: 'STOCK_DISPATCHED',
                    quantityChange: -qty,
                    referenceType: 'DispatchBatch',
                    referenceId: dispatchNumber,
                    remarks: `Dispatched to engineer`,
                    createdById: req.user._id
                });
            }

            dispatchLines.push({
                storeRequestLineId: line._id,
                itemId: line.itemId,
                dispatchedQuantity: qty
            });

            line.pendingQuantity = 0;
        }

        const dispatch = await DispatchBatch.create({
            dispatchNumber,
            storeRequestId: batch._id,
            dispatchedById: req.user._id,
            storeRemarks,
            lines: dispatchLines
        });

        batch.status = 'DISPATCHED';
        await batch.save();

        await logAudit('DispatchBatch', dispatch._id, 'CREATE', null, dispatch.toObject(), req, { dispatchNumber });
        await logAudit('StoreRequestBatch', batch._id, 'UPDATE', beforeBatch, batch.toObject(), req, { action: 'DISPATCH', dispatchNumber });
        await logInvActivity('INV_DISPATCH', `Stock dispatched. DSP: ${dispatchNumber}`, req.user._id, req.user.name, dispatch._id, dispatchNumber);
        res.json(dispatch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/dispatches', async (req, res) => {
    try {
        const dispatches = await DispatchBatch.find()
            .populate({
                path: 'storeRequestId',
                populate: {
                    path: 'materialRequestId',
                    populate: { path: 'projectId', select: 'name projectCode' }
                }
            })
            .populate('lines.itemId')
            .sort({ dispatchedAt: -1 });
        
        // Flatten for frontend compatibility
        const mapped = dispatches.map(d => ({
            ...d.toObject(),
            storeRequest: d.storeRequestId,
            id: d._id
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/dispatches/:id/acknowledge', async (req, res) => {
    try {
        const { remarks } = req.body;
        const dispatch = await DispatchBatch.findById(req.params.id);
        if (!dispatch) return res.status(404).json({ message: 'Dispatch not found' });
        const beforeDispatch = dispatch.toObject();

        dispatch.status = 'ACKNOWLEDGED';
        dispatch.acknowledgedById = req.user._id;
        dispatch.acknowledgedAt = new Date();
        dispatch.engineerRemarks = remarks;
        await dispatch.save();

        await logAudit('DispatchBatch', dispatch._id, 'UPDATE', beforeDispatch, dispatch.toObject(), req, { action: 'ACKNOWLEDGE_DISPATCH' });
        await logInvActivity('INV_DISPATCH_ACK', `Dispatch ${dispatch.dispatchNumber} acknowledged by engineer`, req.user._id, req.user.name, dispatch._id, dispatch.dispatchNumber);
        res.json(dispatch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/stock/history/:itemIdOrSerial', async (req, res) => {
    try {
        const param = req.params.itemIdOrSerial;
        let query = {};

        if (param.startsWith('SN-')) {
            query = {
                $or: [
                    { serialNumbers: param },
                    { remarks: { $regex: param, $options: 'i' } }
                ]
            };
        } else {
            query = { itemId: param };
        }

        const history = await StockMovement.find(query)
            .populate('itemId', 'name itemCode')
            .populate('locationId', 'name locationCode')
            .populate('createdById', 'name')
            .sort({ createdAt: -1 });
        res.json(history);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/stock/transfer', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        const { itemId, fromLocationId, toLocationId, quantity, remarks } = req.body;
        const transferQty = Number(quantity);

        if (!itemId || !fromLocationId || !toLocationId) {
            return res.status(400).json({ message: 'Item, source location, and destination location are required' });
        }

        if (fromLocationId === toLocationId) {
            return res.status(400).json({ message: 'Source and destination locations must be different' });
        }

        if (!Number.isFinite(transferQty) || transferQty <= 0) {
            return res.status(400).json({ message: 'Transfer quantity must be greater than zero' });
        }

        const sourceBalance = await StockBalance.findOne({ itemId, locationId: fromLocationId });
        if (!sourceBalance || sourceBalance.quantityOnHand - sourceBalance.reservedQuantity < transferQty) {
            return res.status(400).json({ message: 'Insufficient available stock at source location' });
        }

        const beforeSource = sourceBalance.toObject();
        sourceBalance.quantityOnHand -= transferQty;
        await sourceBalance.save();

        let destinationBalance = await StockBalance.findOne({ itemId, locationId: toLocationId });
        const beforeDestination = destinationBalance ? destinationBalance.toObject() : null;
        if (!destinationBalance) {
            destinationBalance = await StockBalance.create({
                itemId,
                locationId: toLocationId,
                quantityOnHand: 0,
                reservedQuantity: 0
            });
        }
        destinationBalance.quantityOnHand += transferQty;
        await destinationBalance.save();

        const transferRef = new mongoose.Types.ObjectId().toString();
        await StockMovement.create({
            itemId,
            locationId: fromLocationId,
            movementType: 'STOCK_DISPATCHED',
            quantityChange: -transferQty,
            referenceType: 'StockTransfer',
            referenceId: transferRef,
            remarks: remarks || 'Internal stock transfer - source',
            createdById: req.user._id
        });
        await StockMovement.create({
            itemId,
            locationId: toLocationId,
            movementType: 'MANUAL_ADDITION',
            quantityChange: transferQty,
            referenceType: 'StockTransfer',
            referenceId: transferRef,
            remarks: remarks || 'Internal stock transfer - destination',
            createdById: req.user._id
        });

        await logAudit('StockBalance', sourceBalance._id, 'UPDATE', beforeSource, sourceBalance.toObject(), req, { transferRef, direction: 'OUT' });
        await logAudit('StockBalance', destinationBalance._id, 'UPDATE', beforeDestination, destinationBalance.toObject(), req, { transferRef, direction: 'IN' });
        await logInvActivity('INV_STOCK_ADJUST', `Transferred ${transferQty} units internally`, req.user._id, req.user.name, sourceBalance._id, String(itemId));

        res.json({
            success: true,
            transferRef,
            itemId,
            fromLocationId,
            toLocationId,
            quantity: transferQty
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Final Module Aliases ---

router.post('/stock/approve', async (req, res) => {
    try {
        const { batchId, adminRemarks } = req.body;
        const batch = await StockAdjustmentBatch.findById(batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });

        batch.status = 'APPROVED';
        batch.approvedById = req.user._id;
        batch.approvedAt = new Date();
        batch.adminRemarks = adminRemarks;

        // Apply stock changes
        for (const line of batch.lines) {
            await StockBalance.findOneAndUpdate(
                { itemId: line.itemId, locationId: line.locationId },
                { $inc: { quantityOnHand: line.adjustmentQuantity } },
                { upsert: true }
            );

            await StockMovement.create({
                itemId: line.itemId,
                locationId: line.locationId,
                movementType: batch.batchType === 'RECONCILIATION' ? 'RECONCILIATION_ADJUSTMENT' : 'MANUAL_ADDITION',
                quantityChange: line.adjustmentQuantity,
                referenceType: 'StockAdjustmentBatch',
                referenceId: batch._id,
                remarks: adminRemarks || 'Approved by Admin',
                createdById: req.user._id
            });
        }

        await batch.save();
        await logInvActivity('INV_STOCK_ADJUST', `Stock batch ${batch._id} approved`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        res.json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Module Aliases for Unified UI ---

router.get('/admin/items', (req, res, next) => {
    req.url = '/items';
    router.handle(req, res, next);
});

router.post('/admin/items', (req, res, next) => {
    req.url = '/createItem';
    router.handle(req, res, next);
});

router.get('/admin/vendors', (req, res, next) => {
    req.url = '/vendors';
    router.handle(req, res, next);
});

router.post('/admin/vendors', (req, res, next) => {
    req.url = '/createVendor';
    router.handle(req, res, next);
});

router.get('/admin/locations', (req, res, next) => {
    req.url = '/stock-locations';
    router.handle(req, res, next);
});

router.post('/admin/locations', (req, res, next) => {
    req.url = '/createStockLocation';
    router.handle(req, res, next);
});

router.post('/store/confirm', (req, res, next) => {
    req.url = '/confirmStoreAvailability';
    router.handle(req, res, next);
});

router.post('/store/dispatch', (req, res, next) => {
    req.url = '/dispatchConfirmedStoreRequest';
    router.handle(req, res, next);
});

router.get('/admin/classifications', (req, res, next) => {
    req.url = '/classifications';
    router.handle(req, res, next);
});

router.post('/admin/classifications', (req, res, next) => {
    req.url = '/createClassification';
    router.handle(req, res, next);
});

module.exports = router;
