const pathModule = require('path');
require('dotenv').config({ path: pathModule.resolve(__dirname, '../.env'), override: true });
const mongoose = require('mongoose');
const connectDB = require('./db');
const { User } = require('./models');

(async () => {
    await connectDB();
    
    // Mimic the SUPER_ADMIN query
    const query = { role: { $in: ['ENGINEER', 'MANAGER', 'JUNIOR_ENGINEER', 'EMPLOYEE', 'INTERN', 'STOCK_ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER'] } };
    
    console.log(`\nExecuting query for SUPER_ADMIN:`, JSON.stringify(query));
    const users = await User.find(query).select('-passwordHash');
    
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
        console.log(`  • ${u.name} | role: "${u.role}" | dept: "${u.department}"`);
    });

    // Also let's print ALL users to see who the Super Admin is
    console.log(`\nAll users in DB:`);
    const allUsers = await User.find({});
    allUsers.forEach(u => {
        console.log(`  • ${u.name} | role: "${u.role}"`);
    });

    mongoose.connection.close();
})();
