const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { generatePurchaseOrderPdf } = require('./services/poPdfService');
const { 
    Classification, Vendor, Item, ItemVendorSku, StockLocation, StockBalance, StockMovement, 
    MaterialRequest, StoreRequestBatch, DispatchBatch, PurchaseRequestBatch,
    PurchasePlanLine, PurchaseOrder, PurchaseOrderLineAllocation,
    PurchaseInwardBatch, ProjectReturnBatch, StockAdjustmentBatch, Activity, User, Notification, Project, Task
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

const normalizeId = (value) => (value ? String(value) : '');

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

const DAMAGED_HOLD_LOCATION = {
    locationCode: 'DMG-HOLD',
    name: 'Damaged Hold',
    label: 'Damaged Hold',
    description: 'Quarantine location for damaged project returns'
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

async function issueReservedStock(itemId, quantity, referenceId, userId, session = null) {
    let remaining = quantity;
    const balances = await StockBalance.find({ 
        itemId, 
        reservedQuantity: { $gt: 0 } 
    }).sort({ reservedQuantity: -1, updatedAt: 1 }).session(session);

    for (const balance of balances) {
        if (remaining <= 0.0001) break;
        
        const onHand = Number(balance.quantityOnHand || 0);
        const reserved = Number(balance.reservedQuantity || 0);
        const issueHere = Math.min(reserved, onHand, remaining);

        if (issueHere > 0) {
            balance.quantityOnHand -= issueHere;
            balance.reservedQuantity -= issueHere;
            await balance.save({ session });

            await StockMovement.create([{
                itemId,
                locationId: balance.locationId,
                movementType: 'STOCK_DISPATCHED',
                quantityChange: -issueHere,
                referenceType: 'DispatchBatch',
                referenceId: String(referenceId),
                remarks: `Dispatched ${issueHere} NOS to engineer`,
                createdById: userId
            }], { session });

            remaining -= issueHere;
        }
    }

    if (remaining > 0.0001) {
        throw new Error(`Insufficient reserved stock to dispatch ${quantity} NOS. Remaining shortage: ${remaining.toFixed(2)}`);
    }
}

async function getCurrentAvailableStock(itemId, session = null) {
    const balances = await StockBalance.find({ itemId }).session(session);
    return balances.reduce((total, balance) => {
        const onHand = Number(balance.quantityOnHand || 0);
        const reserved = Number(balance.reservedQuantity || 0);
        return total + Math.max(0, onHand - reserved);
    }, 0);
}

async function getCurrentReservedStock(itemId, session = null) {
    const balances = await StockBalance.find({ itemId }).session(session);
    return balances.reduce((total, balance) => total + Number(balance.reservedQuantity || 0), 0);
}

async function getOrCreateDamagedHoldLocation(session = null) {
    let location = await StockLocation.findOne({ locationCode: DAMAGED_HOLD_LOCATION.locationCode }).session(session);
    if (!location) {
        const created = await StockLocation.create([{
            ...DAMAGED_HOLD_LOCATION,
            isActive: true,
            status: 'ACTIVE'
        }], session ? { session } : undefined);
        location = created[0];
    }
    return location;
}

async function getDamagedHoldLocationId(session = null) {
    const location = await StockLocation.findOne({ locationCode: DAMAGED_HOLD_LOCATION.locationCode }).session(session);
    return location ? location._id : null;
}

async function getProjectReturnableItems(projectId, recipientUserId = null) {
    const approvedReturns = await ProjectReturnBatch.find({
        projectId,
        status: 'APPROVED'
    }).lean();

    const alreadyReturnedByItem = new Map();
    for (const batch of approvedReturns) {
        for (const line of batch.lines || []) {
            const itemKey = normalizeId(line.itemId);
            const current = alreadyReturnedByItem.get(itemKey) || { good: 0, damaged: 0 };
            current.good += Number(line.goodQuantity || 0);
            current.damaged += Number(line.damagedQuantity || 0);
            alreadyReturnedByItem.set(itemKey, current);
        }
    }

    const dispatches = await DispatchBatch.find({
        status: { $in: ['DISPATCHED', 'ACKNOWLEDGED'] }
    })
        .populate({
            path: 'storeRequestId',
            populate: { path: 'materialRequestId', populate: { path: 'projectId', select: 'name projectCode' } }
        })
        .populate('lines.itemId', 'name itemCode uom')
        .sort({ dispatchedAt: -1 });

    const eligibleMap = new Map();

    for (const dispatch of dispatches) {
        const dispatchProjectId = normalizeId(dispatch.storeRequestId?.materialRequestId?.projectId?._id || dispatch.storeRequestId?.materialRequestId?.projectId);
        if (dispatchProjectId !== normalizeId(projectId)) continue;
        if (recipientUserId) {
            const dispatchRecipientId = normalizeId(
                dispatch.storeRequestId?.materialRequestId?.engineerId?._id ||
                dispatch.storeRequestId?.materialRequestId?.engineerId
            );
            if (dispatchRecipientId !== normalizeId(recipientUserId)) continue;
        }

        for (const line of dispatch.lines || []) {
            const itemId = normalizeId(line.itemId?._id || line.itemId);
            if (!itemId) continue;

            if (!eligibleMap.has(itemId)) {
                eligibleMap.set(itemId, {
                    itemId,
                    item: line.itemId && typeof line.itemId === 'object'
                        ? { ...line.itemId.toObject?.(), id: line.itemId._id }
                        : null,
                    issuedQuantity: 0,
                    alreadyReturnedQuantity: 0,
                    maxReturnableQuantity: 0,
                    dispatchIds: new Set(),
                    dispatchLineRefs: []
                });
            }

            const bucket = eligibleMap.get(itemId);
            bucket.issuedQuantity += Number(line.dispatchedQuantity || 0);
            bucket.dispatchIds.add(normalizeId(dispatch._id));
            bucket.dispatchLineRefs.push(normalizeId(line._id));
        }
    }

    return [...eligibleMap.values()]
        .map((entry) => {
            const returned = alreadyReturnedByItem.get(entry.itemId) || { good: 0, damaged: 0 };
            const alreadyReturnedQuantity = Number(returned.good || 0) + Number(returned.damaged || 0);
            const maxReturnableQuantity = Math.max(0, Number(entry.issuedQuantity || 0) - alreadyReturnedQuantity);

            return {
                ...entry,
                alreadyReturnedQuantity,
                maxReturnableQuantity,
                dispatchIds: [...entry.dispatchIds]
            };
        })
        .filter((entry) => entry.maxReturnableQuantity > 0.0001)
        .sort((a, b) => (a.item?.name || '').localeCompare(b.item?.name || ''));
}

async function getEligibleProjectReturnsForUser(user) {
    const dispatches = await DispatchBatch.find({
        status: { $in: ['DISPATCHED', 'ACKNOWLEDGED'] }
    })
        .populate({
            path: 'storeRequestId',
            populate: { path: 'materialRequestId', populate: { path: 'projectId', select: 'name projectCode status managerId department' } }
        })
        .sort({ dispatchedAt: -1 });

    const restrictToRecipient = [roles.MANAGER, roles.ENGINEER, roles.JUNIOR_ENGINEER].includes(user.role);
    const projectMap = new Map();

    for (const dispatch of dispatches) {
        const materialRequest = dispatch.storeRequestId?.materialRequestId;
        const project = materialRequest?.projectId;
        if (!project) continue;

        if (restrictToRecipient) {
            const dispatchRecipientId = normalizeId(materialRequest.engineerId?._id || materialRequest.engineerId);
            if (dispatchRecipientId !== normalizeId(user._id)) continue;
        }

        const projectId = normalizeId(project._id || project);
        if (!projectMap.has(projectId)) {
            projectMap.set(projectId, {
                ...(project.toObject ? project.toObject() : project),
                id: project._id || project,
                latestDispatchAt: dispatch.dispatchedAt
            });
        }
    }

    const projects = [];
    for (const project of projectMap.values()) {
        const items = await getProjectReturnableItems(project.id, restrictToRecipient ? user._id : null);
        if (items.length > 0) {
            projects.push({
                ...project,
                returnableItemCount: items.length
            });
        }
    }

    return projects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

async function checkMRCompletion(mrId, session = null) {
    try {
        const mr = await MaterialRequest.findById(mrId).session(session);
        if (!mr) return;

        // Find all Store batches for this MR
        const storeBatches = await StoreRequestBatch.find({ materialRequestId: mrId }).session(session);
        const storeBatchIds = storeBatches.map(b => b._id);

        // Find all Acknowledged dispatches for these store batches
        const dispatches = await DispatchBatch.find({ 
            storeRequestId: { $in: storeBatchIds },
            status: 'ACKNOWLEDGED'
        }).session(session);

        // Map item requirements
        const requirements = new Map();
        mr.lines.forEach(line => {
            const itemId = String(line.itemId);
            requirements.set(itemId, (requirements.get(itemId) || 0) + line.requiredQuantity);
        });

        // Map acknowledged dispatches
        const fulfilled = new Map();
        dispatches.forEach(d => {
            d.lines.forEach(line => {
                const itemId = String(line.itemId);
                fulfilled.set(itemId, (fulfilled.get(itemId) || 0) + line.dispatchedQuantity);
            });
        });

        // Verify if all requirements are met
        let allFulfilled = true;
        for (const [itemId, required] of requirements.entries()) {
            const received = fulfilled.get(itemId) || 0;
            if (received < (required - 0.0001)) {
                allFulfilled = false;
                break;
            }
        }

        if (allFulfilled && mr.status !== 'COMPLETED') {
            mr.status = 'COMPLETED';
            await mr.save({ session });
            console.log(`✅ [MR Completion] Material Request ${mr.requestNumber} marked as COMPLETED.`);
            await logInvActivity('INV_MR_COMPLETE', `Material Request ${mr.requestNumber} fully fulfilled and acknowledged`, null, 'System', mr._id, mr.requestNumber);
        }
    } catch (err) {
        console.error('❌ [MR Completion Check Error]:', err);
    }
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

async function buildIndividualPurchaseRequestRows() {
    const requests = await PurchaseRequestBatch.find({ status: 'PENDING' })
        .populate({
            path: 'materialRequestId',
            select: 'requestNumber projectId engineerId',
            populate: [
                { path: 'projectId', select: 'name projectCode' },
                { path: 'engineerId', select: 'name' }
            ]
        })
        .populate({
            path: 'lines.itemId',
            populate: [
                { path: 'classificationId', select: 'name tracksSerial' },
                { path: 'skuMappings.vendorId', select: 'vendorCode name gstin' }
            ]
        });

    const rows = [];

    requests.forEach((batch) => {
        batch.lines.forEach((line) => {
            const quantity = Number(line.pendingQuantity || 0);
            if (quantity <= 0 || !line.itemId) return;

            const item = line.itemId;
            const skuMappings = (item.skuMappings || []).map((mapping) => ({
                vendorId: normalizeId(mapping.vendorId?._id || mapping.vendorId),
                vendorCode: mapping.vendorId?.vendorCode || '',
                vendorName: mapping.vendorId?.name || '',
                sku: mapping.sku || ''
            }));

            rows.push({
                id: normalizeId(line._id),
                itemId: normalizeId(item._id),
                itemCode: item.itemCode,
                name: item.name,
                package: item.package || null,
                classification: item.classificationId?.name || '',
                requestedQuantity: quantity,
                sourceLineIds: [normalizeId(line._id)],
                sourceLines: [{
                    purchaseRequestLineId: normalizeId(line._id),
                    requestedQuantity: quantity,
                    batchId: normalizeId(batch._id),
                    materialRequestId: normalizeId(batch.materialRequestId?._id || batch.materialRequestId),
                    requestNumber: batch.materialRequestId?.requestNumber || '',
                    projectId: normalizeId(batch.materialRequestId?.projectId?._id || batch.materialRequestId?.projectId),
                    projectName: batch.materialRequestId?.projectId?.name || 'Unknown Project'
                }],
                project: batch.materialRequestId?.projectId?.name || 'Unknown Project',
                requestNumber: batch.materialRequestId?.requestNumber || 'N/A',
                requestedBy: batch.materialRequestId?.engineerId?.name || 'System',
                skuMappings
            });
        });
    });

    return rows.sort((a, b) => b.id.localeCompare(a.id));
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
        const damagedHoldLocationId = await getDamagedHoldLocationId();
        const balanceQuery = damagedHoldLocationId
            ? { locationId: { $ne: damagedHoldLocationId } }
            : {};

        const balances = await StockBalance.find(balanceQuery)
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

router.get('/stock/damaged', async (req, res) => {
    try {
        const damagedHoldLocationId = await getDamagedHoldLocationId();
        if (!damagedHoldLocationId) {
            return res.json([]);
        }

        const balances = await StockBalance.find({ locationId: damagedHoldLocationId, quantityOnHand: { $gt: 0 } })
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
        const damagedHoldLocationId = await getDamagedHoldLocationId();
        const stock = await StockBalance.find({
            quantityOnHand: { $lt: 10 },
            ...(damagedHoldLocationId ? { locationId: { $ne: damagedHoldLocationId } } : {})
        })
            .populate('itemId', 'name itemCode');
        res.json(stock);
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
        const damagedHoldLocationId = await getDamagedHoldLocationId();
        const stock = await StockBalance.find({
            quantityOnHand: { $lt: 10 },
            ...(damagedHoldLocationId ? { locationId: { $ne: damagedHoldLocationId } } : {})
        })
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
        const isAdmin = ['SUPER_ADMIN', 'SUPER_USER', 'ADMIN'].includes(currentRole);

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
        await logInvActivity('INV_STOCK_ADJUST', `Stock batch ${batch._id} approved`, req.user._id, req.user.name, batch._id, 'Stock Batch');
        res.json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/confirmStoreAvailability', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;
        
        const {
            batchId,
            lineIds,
            confirmedIds,
            confirmedIdsArray,
            confirmed,
            actualQuantities,
            reasons
        } = req.body;
        const confirmedIdValues = [
            ...(Array.isArray(confirmedIds) ? confirmedIds : []),
            ...(Array.isArray(confirmedIdsArray) ? confirmedIdsArray : []),
            ...(Array.isArray(confirmed) ? confirmed : [])
        ];
        const confirmedIdSet = new Set(confirmedIdValues.map((id) => String(id)));

        if (!batchId) return res.status(400).json({ message: "Batch ID is required." });
        if (!lineIds || !lineIds.length) return res.status(400).json({ message: "No line IDs provided." });

        await session.withTransaction(async () => {
            const batch = await StoreRequestBatch.findById(batchId).session(session);
            if (!batch) throw new Error("Store request batch not found.");

            let hasShortage = false;

            for (const lineId of lineIds) {
                const line = batch.lines.id(lineId);
                if (!line) continue;

                const requestedQuantity = Number(line.requestedQuantity || 0);
                const previousConfirmedQuantity = Number(line.confirmedQuantity || 0);
                const isConfirmed = confirmedIdSet.has(String(lineId));
                
                const actualQuantity = isConfirmed 
                    ? requestedQuantity 
                    : Number(actualQuantities?.[lineId] || 0);
                
                const reason = reasons?.[lineId];

                if (!Number.isFinite(actualQuantity) || actualQuantity < 0 || actualQuantity > requestedQuantity) {
                    throw new Error(`Actual quantity for item ${lineId} must be between zero and requested (${requestedQuantity}).`);
                }

                const shortageQuantity = requestedQuantity - actualQuantity;
                const status = shortageQuantity > 0 ? 'SHORTAGE_REPORTED' : 'CONFIRMED';

                if (shortageQuantity > 0) {
                    hasShortage = true;
                }

                // RESERVATION ADJUSTMENT LOGIC:
                // When a Store Request is routed, the full quantity is reserved.
                // If the Store Manager reports a shortage, we must release the reserved quantity for that shortage amount.
                const previousReservedTarget = line.status === 'PENDING'
                    ? requestedQuantity
                    : previousConfirmedQuantity;
                const confirmationIncrease = actualQuantity - previousReservedTarget;
                
                if (confirmationIncrease < 0) {
                    // Manager reduced confirmed quantity (increased shortage) -> Release reservation
                    await releaseItemReservation(line.itemId, Math.abs(confirmationIncrease), session);
                } else if (confirmationIncrease > 0) {
                    // Manager increased confirmed quantity (reduced shortage) -> Reserve more if available
                    // If stock is already sitting in reserved due to an earlier mismatch, reuse it.
                    const available = await getCurrentAvailableStock(line.itemId, session);
                    const reserved = await getCurrentReservedStock(line.itemId, session);
                    if (available < confirmationIncrease && reserved < actualQuantity) {
                        throw new Error(`Cannot confirm ${actualQuantity} NOS for item ${lineId}. Only ${available + previousConfirmedQuantity} NOS available/reserved total.`);
                    }
                    if (available >= confirmationIncrease) {
                        await reserveItemQuantity(line.itemId, confirmationIncrease, session);
                    }
                }

                line.confirmedQuantity = actualQuantity;
                line.shortageQuantity = shortageQuantity;
                line.pendingQuantity = actualQuantity;
                line.status = status;
                line.shortageReason = shortageQuantity > 0 ? (reason || "Store reported lower physical availability.") : null;
            }

            batch.status = hasShortage ? 'SHORTAGE_REPORTED' : 'CONFIRMED';
            await batch.save({ session });
        });

        res.json({ success: true, message: "Store availability confirmed successfully." });
    } catch (err) {
        console.error('❌ [Confirm Store Availability Error]:', err);
        res.status(400).json({ message: err.message });
    } finally {
        await session.endSession();
    }
});

router.post('/dispatchConfirmedStoreRequest', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [roles.STORE_MANAGER, roles.ADMIN, roles.SUPER_ADMIN, roles.SUPER_USER])) return;

        const { batchId, storeRemarks } = req.body;
        if (!batchId) return res.status(400).json({ message: "Store request batch ID is required." });

        let dispatchResult;

        await session.withTransaction(async () => {
            const batch = await StoreRequestBatch.findById(batchId).session(session);
            if (!batch) throw new Error("Store request batch not found.");

            // Filter lines that are confirmed but not yet dispatched
            const dispatchableLines = batch.lines.filter(l => l.status === 'CONFIRMED' && Number(l.pendingQuantity || 0) > 0);
            
            if (!dispatchableLines.length) {
                throw new Error("No confirmed pending items are available for dispatch in this batch.");
            }

            const dispatchCount = await DispatchBatch.countDocuments().session(session);
            const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
            const dispatchNumber = `DSP-${stamp}-${(dispatchCount + 1).toString().padStart(4, '0')}`;

            const dispatch = new DispatchBatch({
                dispatchNumber,
                storeRequestId: batch._id,
                status: 'DISPATCHED',
                dispatchedById: req.user._id,
                storeRemarks: storeRemarks || null,
                lines: []
            });

            for (const line of dispatchableLines) {
                const quantity = Number(line.pendingQuantity || 0);
                if (quantity <= 0) continue;

                // Move from Reserved to Dispatched (decrements both onHand and reservedQuantity)
                await issueReservedStock(line.itemId, quantity, dispatch._id, req.user._id, session);

                dispatch.lines.push({
                    storeRequestLineId: String(line._id),
                    itemId: line.itemId,
                    dispatchedQuantity: quantity
                });
                
                line.pendingQuantity = 0; // Fully dispatched
            }

            await dispatch.save({ session });

            // Check if any lines in the batch still have pending store quantities
            const remainingPending = batch.lines.some(l => Number(l.pendingQuantity || 0) > 0);
            batch.status = remainingPending ? 'IN_DISPATCH' : 'DISPATCHED';

            await batch.save({ session });
            dispatchResult = dispatch;
        });

        await logInvActivity('INV_DISPATCH', `Stock dispatched via ${dispatchResult.dispatchNumber}`, req.user._id, req.user.name, dispatchResult._id, dispatchResult.dispatchNumber);
        res.json(dispatchResult);
    } catch (err) {
        console.error('❌ [Dispatch Error]:', err);
        res.status(400).json({ message: err.message });
    } finally {
        await session.endSession();
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
        
        // Trigger MR completion check
        if (dispatch.status === 'ACKNOWLEDGED') {
            const d = await DispatchBatch.findById(dispatch._id).populate('storeRequestId');
            if (d?.storeRequestId?.materialRequestId) {
                await checkMRCompletion(d.storeRequestId.materialRequestId);
            }
        }
        
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
        const { mode } = req.query;
        const rows = mode === 'individual' 
            ? await buildIndividualPurchaseRequestRows() 
            : await buildPurchasePlanningRows();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.get('/inventory/purchase-requests/individual', async (req, res) => {
    try {
        const rows = await buildIndividualPurchaseRequestRows();
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
        
        // Trigger MR completion check
        if (dispatch.status === 'ACKNOWLEDGED') {
            const d = await DispatchBatch.findById(dispatch._id).populate('storeRequestId');
            if (d?.storeRequestId?.materialRequestId) {
                await checkMRCompletion(d.storeRequestId.materialRequestId);
            }
        }
        
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

router.get('/project-returns/eligible-items/:projectId', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [
            roles.MANAGER,
            roles.ENGINEER,
            roles.JUNIOR_ENGINEER,
            roles.STORE_MANAGER,
            roles.ADMIN,
            roles.SUPER_ADMIN,
            roles.SUPER_USER
        ])) return;

        const projectId = req.params.projectId;
        if (!projectId) {
            return res.status(400).json({ message: 'Project ID is required.' });
        }

        const project = await Project.findById(projectId).select('name projectCode');
        if (!project) {
            return res.status(404).json({ message: 'Project not found.' });
        }

        const restrictToRecipient = [roles.MANAGER, roles.ENGINEER, roles.JUNIOR_ENGINEER].includes(req.user.role);
        const items = await getProjectReturnableItems(projectId, restrictToRecipient ? req.user._id : null);
        res.json({
            project: { ...project.toObject(), id: project._id },
            items
        });
    } catch (err) {
        console.error('Project return eligibility error:', err);
        res.status(500).json({ message: err.message });
    }
});

router.get('/project-returns/eligible-projects', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [
            roles.MANAGER,
            roles.ENGINEER,
            roles.JUNIOR_ENGINEER,
            roles.STORE_MANAGER,
            roles.ADMIN,
            roles.SUPER_ADMIN,
            roles.SUPER_USER
        ])) return;

        const projects = await getEligibleProjectReturnsForUser(req.user);
        res.json(projects);
    } catch (err) {
        console.error('Project return eligible projects error:', err);
        res.status(500).json({ message: err.message });
    }
});

