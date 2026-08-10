const mongoose = require('mongoose');
const { StockBalance, StoreRequestBatch } = require('../server/models');
const dotenv = require('dotenv');
dotenv.config();

const mongoUri = process.env.MONGODB_URI;

async function repairInventoryState() {
    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to Database.');

        const batches = await StoreRequestBatch.find({ status: { $ne: 'DISPATCHED' } });
        console.log(`Found ${batches.length} active batches.`);

        for (const batch of batches) {
            console.log(`Checking Batch: ${batch.batchNumber} (${batch.status})`);
            
            for (const line of batch.lines) {
                if (line.status === 'SHORTAGE_REPORTED') {
                    console.log(`  ! Line ${line._id} (Item: ${line.itemId}) has SHORTAGE_REPORTED.`);
                    console.log(`    Resetting line status to PENDING to allow re-confirmation...`);
                    
                    line.status = 'PENDING';
                    line.confirmedQuantity = 0;
                    line.pendingQuantity = 0; // Will be set during confirmation
                }
            }
            
            // If any lines were reset, the batch status should probably go back to PENDING or stay SHORTAGE_REPORTED
            const hasPending = batch.lines.some(l => l.status === 'PENDING');
            if (hasPending) {
                batch.status = 'PENDING';
            }
            await batch.save();
        }

        console.log('\n--- SUCCESS ---');
        console.log('Stuck shortage lines have been reset to PENDING.');
        console.log('You can now go to the Store Requests page and "Confirm" the items correctly.');
        console.log('The new logic will handle the reservations properly.');
        
        process.exit(0);
    } catch (err) {
        console.error('Repair Error:', err);
        process.exit(1);
    }
}

repairInventoryState();
