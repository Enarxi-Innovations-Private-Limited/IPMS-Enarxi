const mongoose = require('mongoose');
const { Vendor, StockLocation } = require('../models');

async function setup() {
    try {
        // Connect to MongoDB (Standard local URI for your dev environment)
        await mongoose.connect('mongodb://localhost:27017/inventory');
        console.log('📡 Connected to MongoDB');
        
        // 1. Register Vendors from the PDF
        const vendors = [
            { name: 'Robu', vendorCode: 'ENX-VEN-ROBU', contactEmail: 'sales@robu.in' },
            { name: 'Sharvi', vendorCode: 'ENX-VEN-SHARVI', contactEmail: 'info@sharvi.in' },
            { name: 'Ktron', vendorCode: 'ENX-VEN-KTRON', contactEmail: 'support@ktron.in' },
            { name: 'Evelta', vendorCode: 'ENX-VEN-EVELTA', contactEmail: 'orders@evelta.in' }
        ];

        for (const v of vendors) {
            await Vendor.findOneAndUpdate({ name: v.name }, v, { upsert: true });
            console.log(`✅ Vendor Synchronized: ${v.name}`);
        }

        // 2. Register Main Warehouse & Bins
        const locations = [
            { locationCode: 'MWH-01', name: 'Main Warehouse', label: 'Main Warehouse', description: 'Primary storage for electronic components' },
            { locationCode: 'MWH-BIN-A1', name: 'Bin A1 (Resistors)', label: 'Bin A1', description: 'Dedicated bin for SMD resistors' },
            { locationCode: 'MWH-BIN-B1', name: 'Bin B1 (Capacitors)', label: 'Bin B1', description: 'Dedicated bin for SMD capacitors' }
        ];

        for (const loc of locations) {
            await StockLocation.findOneAndUpdate({ locationCode: loc.locationCode }, loc, { upsert: true });
            console.log(`✅ Location Synchronized: ${loc.locationCode}`);
        }

        console.log('\n🌟 Inventory Base Infrastructure Ready.');
        await mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('❌ Setup Failed:', err);
        process.exit(1);
    }
}

setup();
