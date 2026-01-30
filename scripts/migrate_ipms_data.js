const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fix for Atlas SRV lookup
const path = require('path');
const readline = require('readline');

// Import from server/node_modules
let mongoose, dotenv;
try {
    mongoose = require('../server/node_modules/mongoose');
    dotenv = require('../server/node_modules/dotenv');
} catch (err) {
    mongoose = require('mongoose');
    dotenv = require('dotenv');
}

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const migrateData = async () => {
    console.log('🚀 IPMS Data Migration Tool');

    const sourceUri = process.env.MONGODB_URI; // Current DB
    console.log(`Source DB (from .env): ${sourceUri}`);

    rl.question('\nEnter the TARGET MongoDB URI (Target Database): ', async (targetUri) => {
        if (!targetUri || targetUri === sourceUri) {
            console.log('❌ Invalid target URI or Target is same as Source. Operation aborted.');
            rl.close();
            return;
        }

        try {
            console.log('\n⏳ Initializing connections...');

            // Create separate connections with enforced dbName
            const sourceConn = await mongoose.createConnection(sourceUri, { dbName: 'IPMSENARXI' }).asPromise();
            const targetConn = await mongoose.createConnection(targetUri, { dbName: 'IPMSENARXI' }).asPromise();

            console.log('✅ Connected to both databases.');

            // List of Model Names and their Schemas
            const modelNames = [
                'User', 'Project', 'Task', 'Activity', 'Product', 'IssuedItem', 'Notification'
            ];

            const models = require('../server/models');

            console.log('\n📊 Migration Summary:');
            const dataToMigrate = {};

            for (const name of modelNames) {
                const SourceModel = sourceConn.model(name, models[name].schema);
                const count = await SourceModel.countDocuments();
                dataToMigrate[name] = { count, schema: models[name].schema };
                console.log(`- ${name}: ${count} records`);
            }

            rl.question('\nProceed with migration? All existing data in TARGET will be preserved, new data added. Type "MIGRATE" to confirm: ', async (answer) => {
                if (answer === 'MIGRATE') {
                    console.log('\n🚀 Starting migration...');

                    for (const name of modelNames) {
                        console.log(`\n📦 Migrating ${name}...`);
                        const SourceModel = sourceConn.model(name, dataToMigrate[name].schema);
                        const TargetModel = targetConn.model(name, dataToMigrate[name].schema);

                        const documents = await SourceModel.find({}).lean();

                        if (documents.length > 0) {
                            try {
                                await TargetModel.insertMany(documents, { ordered: false });
                                console.log(`✅ ${documents.length} records moved for ${name}`);
                            } catch (insertErr) {
                                console.log(`⚠️  Some records for ${name} were skipped (likely duplicates)`);
                            }
                        } else {
                            console.log(`ℹ️  No records found for ${name}`);
                        }
                    }

                    console.log('\n✨ MIGRATION COMPLETED SUCCESSFULLY');
                } else {
                    console.log('\n❌ Migration cancelled.');
                }

                await sourceConn.close();
                await targetConn.close();
                rl.close();
                process.exit(0);
            });

        } catch (err) {
            console.error('\n❌ Error during migration:', err);
            process.exit(1);
        }
    });
};

migrateData();