router.get('/project-returns', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [
            roles.MANAGER,
            roles.ENGINEER,
            roles.JUNIOR_ENGINEER,
            roles.STORE_MANAGER,
            roles.ADMIN,
            roles.SUPER_ADMIN,
            roles.SUPER_USER
        ])) return;

        const query = {};
        if ([roles.MANAGER, roles.ENGINEER, roles.JUNIOR_ENGINEER].includes(req.user.role)) {
            query.submittedById = req.user._id;
        }

        const batches = await ProjectReturnBatch.find(query)
            .populate('projectId', 'name projectCode')
            .populate('destinationLocationId', 'name locationCode')
            .populate('submittedById', 'name')
            .populate('reviewedById', 'name')
            .populate('lines.itemId', 'name itemCode uom')
            .sort({ createdAt: -1 });

        res.json(batches.map((batch) => ({
            ...batch.toObject(),
            id: batch._id,
            project: batch.projectId,
            destinationLocation: batch.destinationLocationId,
            submittedBy: batch.submittedById,
            reviewedBy: batch.reviewedById,
            lines: (batch.lines || []).map((line) => ({
                ...(line.toObject ? line.toObject() : line),
                id: line._id,
                item: line.itemId
            }))
        })));
    } catch (err) {
        console.error('Project returns list error:', err);
        res.status(500).json({ message: err.message });
    }
});

