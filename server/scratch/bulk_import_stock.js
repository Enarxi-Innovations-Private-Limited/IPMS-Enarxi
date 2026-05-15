const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fix for Atlas SRV lookup
const mongoose = require('mongoose');
const path = require('path');
// Load environment variables from the root .env file
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { Vendor, StockLocation, Item, Classification, StockBalance, StockMovement, ItemVendorSku } = require('../models');

const STOCK_DATA = [
    { name: '10K Resistor', code: 'RES-10K', cat: 'Resistor', robu: 'R249581', sharvi: 'ST2009SD0393', ktron: 'KSTR2051', evelta: '039-RC0603FR-0710KL' },
    { name: '1K Resistor', code: 'RES-1K', cat: 'Resistor', robu: '1415732', sharvi: 'ST2103SD1187', ktron: 'KSTR0854', evelta: '039-RC0603FR-071KL' },
    { name: '100K Resistor', code: 'RES-100K', cat: 'Resistor', robu: 'R246707', sharvi: 'ST2009SD0392', ktron: 'KSTR1149', evelta: '039-RC0603FR-07100KL' },
    { name: '4.7K Resistor', code: 'RES-4.7K', cat: 'Resistor', robu: 'R247702', sharvi: 'ST2009SD0415', ktron: 'KSTR0855', evelta: '109-0603WAF4701T5E' },
    { name: '0.1UF Capacitor', code: 'CAP-0.1UF', cat: 'Capacitor', robu: 'R144168', sharvi: 'ST2009SD0709', ktron: 'KSTC1342', evelta: '039-CC0603KRX7R6BB104' },
    { name: '1UF Capacitor', code: 'CAP-1UF', cat: 'Capacitor', robu: 'R256887', sharvi: 'ST2103SD2092', ktron: 'KSTC1342', evelta: '110-CL10B105KP8NNNC' },
    { name: 'AMS1117 3.3V', code: 'IC-AMS1117', cat: 'IC', robu: 'R207436', sharvi: 'ST2009SD0350', ktron: 'KSTI0045', evelta: '482-AMS1117-3.3' },
    { name: 'LM2596 Regulator', code: 'IC-LM2596', cat: 'IC', robu: 'R234214', sharvi: 'ST2103SD2670', ktron: 'KSTI1014', evelta: '052-LM2596R-12' },
    { name: 'STM32F401RBT6', code: 'MCU-STM32', cat: 'Microcontroller', robu: 'R180219', sharvi: 'ST2103SD2522', ktron: 'KSTI1146', evelta: '-' },
    { name: 'ESP-WROOM-32', code: 'MODULE-ESP32', cat: 'Wireless', robu: '29782', sharvi: 'ST2103SD2370', ktron: 'KSTI2085', evelta: '136-ESP32-S3-WROOM-1-N4' },
    { name: 'SI2302 NMOSFET', code: 'FET-SI2302', cat: 'Transistor', robu: 'R248763', sharvi: 'ST2009SD0540', ktron: 'KSTM1026', evelta: '037-SI2304DDS-T1-GE3' }
];

async function migrate() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI not found in root .env file.');

        console.log('📡 Connecting to Live MongoDB Atlas...');
        await mongoose.connect(uri, {
            dbName: 'IPMSENARXI',
            family: 4
        });
        console.log(`✅ Connected to Database: ${mongoose.connection.name}`);

        // 1. Get or Create Vendors
        const vendorNames = ['Robu', 'Sharvi', 'Ktron', 'Evelta'];
        const vendorMap = {};
        for (const vName of vendorNames) {
            let v = await Vendor.findOne({ name: vName });
            if (!v) {
                v = await Vendor.create({ name: vName, vendorCode: `ENX-VEN-${vName.toUpperCase()}` });
            }
            vendorMap[vName] = v._id;
        }

        // 2. Get Main Location
        let loc = await StockLocation.findOne({ locationCode: 'MWH-01' });
        if (!loc) {
            loc = await StockLocation.create({ locationCode: 'MWH-01', name: 'Main Warehouse', label: 'Main Warehouse' });
        }

        for (const entry of STOCK_DATA) {
            // Create/Find Classification
            let classif = await Classification.findOne({ name: entry.cat });
            if (!classif) {
                classif = await Classification.create({ name: entry.cat, prefix: entry.cat.substring(0, 3).toUpperCase() });
            }

            // Create Item
            const item = await Item.findOneAndUpdate(
                { itemCode: entry.code },
                { 
                    name: entry.name, 
                    classificationId: classif._id,
                    uom: 'Nos',
                    package: 'Standard'
                },
                { upsert: true, new: true }
            );

            // Create SKU Mappings
            if (entry.robu !== '-') await ItemVendorSku.findOneAndUpdate({ itemId: item._id, vendorId: vendorMap['Robu'] }, { sku: entry.robu }, { upsert: true });
            if (entry.sharvi !== '-') await ItemVendorSku.findOneAndUpdate({ itemId: item._id, vendorId: vendorMap['Sharvi'] }, { sku: entry.sharvi }, { upsert: true });
            if (entry.ktron !== '-') await ItemVendorSku.findOneAndUpdate({ itemId: item._id, vendorId: vendorMap['Ktron'] }, { sku: entry.ktron }, { upsert: true });
            if (entry.evelta !== '-') await ItemVendorSku.findOneAndUpdate({ itemId: item._id, vendorId: vendorMap['Evelta'] }, { sku: entry.evelta }, { upsert: true });

            // INJECT RANDOM STOCK
            const randomQty = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
            
            // Update Balance
            await StockBalance.findOneAndUpdate(
                { itemId: item._id, locationId: loc._id },
                { $inc: { quantityOnHand: randomQty } },
                { upsert: true }
            );

            // Log Movement
            await StockMovement.create({
                itemId: item._id,
                locationId: loc._id,
                movementType: 'MANUAL_ADDITION',
                quantityChange: randomQty,
                referenceType: 'INITIAL_IMPORT',
                referenceId: 'PDF_SEED_CLOUD',
                remarks: 'Initial stock injection to Cloud DB',
                date: new Date()
            });

            console.log(`✅ Cloud Processed: ${entry.name} | Injected: ${randomQty} units`);
        }

        console.log('\n🚀 LIVE Cloud Import & Stock Injection Complete.');
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Cloud Migration Error:', err);
        process.exit(1);
    }
}

migrate();
