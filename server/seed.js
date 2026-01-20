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

        console.log('Creating users...');
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
            },
            {
                name: 'Manager User',
                email: 'manager@enarxi.com',
                employeeId: 'EMP-002',
                passwordHash,
                role: 'MANAGER',
                department: 'SOFTWARE'
            },
            {
                name: 'Intern User',
                email: 'intern@enarxi.com',
                employeeId: 'EMP-003',
                passwordHash,
                role: 'INTERN',
                department: 'HARDWARE'
            },
            {
                name: 'Employee User',
                email: 'employee@enarxi.com',
                employeeId: 'EMP-004',
                passwordHash,
                role: 'EMPLOYEE',
                department: 'SOFTWARE'
            },
            {
                name: 'Stock Admin',
                email: 'stock@enarxi.com',
                employeeId: 'EMP-005',
                passwordHash,
                role: 'STOCK_ADMIN',
                department: null
            }
        ];

        await User.insertMany(users);
        console.log('✅ Users created successfully!');
        console.log('Credentials (All use password: password123):');
        console.log('- Super User:  EMP-001');
        console.log('- Manager:     EMP-002 (SOFTWARE)');
        console.log('- Intern:      EMP-003 (HARDWARE)');
        console.log('- Employee:    EMP-004 (SOFTWARE)');
        console.log('- Stock Admin: EMP-005');

        console.log('✅ Seeding complete (Clean Slate)!');
        process.exit();
    } catch (err) {
        console.error('❌ Error seeding data:', err);
        process.exit(1);
    }
};

seedData();
