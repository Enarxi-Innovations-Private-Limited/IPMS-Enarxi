const path = require('path');
const readline = require('readline');

// Import from server/node_modules since dependencies are there
const mongoose = require('../server/node_modules/mongoose');
const dotenv = require('../server/node_modules/dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../server/.env') });

// Import Models
// Adjust paths based on your actual structure
const Product = require('../server/models/Product');
const IssuedItem = require('../server/models/IssuedItem');
const Supplier = require('../server/models/Supplier');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const clearData = async () => {
    try {
        console.log('Connecting to database...');
        // Handle Mongoose connection based on your version
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const productCount = await Product.countDocuments();
        const issuedCount = await IssuedItem.countDocuments();
        const supplierCount = await Supplier.countDocuments();

        console.log('\n⚠️  WARNING: This will PERMANENTLY DELETE:');
        console.log(`- ${productCount} Products`);
        console.log(`- ${issuedCount} Issued Item Records`);
        console.log(`- ${supplierCount} Suppliers`);

        rl.question('\nAre you sure you want to proceed? Type "DELETE" to confirm: ', async (answer) => {
            if (answer === 'DELETE') {
                console.log('\n🗑️  Deleting data...');

                await Product.deleteMany({});
                console.log('✅ All Products deleted');

                await IssuedItem.deleteMany({});
                console.log('✅ All Issued Items deleted');

                // Check if Supplier model exists/is imported correctly before deleting
                if (Supplier) {
                    await Supplier.deleteMany({});
                    console.log('✅ All Suppliers deleted');
                }

                console.log('\n✨ Stock data cleared successfully. You can now start fresh.');
            } else {
                console.log('\n❌ Operation cancelled.');
            }

            await mongoose.disconnect();
            rl.close();
            process.exit(0);
        });

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
};

clearData();