router.post('/project-returns', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [
            roles.MANAGER,
            roles.ENGINEER,
            roles.JUNIOR_ENGINEER,
            roles.ADMIN,
            roles.SUPER_ADMIN,
            roles.SUPER_USER
        ])) return;

        const { projectId, destinationLocationId, lines, overallRemarks } = req.body;
        if (!projectId || !destinationLocationId) {
            return res.status(400).json({ message: 'Project and destination location are required.' });
        }

        if (!Array.isArray(lines) || !lines.length) {
            return res.status(400).json({ message: 'At least one return line is required.' });
        }

        const [project, destinationLocation] = await Promise.all([
            Project.findById(projectId).select('name projectCode'),
            StockLocation.findById(destinationLocationId).select('name locationCode')
        ]);

        if (!project) return res.status(404).json({ message: 'Project not found.' });
        if (!destinationLocation) return res.status(404).json({ message: 'Destination location not found.' });

        const eligibleItems = await getProjectReturnableItems(projectId);
        const eligibleMap = new Map(eligibleItems.map((item) => [normalizeId(item.itemId), item]));

        const sanitizedLines = [];
        const sourceDispatchIds = new Set();

        for (const rawLine of lines) {
            const itemId = normalizeId(rawLine.itemId);
            const eligible = eligibleMap.get(itemId);
            if (!eligible) {
                return res.status(400).json({ message: 'One or more selected items are not returnable for this project.' });
            }

            const goodQuantity = Number(rawLine.goodQuantity || 0);
            const damagedQuantity = Number(rawLine.damagedQuantity || 0);
            const totalQuantity = goodQuantity + damagedQuantity;

            if (totalQuantity <= 0) {
                return res.status(400).json({ message: 'Each return line must include a positive good or damaged quantity.' });
            }

            if (totalQuantity > Number(eligible.maxReturnableQuantity || 0) + 0.0001) {
                return res.status(400).json({ message: `${eligible.item?.name || 'Selected item'} exceeds the remaining returnable quantity.` });
            }

            const conditionType =
                goodQuantity > 0 && damagedQuantity > 0 ? 'MIXED' :
                damagedQuantity > 0 ? 'DAMAGED' :
                'GOOD';

            if (damagedQuantity > 0 && !String(rawLine.damageReason || '').trim()) {
                return res.status(400).json({ message: `Damage reason is required for ${eligible.item?.name || 'damaged return lines'}.` });
            }

            eligible.dispatchIds.forEach((dispatchId) => sourceDispatchIds.add(dispatchId));

            sanitizedLines.push({
                itemId,
                dispatchLineRefs: eligible.dispatchLineRefs,
                issuedQuantity: Number(eligible.issuedQuantity || 0),
                maxReturnableQuantity: Number(eligible.maxReturnableQuantity || 0),
                goodQuantity,
                damagedQuantity,
                conditionType,
                damageReason: String(rawLine.damageReason || '').trim() || null,
                responsibleTeam: String(rawLine.responsibleTeam || '').trim() || null,
                responsibleUserId: rawLine.responsibleUserId || null,
                remarks: String(rawLine.remarks || '').trim() || null
            });
        }

        const count = await ProjectReturnBatch.countDocuments();
        const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
        const returnNumber = `PRT-${stamp}-${String(count + 1).padStart(4, '0')}`;

        const batch = await ProjectReturnBatch.create({
            returnNumber,
            projectId,
            destinationLocationId,
            submittedById: req.user._id,
            sourceDispatchIds: [...sourceDispatchIds],
            overallRemarks: String(overallRemarks || '').trim() || null,
            status: 'SUBMITTED',
            submittedAt: new Date(),
            lines: sanitizedLines
        });

        await logAudit('ProjectReturnBatch', batch._id, 'CREATE', null, batch.toObject(), req, {
            returnNumber,
            remarks: 'Project return submitted'
        });
        await logInvActivity('INV_PROJECT_RETURN_SUBMITTED', `Project return ${returnNumber} submitted for ${project.name}`, req.user._id, req.user.name, batch._id, returnNumber);

        res.status(201).json({
            ...batch.toObject(),
            id: batch._id,
            project,
            destinationLocation
        });
    } catch (err) {
        console.error('Project return submit error:', err);
        res.status(400).json({ message: err.message });
    }
});

