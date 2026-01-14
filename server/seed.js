const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fix for Atlas SRV lookup
require('dotenv').config(); // Load env vars FIRST
const mongoose = require('mongoose');
const { User, Project, Task, Activity, Notification } = require('./models');
const connectDB = require('./db');

const seedData = async () => {
    try {
        console.log('Connecting to database...');
        await connectDB();

        console.log('Clearing existing data...');
        await User.deleteMany({});
        await Project.deleteMany({});
        await Task.deleteMany({});
        await Activity.deleteMany({});
        await Notification.deleteMany({});

        console.log('Creating Super User only...');
        const bcrypt = require('bcryptjs');
        const passwordHash = bcrypt.hashSync('password123', 10);

        const users = [
            {
                name: 'Super User',
                email: 'super@enarxi.com',
                employeeId: 'EMP-001',
                passwordHash,
                role: 'SUPER_USER',
                department: null
            }
        ];

        await User.insertMany(users);
        console.log('✅ Super User created successfully!');
        console.log('Credentials:');
        console.log('- Super User: EMP-001 (Password: password123)');

        console.log('✅ Seeding complete (Clean Slate)!');
        process.exit();
    } catch (err) {
        console.error('❌ Error seeding data:', err);
        process.exit(1);
    }
};

seedData();
