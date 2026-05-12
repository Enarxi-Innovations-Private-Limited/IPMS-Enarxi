const mongoose = require('mongoose');
require('dotenv').config({path:'../.env'});
const { StockBalance, Item, StockLocation, StockMovement } = require('./models/Inventory');

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const item = await Item.findOne({ itemCode: 'COMP-000001' });
    if (!item) {
        console.log('Item not found');
        process.exit();
    }
    
    const balances = await StockBalance.find({ itemId: item._id }).populate('locationId');
    console.log('--- Stock Balances ---');
    balances.forEach(b => {
        console.log(`Location: ${b.locationId?.name} (${b.locationId?.locationCode}), Qty: ${b.quantityOnHand}`);
    });
    
    const movements = await StockMovement.find({ itemId: item._id }).sort({ createdAt: -1 }).limit(5);
    console.log('\n--- Recent Movements ---');
    movements.forEach(m => {
        console.log(`${m.createdAt.toISOString()} - ${m.movementType}: ${m.quantityChange} (${m.remarks})`);
    });
    
    mongoose.connection.close();
}
check();