router.post('/project-returns/:id/approve', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        if (!requireAnyRole(req, res, [
            roles.STORE_MANAGER,
            roles.ADMIN,
            roles.SUPER_ADMIN,
            roles.SUPER_USER
        ])) return;

        const { reviewRemarks } = req.body;
        let resultBatch = null;

        await session.withTransaction(async () => {
            const batch = await ProjectReturnBatch.findById(req.params.id).session(session);
            if (!batch) throw new Error('Project return batch not found.');
            if (batch.status !== 'SUBMITTED') throw new Error('Only submitted project returns can be approved.');

            const latestEligible = await getProjectReturnableItems(batch.projectId);
            const eligibleMap = new Map(latestEligible.map((item) => [normalizeId(item.itemId), item]));
            const damagedHoldLocation = await getOrCreateDamagedHoldLocation(session);

            for (const line of batch.lines) {
                const eligible = eligibleMap.get(normalizeId(line.itemId));
                const requestedTotal = Number(line.goodQuantity || 0) + Number(line.damagedQuantity || 0);
                if (!eligible || requestedTotal > Number(eligible.maxReturnableQuantity || 0) + 0.0001) {
                    throw new Error('Return quantities are no longer valid against dispatched stock. Please refresh and resubmit.');
                }

                if (Number(line.goodQuantity || 0) > 0) {
                    await StockBalance.findOneAndUpdate(
                        { itemId: line.itemId, locationId: batch.destinationLocationId },
                        { $inc: { quantityOnHand: Number(line.goodQuantity || 0) } },
                        { upsert: true, new: true, setDefaultsOnInsert: true, session }
                    );

                    await StockMovement.create([{
                        itemId: line.itemId,
                        locationId: batch.destinationLocationId,
                        movementType: 'PROJECT_RETURN_GOOD',
                        quantityChange: Number(line.goodQuantity || 0),
                        referenceType: 'ProjectReturnBatch',
                        referenceId: String(batch._id),
                        remarks: line.remarks || batch.overallRemarks || `Project return ${batch.returnNumber}`,
                        createdById: req.user._id
                    }], { session });
                }

                if (Number(line.damagedQuantity || 0) > 0) {
                    await StockBalance.findOneAndUpdate(
                        { itemId: line.itemId, locationId: damagedHoldLocation._id },
                        { $inc: { quantityOnHand: Number(line.damagedQuantity || 0) } },
                        { upsert: true, new: true, setDefaultsOnInsert: true, session }
                    );

                    await StockMovement.create([{
                        itemId: line.itemId,
                        locationId: damagedHoldLocation._id,
                        movementType: 'PROJECT_RETURN_DAMAGED',
                        quantityChange: Number(line.damagedQuantity || 0),
                        referenceType: 'ProjectReturnBatch',
                        referenceId: String(batch._id),
                        remarks: line.damageReason || line.remarks || `Damaged return ${batch.returnNumber}`,
                        createdById: req.user._id
                    }], { session });
                }
            }

            const before = batch.toObject();
            batch.status = 'APPROVED';
            batch.reviewedById = req.user._id;
            batch.reviewedAt = new Date();
            batch.reviewRemarks = String(reviewRemarks || '').trim() || null;
            await batch.save({ session });
            resultBatch = batch;

            await logAudit('ProjectReturnBatch', batch._id, 'APPROVE', before, batch.toObject(), req, {
                returnNumber: batch.returnNumber,
                remarks: batch.reviewRemarks || 'Project return approved'
            });
        });

        await logInvActivity('INV_PROJECT_RETURN_APPROVED', `Project return ${resultBatch.returnNumber} approved`, req.user._id, req.user.name, resultBatch._id, resultBatch.returnNumber);
        res.json({ success: true, batch: resultBatch });
    } catch (err) {
        console.error('Project return approve error:', err);
        res.status(400).json({ message: err.message });
    } finally {
        await session.endSession();
    }
});

