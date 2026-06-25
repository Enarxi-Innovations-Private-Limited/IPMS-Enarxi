require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const emails = ['ayaz@enarxi.com', 'info@enarxi.com', 'syed@enarxi.com'];
    for (const email of emails) {
        const result = await User.findOneAndUpdate(
            { email: email.toLowerCase() }, 
            { $set: { role: 'SUPER_ADMIN' } },
            { new: true }
        );
        if (result) {
            console.log(`✅ Updated ${email} to SUPER_ADMIN`);
        } else {
            console.log(`❌ User ${email} not found in DB! Creating them now...`);
            const name = email.split('@')[0];
            await User.create({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                email: email.toLowerCase(),
                employeeId: `EMP-ADMIN-${name.toUpperCase()}`,
                role: 'SUPER_ADMIN',
                passwordHash: require('bcryptjs').hashSync('Enarxi12345@', 10)
            });
            console.log(`✅ Created ${email} as SUPER_ADMIN with default password 'Enarxi12345@'`);
        }
    }
    process.exit(0);
}).catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
});
