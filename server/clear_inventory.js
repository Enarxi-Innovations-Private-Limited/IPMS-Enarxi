const mongoose = require('mongoose');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fix for Atlas SRV lookup
const dotenv = require('dotenv');
const path = require('path');

// Load env from parent directory
dotenv.config({ path: path.join(__dirname, '../.env') });

const { 
    Classification, Vendor, ItemVendorSku, Item, StockLocation, StockBalance, StockMovement, 
    MaterialRequest, StoreRequestBatch, DispatchBatch, PurchaseRequestBatch,
    PurchasePlanLine, PurchaseOrder, PurchaseOrderLineAllocation,
    PurchaseInwardBatch, StockAdjustmentBatch, AuditLog, Activity, Notification
} = require('./models');

async function clearInventory() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL, {
            family: 4,
            dbName: 'IPMSENARXI'
        });
        console.log('Connected.');

        const modelsToClear = [
            { name: 'Classification', model: Classification },
            { name: 'Vendor', model: Vendor },
            { name: 'ItemVendorSku', model: ItemVendorSku },
            { name: 'Item', model: Item },
            { name: 'StockLocation', model: StockLocation },
            { name: 'StockBalance', model: StockBalance },
            { name: 'StockMovement', model: StockMovement },
            { name: 'MaterialRequest', model: MaterialRequest },
            { name: 'StoreRequestBatch', model: StoreRequestBatch },
            { name: 'DispatchBatch', model: DispatchBatch },
            { name: 'PurchaseRequestBatch', model: PurchaseRequestBatch },
            { name: 'PurchasePlanLine', model: PurchasePlanLine },
            { name: 'PurchaseOrder', model: PurchaseOrder },
            { name: 'PurchaseOrderLineAllocation', model: PurchaseOrderLineAllocation },
            { name: 'PurchaseInwardBatch', model: PurchaseInwardBatch },
            { name: 'StockAdjustmentBatch', model: StockAdjustmentBatch },
            { name: 'AuditLog', model: AuditLog },
            { name: 'Activity', model: Activity },
            { name: 'Notification', model: Notification }
        ];

        for (const item of modelsToClear) {
            if (item.model) {
                console.log(`Clearing ${item.name}...`);
                await item.model.deleteMany({});
            }
        }

        console.log('--- Inventory Data Cleared Successfully ---');
        process.exit(0);
    } catch (err) {
        console.error('Error clearing inventory:', err);
        process.exit(1);
    }
}

clearInventory();