router.post('/project-returns/:id/reject', async (req, res) => {
    try {
        if (!requireAnyRole(req, res, [
            roles.STORE_MANAGER,
            roles.ADMIN,
            roles.SUPER_ADMIN,
            roles.SUPER_USER
        ])) return;

        const { reviewRemarks } = req.body;
        const batch = await ProjectReturnBatch.findById(req.params.id);
        if (!batch) return res.status(404).json({ message: 'Project return batch not found.' });
        if (batch.status !== 'SUBMITTED') return res.status(400).json({ message: 'Only submitted project returns can be rejected.' });

        const before = batch.toObject();
        batch.status = 'REJECTED';
        batch.reviewedById = req.user._id;
        batch.reviewedAt = new Date();
        batch.reviewRemarks = String(reviewRemarks || '').trim() || null;
        await batch.save();

        await logAudit('ProjectReturnBatch', batch._id, 'REJECT', before, batch.toObject(), req, {
            returnNumber: batch.returnNumber,
            remarks: batch.reviewRemarks || 'Project return rejected'
        });
        await logInvActivity('INV_PROJECT_RETURN_REJECTED', `Project return ${batch.returnNumber} rejected`, req.user._id, req.user.name, batch._id, batch.returnNumber);

        res.json({ success: true, batch });
    } catch (err) {
        console.error('Project return reject error:', err);
        res.status(400).json({ message: err.message });
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

router.post('/projects/material-request/:id/add-items-bulk', async (req, res) => {
    try {
        const { id } = req.params;
        const { items: newItems } = req.body;

        if (!Array.isArray(newItems) || newItems.length === 0) {
            return res.status(400).json({ message: 'No items provided for upload.' });
        }

        const request = await MaterialRequest.findById(id);
        if (!request) return res.status(404).json({ message: 'Material Request not found.' });

        if (request.status !== 'SUBMITTED') {
            return res.status(400).json({ message: 'Cannot add items to a request that has already been routed or processed.' });
        }

        const startRowNumber = request.lines.length > 0 
            ? Math.max(...request.lines.map(l => l.rowNumber || 0)) + 1 
            : 1;

        const enrichedLines = await Promise.all(newItems.map(async (line, index) => {
            let itemId = line.itemId;
            
            if (!itemId && line.itemCode) {
                const item = await Item.findOne({ itemCode: line.itemCode });
                if (item) itemId = item._id;
            }

            if (!itemId) {
                throw new Error(`Item Code "${line.itemCode || 'Unknown'}" not found in database.`);
            }

            // Check if item already exists in this MR
            const exists = request.lines.some(l => l.itemId.toString() === itemId.toString());
            if (exists) {
                 // Option: Skip or merge? User didn't specify. I'll allow duplicates as it might be for different sub-assemblies.
            }

            const stock = await StockBalance.find({ itemId });
            const totalAvailable = stock.reduce((sum, s) => sum + (s.quantityOnHand - s.reservedQuantity), 0);
            
            return {
                itemId,
                requiredQuantity: Number(line.quantity || line.requiredQuantity || 0),
                availableAtUpload: totalAvailable,
                status: 'SUBMITTED',
                rowNumber: startRowNumber + index
            };
        }));

        request.lines.push(...enrichedLines);
        await request.save();

        await logInvActivity('INV_MR_BULK_ADD', `Added ${newItems.length} items to MR ${request.requestNumber} via Excel`, req.user._id, req.user.name, request._id, request.requestNumber);
        
        res.json(request);
    } catch (err) {
        console.error('❌ [Bulk Add Items Error]:', err);
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

router.get('/bridge/material-requests/:id', async (req, res) => {
    try {
        const mr = await MaterialRequest.findById(req.params.id)
            .populate('projectId', 'name projectCode')
            .populate('engineerId', 'name')
            .populate('lines.itemId');
        
        if (!mr) return res.status(404).json({ message: 'Request not found' });

        // Deep lifecycle lookup for each line
        const enrichedLines = await Promise.all(mr.lines.map(async (line) => {
            const lineObj = line.toObject();
            lineObj.lifecycle = { status: line.status, details: null };

            if (line.status === 'ROUTED_TO_PURCHASE') {
                // Find associated PO
                const po = await PurchaseOrder.findOne({
                    'lines.sourceLines.purchaseRequestLineId': { $exists: true },
                    'lines.itemId': line.itemId?._id
                }).select('poNumber status expectedDeliveryDate');

                // Cross-check with PR Batch to be sure
                const prBatch = await PurchaseRequestBatch.findOne({ 'lines.materialRequestLineId': line._id });
                
                if (po) {
                    lineObj.lifecycle.details = {
                        type: 'PURCHASE',
                        poNumber: po.poNumber,
                        poStatus: po.status,
                        expectedDate: po.expectedDeliveryDate,
                        label: po.status === 'PLACED' ? `PO Placed (${po.poNumber})` : 
                               po.status === 'RECEIVED' ? `Received via ${po.poNumber}` : `PO Drafted (${po.poNumber})`
                    };
                } else if (prBatch) {
                    lineObj.lifecycle.details = {
                        type: 'PURCHASE',
                        label: 'Waiting for Purchase Order'
                    };
                }
            } else if (line.status === 'ROUTED_TO_STORE') {
                const storeBatch = await StoreRequestBatch.findOne({ 'lines.materialRequestLineId': line._id });
                const dispatch = await DispatchBatch.findOne({ 'storeRequestId': storeBatch?._id });

                if (dispatch) {
                    lineObj.lifecycle.details = {
                        type: 'STORE',
                        dispatchNumber: dispatch.dispatchNumber,
                        dispatchStatus: dispatch.status,
                        label: dispatch.status === 'ACKNOWLEDGED' ? 'Received at Site' : 'Dispatched to Site'
                    };
                } else if (storeBatch) {
                    lineObj.lifecycle.details = {
                        type: 'STORE',
                        label: storeBatch.status === 'CONFIRMED' ? 'Confirmed (Ready to Dispatch)' : 'Waiting for Store Confirmation'
                    };
                }
            }

            return lineObj;
        }));

        res.json({
            ...mr.toObject(),
            lines: enrichedLines,
            id: mr._id
        });
    } catch (err) {
        console.error('MR Details Error:', err);
        res.status(500).json({ message: err.message });
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

router.get('/purchase/orders/:id/pdf', async (req, res) => {
    try {
        const order = await PurchaseOrder.findById(req.params.id)
            .populate('vendorId')
            .populate('lines.itemId');

        if (!order) return res.status(404).json({ message: 'Purchase Order not found.' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=PO_${order.poNumber}.pdf`);

        generatePurchaseOrderPdf(order, res);
    } catch (err) {
        console.error('PDF Generation Error:', err);
        res.status(500).json({ message: 'Error generating PDF report.' });
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
