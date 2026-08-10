require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

const seedAccounts = [
    { name: 'Admin',    email: 'admin@enarxi.local',  employeeId: 'admin',          role: 'SUPER_ADMIN', password: 'admin123'     },
    { name: 'Ayaz',     email: 'ayaz@enarxi.com',     employeeId: 'EMP-ADMIN-AYAZ', role: 'SUPER_ADMIN', password: 'Enarxi12345@' },
    { name: 'Info',     email: 'info@enarxi.com',     employeeId: 'EMP-ADMIN-INFO', role: 'SUPER_ADMIN', password: 'Enarxi12345@' },
    { name: 'Syed',     email: 'syed@enarxi.com',     employeeId: 'EMP-ADMIN-SYED', role: 'SUPER_ADMIN', password: 'Enarxi12345@' },
    { name: 'Manager',  email: 'manager@enarxi.com',  employeeId: 'MGR-001',        role: 'MANAGER',     password: 'Manager@123'  },
    { name: 'Employee', email: 'employee@enarxi.com', employeeId: 'EMP-001',        role: 'EMPLOYEE',    password: 'Employee@123' },
];

async function upsertAccount(account) {
    const passwordHash = bcrypt.hashSync(account.password, 10);
    const query = { '': [{ email: account.email.toLowerCase() }, { employeeId: account.employeeId }] };
    const existing = await User.findOne(query);
    if (existing) {
        await User.updateOne({ _id: existing._id }, { '': { name: account.name, email: account.email.toLowerCase(), employeeId: account.employeeId, role: account.role, passwordHash } });
        console.log('UPDATED  [' + account.role + '] ' + account.employeeId + ' (' + account.email + ')');
        return 'updated';
    }
    await User.create({ name: account.name, email: account.email.toLowerCase(), employeeId: account.employeeId, role: account.role, passwordHash });
    console.log('CREATED  [' + account.role + '] ' + account.employeeId + ' (' + account.email + ')');
    return 'created';
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) { console.error('MONGODB_URI not found!'); process.exit(1); }
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri, { dbName: 'IPMSENARXI', serverSelectionTimeoutMS: 10000, family: 4 });
    console.log('Connected to DB: ' + mongoose.connection.name);
    let created = 0, updated = 0;
    for (const account of seedAccounts) {
        const r = await upsertAccount(account);
        if (r === 'created') created++; else updated++;
    }
    console.log('Done! Created: ' + created + ' | Updated: ' + updated);
    console.log('Login: admin/admin123 | MGR-001/Manager@123 | EMP-001/Employee@123');
    await mongoose.disconnect();
    process.exit(0);
}
main().catch(function(err) { console.error('Seed failed:', err.message); process.exit(1); });
