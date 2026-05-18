const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const pathModule = require('path');
require('dotenv').config({ path: pathModule.resolve(__dirname, '../.env'), override: true });

const mongoose = require('mongoose');
const connectDB = require('./db');

const clearInventoryDB = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await connectDB();
        console.log('Connected.\n');

        const collectionsToClear = [
            'classifications',
            'vendors',
            'itemvendorskus',
            'items',
            'stocklocations',
            'stockbalances',
            'stockmovements',
            'materialrequests',
            'storerequestbatches',
            'dispatchbatches',
            'purchaserequestbatches',
            'purchaseplanlines',
            'purchaseorders',
            'purchaseorderlineallocations',
            'purchaseinwardbatches',
            'projectreturnbatches',
            'stockadjustmentbatches',
            'auditlogs'
        ];

        console.log('Clearing inventory collections...');

        for (const colName of collectionsToClear) {
            const collection = mongoose.connection.collection(colName);
            const count = await collection.countDocuments();
            if (count > 0) {
                await collection.deleteMany({});
                console.log(`Cleared ${count} documents from "${colName}"`);
            } else {
                console.log(`Collection "${colName}" is already empty`);
            }
        }

        console.log('\nInventory database cleared successfully.');
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error clearing database:', err);
        try {
            await mongoose.connection.close();
        } catch (_) {
            // noop
        }
        process.exit(1);
    }
};

clearInventoryDB();
