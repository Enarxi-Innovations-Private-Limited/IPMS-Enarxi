const pathModule = require('path');
require('dotenv').config({ path: pathModule.resolve(__dirname, '../.env'), override: true });
const mongoose = require('mongoose');
const connectDB = require('./db');
const { User } = require('./models');

(async () => {
    await connectDB();
    const users = await User.find({}).select('name email role department employeeId');
    console.log(`\n📋 Total users: ${users.length}`);
    users.forEach(u => {
        console.log(`  • ${u.name} | role: "${u.role}" | dept: "${u.department}" | id: ${u.employeeId}`);
    });

    // Check for mixed-case roles
    const mixedCase = users.filter(u => u.role && u.role !== u.role.toUpperCase());
    if (mixedCase.length > 0) {
        console.log(`\n⚠️  Found ${mixedCase.length} user(s) with mixed-case roles — fixing...`);
        for (const u of mixedCase) {
            await User.updateOne({ _id: u._id }, { $set: { role: u.role.toUpperCase() } });
            console.log(`   ✅ Fixed: ${u.name} "${u.role}" → "${u.role.toUpperCase()}"`);
        }
    } else {
        console.log('\n✅ All roles are uppercase — no fix needed');
    }

    mongoose.connection.close();
})();
