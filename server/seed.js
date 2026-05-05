const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const connectDB = require('./db');
const { User } = require('./models');

const seedData = async () => {
    try {
        await connectDB();
        console.log('Connected to MongoDB...');

        // 1. Seed Admin User
        console.log('Seeding Admin User...');
        const adminData = {
            name: 'System Admin',
            email: 'admin@enarxi.in',
            employeeId: 'Admin',
            role: 'SUPER_ADMIN',
            department: 'IT'
        };

        const existingAdmin = await User.findOne({ employeeId: 'Admin' });
        if (!existingAdmin) {
            adminData.passwordHash = bcrypt.hashSync('admin123', 10);
            await User.create(adminData);
            console.log('✅ Admin user created (Admin / admin123)');
        } else {
            // Update existing admin to ensure roles and connectivity are correct
            await User.updateOne({ employeeId: 'Admin' }, { $set: adminData });
            console.log('✅ Admin user updated');
        }

        console.log('🚀 Seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
        process.exit(1);
    }
};

seedData();
