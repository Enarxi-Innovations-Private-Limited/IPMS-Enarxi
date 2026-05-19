const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const pathModule = require('path');
require('dotenv').config({ path: pathModule.resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const connectDB = require('./db');

const DB_NAME = 'IPMSENARXI';
const REQUIRED_CONFIRMATION = 'CLEAR_INVENTORY';
const INVENTORY_COLLECTIONS = [
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
    'auditlogs',
    'activities',
    'notifications'
];

function parseArgs(argv) {
    const parsed = {
        confirm: '',
        dryRun: false,
        allowProduction: false
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            parsed.dryRun = true;
            continue;
        }
        if (arg === '--allow-production') {
            parsed.allowProduction = true;
            continue;
        }
        if (arg === '--confirm') {
            parsed.confirm = argv[i + 1] || '';
            i += 1;
        }
    }

    return parsed;
}

function printUsage() {
    console.log('Usage:');
    console.log(`  node server/clear_inventory_db.js --confirm ${REQUIRED_CONFIRMATION}`);
    console.log('  node server/clear_inventory_db.js --dry-run');
    console.log(`  node server/clear_inventory_db.js --confirm ${REQUIRED_CONFIRMATION} --allow-production`);
}

async function closeConnection() {
    try {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
    } catch (_) {
        // noop
    }
}

async function clearInventoryDB(options = {}) {
    const { confirm = '', dryRun = false, allowProduction = false } = options;
    const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase();

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI is required.');
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (nodeEnv === 'production' && !allowProduction) {
        console.error('Refusing to clear inventory in production without --allow-production.');
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (!dryRun && confirm !== REQUIRED_CONFIRMATION) {
        console.error(`Refusing to run without explicit confirmation: --confirm ${REQUIRED_CONFIRMATION}`);
        printUsage();
        process.exitCode = 1;
        return;
    }

    try {
        console.log('Connecting to MongoDB...');
        await connectDB();
        console.log('Connected.\n');
        console.log(`Target database: ${mongoose.connection.name || DB_NAME}`);
        console.log(`Mode: ${dryRun ? 'DRY RUN' : 'DELETE'}`);
        console.log('Inventory collections targeted:');
        INVENTORY_COLLECTIONS.forEach((name) => console.log(`- ${name}`));
        console.log('');

        let totalDocuments = 0;
        let clearedCollections = 0;

        for (const collectionName of INVENTORY_COLLECTIONS) {
            const collection = mongoose.connection.collection(collectionName);
            const count = await collection.countDocuments();
            totalDocuments += count;

            if (dryRun) {
                console.log(`[DRY RUN] ${collectionName}: ${count} document(s)`);
                continue;
            }

            if (count === 0) {
                console.log(`${collectionName}: already empty`);
                continue;
            }

            const result = await collection.deleteMany({});
            clearedCollections += 1;
            console.log(`${collectionName}: deleted ${result.deletedCount} document(s)`);
        }

        console.log('');
        if (dryRun) {
            console.log(`Dry run complete. ${INVENTORY_COLLECTIONS.length} collection(s) inspected, ${totalDocuments} total document(s) would be removed.`);
        } else {
            console.log(`Inventory wipe complete. ${clearedCollections} collection(s) changed, ${totalDocuments} total document(s) removed.`);
        }

        process.exitCode = 0;
    } catch (err) {
        console.error('Error clearing inventory database:', err);
        process.exitCode = 1;
    } finally {
        await closeConnection();
    }
}

if (require.main === module) {
    clearInventoryDB(parseArgs(process.argv.slice(2)));
}

module.exports = {
    clearInventoryDB,
    parseArgs,
    INVENTORY_COLLECTIONS,
    REQUIRED_CONFIRMATION
};
