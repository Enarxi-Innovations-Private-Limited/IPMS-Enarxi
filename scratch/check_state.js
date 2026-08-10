const mongoose = require('mongoose');
const InventoryModels = require('./server/models/Inventory');
const dotenv = require('dotenv');
dotenv.config();

const mongoUri = process.env.MONGODB_URI;

async function checkState() {
    try {
        await mongoose.connect(mongoUri);
        const mr = await InventoryModels.MaterialRequest.findOne().sort({ createdAt: -1 });
        const batch = await InventoryModels.StoreRequestBatch.findOne({ materialRequestId: mr?._id });
        const stock = await InventoryModels.StockBalance.find().populate('itemId', 'name itemCode');
        
        console.log('--- LATEST MATERIAL REQUEST ---');
        console.log(JSON.stringify(mr, null, 2));
        
        console.log('\n--- ASSOCIATED STORE BATCH ---');
        console.log(JSON.stringify(batch, null, 2));
        
        console.log('\n--- STOCK BALANCES ---');
        console.log(JSON.stringify(stock, null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkState();
