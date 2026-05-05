const express = require('express');
const router = express.Router();
const { 
    Classification, Vendor, Item, StockLocation, StockBalance, StockMovement, 
    MaterialRequest, StoreRequestBatch, PurchaseRequestBatch, PurchaseOrder, 
    PurchaseInwardBatch, Activity 
} = require('./models');

// Helper to log inventory activity
const logInvActivity = async (type, message, userId, userName, targetId, targetName) => {
    try {
        await Activity.create({ type, message, userId, userName, targetId, targetName });
    } catch (err) {
        console.error('Failed to log inventory activity:', err);
    }
};

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
        const classification = await Classification.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Classification ${classification.name} created`, req.user._id, req.user.name, classification._id, classification.name);
        res.status(201).json(classification);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/items', async (req, res) => {
    try {
        const data = await Item.find().populate('classificationId').sort({ itemCode: 1 });
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/createItem', async (req, res) => {
    try {
        const item = await Item.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Item ${item.name} (${item.itemCode}) created`, req.user._id, req.user.name, item._id, item.name);
        res.status(201).json(item);
    } catch (err) {
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
        const vendor = await Vendor.create(req.body);
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
        const location = await StockLocation.create(req.body);
        await logInvActivity('INV_MASTER_CREATE', `Location ${location.name} created`, req.user._id, req.user.name, location._id, location.name);
        res.status(201).json(location);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// --- Stock Overview ---

router.get('/stock/current', async (req, res) => {
    try {
        const balances = await StockBalance.find()
            .populate('itemId')
            .populate('locationId');
        
        // Group by item for the overview
        const overview = {};
        balances.forEach(b => {
            if (!b.itemId) return;
            const id = b.itemId._id.toString();
            if (!overview[id]) {
                overview[id] = {
                    item: b.itemId,
                    totalOnHand: 0,
                    totalReserved: 0,
                    locations: []
                };
            }
            overview[id].totalOnHand += b.quantityOnHand;
            overview[id].totalReserved += b.reservedQuantity;
            overview[id].locations.push({
                location: b.locationId,
                onHand: b.quantityOnHand,
                reserved: b.reservedQuantity
            });
        });

        res.json(Object.values(overview));
    } catch (err) {
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
        const { projectId, notes, lines } = req.body;
        
        if (!projectId || !lines || !lines.length) {
            return res.status(400).json({ message: 'Project and lines are required' });
        }

        const requestNumber = await getNextMRNumber();
        
        // Enrich lines with current availability
        const enrichedLines = await Promise.all(lines.map(async (line, index) => {
            const stock = await StockBalance.find({ itemId: line.itemId });
            const totalAvailable = stock.reduce((sum, s) => sum + (s.quantityOnHand - s.reservedQuantity), 0);
            return {
                ...line,
                availableAtUpload: totalAvailable,
                status: 'SUBMITTED',
                rowNumber: index + 1
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
        res.status(400).json({ message: err.message });
    }
});

router.post('/routeMaterialRequestLine', async (req, res) => {
    try {
        const { lineId, plannedStoreQuantity, plannedPurchaseQuantity, adminRemarks } = req.body;
        
        // Find the MR containing this line
        const request = await MaterialRequest.findOne({ "lines._id": lineId });
        if (!request) return res.status(404).json({ message: 'Line not found' });

        const line = request.lines.id(lineId);
        const totalPlanned = Number(plannedStoreQuantity) + Number(plannedPurchaseQuantity);

        if (totalPlanned > line.requiredQuantity) {
            return res.status(400).json({ message: 'Planned quantity exceeds required quantity' });
        }

        line.plannedStoreQuantity = plannedStoreQuantity;
        line.plannedPurchaseQuantity = plannedPurchaseQuantity;
        line.adminRemarks = adminRemarks;
        line.status = plannedStoreQuantity > 0 && plannedPurchaseQuantity > 0 
            ? 'PARTIALLY_ROUTED' 
            : plannedStoreQuantity > 0 
                ? 'ROUTED_TO_STORE' 
                : 'ROUTED_TO_PURCHASE';

        // Check if all lines are routed to update main MR status
        const allRouted = request.lines.every(l => l.status !== 'SUBMITTED');
        if (allRouted) request.status = 'ROUTED';

        await request.save();

        // If routed to store, create/update StoreRequestBatch
        if (plannedStoreQuantity > 0) {
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
                materialRequestLineId: lineId,
                itemId: line.itemId,
                requestedQuantity: plannedStoreQuantity,
                pendingQuantity: plannedStoreQuantity
            });
            await storeBatch.save();
        }

        // If routed to purchase, create/update PurchaseRequestBatch
        if (plannedPurchaseQuantity > 0) {
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
                materialRequestLineId: lineId,
                itemId: line.itemId,
                requiredQuantity: plannedPurchaseQuantity,
                pendingQuantity: plannedPurchaseQuantity
            });
            await purchaseBatch.save();
        }

        await logInvActivity('INV_MR_ROUTE', `Line ${line.rowNumber} of MR ${request.requestNumber} routed`, req.user._id, req.user.name, request._id, request.requestNumber);

        res.json(request);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/routeMaterialRequestBulk', async (req, res) => {
    try {
        const { requestId, routeTarget, lineId: lineIds } = req.body;
        const request = await MaterialRequest.findById(requestId);
        if (!request) return res.status(404).json({ message: 'Request not found' });

        const ids = Array.isArray(lineIds) ? lineIds : [lineIds];

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
        const requests = await PurchaseRequestBatch.find({ status: 'PENDING' })
            .populate('materialRequestId', 'requestNumber project')
            .populate('lines.itemId');
        
        // Flatten lines for the UI
        const flattened = [];
        requests.forEach(batch => {
            batch.lines.forEach(line => {
                if (line.pendingQuantity > 0) {
                    flattened.push({
                        ...line.toObject(),
                        batch: {
                            id: batch._id,
                            materialRequest: batch.materialRequestId
                        }
                    });
                }
            });
        });
        res.json(flattened);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/generatePurchaseOrders', async (req, res) => {
    try {
        const { payload, notes } = req.body;
        const items = JSON.parse(payload);
        
        // Group items by vendor
        const vendorGroups = {};
        items.forEach(item => {
            if (!vendorGroups[item.vendorId]) vendorGroups[item.vendorId] = [];
            vendorGroups[item.vendorId].push(item);
        });

        const results = [];

        for (const [vendorId, lines] of Object.entries(vendorGroups)) {
            const poCount = await PurchaseOrder.countDocuments();
            const poNumber = `PO-${new Date().getFullYear()}-${(poCount + 1).toString().padStart(4, '0')}`;
            
            const poLines = lines.map(l => ({
                itemId: l.itemId,
                sku: l.sku,
                requestedQuantity: l.requestedQuantity,
                orderQuantity: l.orderQuantity,
                rate: l.rate,
                gstPercent: l.gstPercent || 18,
                lineTotal: l.orderQuantity * l.rate * (1 + (l.gstPercent || 18) / 100),
                sourceLines: l.sourceLineIds.map(id => ({ purchaseRequestLineId: id, quantity: l.orderQuantity }))
            }));

            const po = await PurchaseOrder.create({
                poNumber,
                vendorId,
                status: 'DRAFT',
                createdById: req.user._id,
                notes,
                lines: poLines
            });

            // Update PurchaseRequestBatch lines
            for (const line of lines) {
                for (const srId of line.sourceLineIds) {
                    await PurchaseRequestBatch.updateOne(
                        { "lines._id": srId },
                        { $inc: { "lines.$.pendingQuantity": -line.orderQuantity } }
                    );
                }
            }

            results.push(po);
            await logInvActivity('INV_PO_CREATE', `Purchase Order ${poNumber} created as DRAFT`, req.user._id, req.user.name, po._id, poNumber);
        }

        res.status(201).json(results);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/purchase/orders', async (req, res) => {
    try {
        const orders = await PurchaseOrder.find()
            .populate('vendorId', 'name vendorCode')
            .populate('createdById', 'name')
            .sort({ createdAt: -1 });
        
        // Map vendorId to vendor for frontend compatibility
        const mapped = orders.map(o => ({
            ...o.toObject(),
            vendor: o.vendorId,
            id: o._id
        }));
        res.json(mapped);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/reviewPurchaseOrder', async (req, res) => {
    try {
        const { purchaseOrderId, decision, adminRemarks } = req.body;
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) return res.status(404).json({ message: 'PO not found' });

        po.status = decision;
        po.adminRemarks = adminRemarks;
        po.approvedById = req.user._id;
        po.approvedAt = new Date();
        await po.save();

        await logInvActivity('INV_PO_REVIEW', `Purchase Order ${po.poNumber} ${decision}`, req.user._id, req.user.name, po._id, po.poNumber);
        res.json(po);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/markPurchaseOrderPlaced', async (req, res) => {
    try {
        const { purchaseOrderId } = req.body;
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) return res.status(404).json({ message: 'PO not found' });

        po.status = 'PLACED';
        po.placedById = req.user._id;
        po.placedAt = new Date();
        await po.save();

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
    try {
        const { purchaseOrderId, locationId, documentNote, remarks, lineIds } = req.body;
        const po = await PurchaseOrder.findById(purchaseOrderId);
        if (!po) return res.status(404).json({ message: 'PO not found' });

        const inwardCount = await PurchaseInwardBatch.countDocuments();
        const inwardNumber = `GRN-${new Date().getTime()}-${inwardCount + 1}`;
        
        const inwardLines = [];

        for (const lineId of lineIds) {
            const qty = Number(req.body[`receive:${lineId}`]);
            if (qty <= 0) continue;

            const poLine = po.lines.id(lineId);
            poLine.receivedQuantity += qty;

            const serials = req.body[`serials:${lineId}`] 
                ? req.body[`serials:${lineId}`].split(',').map(s => s.trim()).filter(Boolean)
                : [];

            inwardLines.push({
                purchaseOrderLineId: lineId,
                itemId: poLine.itemId,
                locationId,
                receivedQuantity: qty,
                serials
            });

            // Update Stock Balance
            await StockBalance.findOneAndUpdate(
                { itemId: poLine.itemId, locationId },
                { $inc: { quantityOnHand: qty } },
                { upsert: true, new: true }
            );

            // Record Stock Movement
            await StockMovement.create({
                itemId: poLine.itemId,
                locationId,
                movementType: 'PURCHASE_INWARD',
                quantityChange: qty,
                referenceType: 'PurchaseInward',
                referenceId: inwardNumber,
                remarks: `Received via ${po.poNumber}. ${serials.length > 0 ? 'Serials: ' + serials.join(', ') : ''}`,
                createdById: req.user._id
            });
        }

        const inward = await PurchaseInwardBatch.create({
            inwardNumber,
            purchaseOrderId,
            receivedById: req.user._id,
            documentNote,
            remarks,
            lines: inwardLines
        });

        await po.save();

        await logInvActivity('INV_INWARD', `Goods received for PO ${po.poNumber}. GRN: ${inwardNumber}`, req.user._id, req.user.name, inward._id, inwardNumber);

        res.status(201).json(inward);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.get('/store/requests', async (req, res) => {
    try {
        const batches = await StoreRequestBatch.find({ status: { $ne: 'DISPATCHED' } })
            .populate('materialRequestId', 'requestNumber project')
            .populate('lines.itemId');
        res.json(batches);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

router.post('/confirmStoreAvailability', async (req, res) => {
    try {
        const { batchId, lineIds } = req.body;
        const confirmedIds = new Set(req.body.confirmed || []);
        
        const batch = await StoreRequestBatch.findById(batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });

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

        await logInvActivity('INV_STORE_CONFIRM', `Store confirmed availability for ${batch.batchNumber}`, req.user._id, req.user.name, batch._id, batch.batchNumber);
        res.json(batch);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

router.post('/dispatchConfirmedStoreRequest', async (req, res) => {
    try {
        const { batchId, storeRemarks } = req.body;
        const batch = await StoreRequestBatch.findById(batchId);
        if (!batch) return res.status(404).json({ message: 'Batch not found' });

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

        dispatch.status = 'ACKNOWLEDGED';
        dispatch.acknowledgedById = req.user._id;
        dispatch.acknowledgedAt = new Date();
        dispatch.engineerRemarks = remarks;
        await dispatch.save();

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
            // Search by serial number in the remarks or a dedicated serial field if we add it
            // For now, search in remarks as serials are stored there in my inward logic
            query = { remarks: { $regex: param, $options: 'i' } };
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

module.exports = router;
