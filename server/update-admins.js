require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const adminAccounts = [
    {
        name: 'Admin',
        email: 'admin@enarxi.local',
        employeeId: 'admin',
        role: 'SUPER_ADMIN',
        password: 'admin123'
    },
    {
        name: 'Ayaz',
        email: 'ayaz@enarxi.com',
        employeeId: 'EMP-ADMIN-AYAZ',
        role: 'SUPER_ADMIN',
        password: 'Enarxi12345@'
    },
    {
        name: 'Info',
        email: 'info@enarxi.com',
        employeeId: 'EMP-ADMIN-INFO',
        role: 'SUPER_ADMIN',
        password: 'Enarxi12345@'
    },
    {
        name: 'Syed',
        email: 'syed@enarxi.com',
        employeeId: 'EMP-ADMIN-SYED',
        role: 'SUPER_ADMIN',
        password: 'Enarxi12345@'
    }
];

async function syncAdminAccount(account) {
    const passwordHash = bcrypt.hashSync(account.password, 10);
    const query = {
        $or: [
            { email: account.email.toLowerCase() },
            { employeeId: account.employeeId }
        ]
    };

    const update = {
        $set: {
            name: account.name,
            email: account.email.toLowerCase(),
            employeeId: account.employeeId,
            role: account.role,
            passwordHash
        }
    };

    const existing = await User.findOne(query);
    if (existing) {
        await User.updateOne({ _id: existing._id }, update);
        console.log(`Updated ${account.employeeId} (${account.email}) to ${account.role}`);
        return;
    }

    await User.create({
        name: account.name,
        email: account.email.toLowerCase(),
        employeeId: account.employeeId,
        role: account.role,
        passwordHash
    });
    console.log(`Created ${account.employeeId} (${account.email}) with configured password`);
}

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    for (const account of adminAccounts) {
        await syncAdminAccount(account);
    }
    process.exit(0);
}).catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
});
