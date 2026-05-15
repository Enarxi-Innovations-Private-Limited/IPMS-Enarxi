const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const mongoose = require('mongoose');
const connectDB = require('./db');

const {
    MaterialRequest, StoreRequestBatch, DispatchBatch, PurchaseRequestBatch,
    PurchasePlanLine, PurchaseOrder, PurchaseOrderLineAllocation,
    PurchaseInwardBatch, ProjectReturnBatch, StockAdjustmentBatch,
    Activity, Notification, StockMovement, StockBalance, Task, AuditLog
} = require('./models');

async function clearTransactionData() {
    try {
        console.log('Connecting to MongoDB...');
        await connectDB();
        console.log('Connected successfully.\n');

        const collectionsToClear = [
            { model: MaterialRequest, name: 'Material Requests' },
            { model: StoreRequestBatch, name: 'Store Request Batches' },
            { model: DispatchBatch, name: 'Dispatch Batches' },
            { model: PurchaseRequestBatch, name: 'Purchase Request Batches' },
            { model: PurchasePlanLine, name: 'Purchase Plan Lines' },
            { model: PurchaseOrder, name: 'Purchase Orders' },
            { model: PurchaseOrderLineAllocation, name: 'PO Line Allocations' },
            { model: PurchaseInwardBatch, name: 'Purchase Inward Batches' },
            { model: ProjectReturnBatch, name: 'Project Return Batches' },
            { model: StockAdjustmentBatch, name: 'Stock Adjustment Batches' },
            { model: StockMovement, name: 'Stock Movements' },
            { model: StockBalance, name: 'Stock Balances (resets stock to 0)' },
            { model: Activity, name: 'Activities' },
            { model: Notification, name: 'Notifications' },
            { model: Task, name: 'Tasks' },
            { model: AuditLog, name: 'Audit Logs' }
        ];

        console.log('Starting database purge (transactional data only)...\n');

        for (const item of collectionsToClear) {
            const count = await item.model.countDocuments();
            if (count > 0) {
                console.log(`Clearing ${count} ${item.name}...`);
                await item.model.deleteMany({});
                console.log(`${item.name} cleared.`);
            } else {
                console.log(`No ${item.name} to clear.`);
            }
        }

        console.log('\nDatabase cleanup complete. Master data remains intact.');
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('ERROR DURING CLEANUP:', err);
        try {
            await mongoose.connection.close();
        } catch (_) {
            // noop
        }
        process.exit(1);
    }
}

clearTransactionData();
