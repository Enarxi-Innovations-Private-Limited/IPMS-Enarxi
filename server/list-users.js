const mongoose = require('mongoose');
const pathModule = require('path');
require('dotenv').config({ path: pathModule.resolve(__dirname, '../.env'), override: true });
const { User } = require('./models');

const listUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName: 'IPMSENARXI' });
        const users = await User.find({}).select('name email employeeId role department');
        console.log('=== USERS ===');
        console.log(JSON.stringify(users, null, 2));
        await mongoose.connection.close();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

listUsers();
