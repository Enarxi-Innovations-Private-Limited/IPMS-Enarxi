const path = require('path');
const readline = require('readline');

// Import from server/node_modules since dependencies are there
let mongoose, dotenv;
try {
    mongoose = require('../server/node_modules/mongoose');
    dotenv = require('../server/node_modules/dotenv');
} catch (err) {
    // Fallback if not in the expected path
    mongoose = require('mongoose');
    dotenv = require('dotenv');
}

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../server/.env') });

// Import Models from the index file
const {
    User,
    Project,
    Task,
    Activity,
    Product,
    Supplier,
    PurchaseOrder,
    IssuedItem,
    Notification,
    PriceComparison
} = require('../server/models');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const clearFullData = async () => {
    try {
        console.log('Connecting to database...');
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI is not defined in .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Stats before deletion
        const stats = {
            projects: await Project.countDocuments(),
            tasks: await Task.countDocuments(),
            notifications: await Notification.countDocuments(),
            activities: await Activity.countDocuments(),
            products: await Product.countDocuments(),
            issuedItems: await IssuedItem.countDocuments(),
            suppliers: await Supplier.countDocuments(),
            purchaseOrders: await PurchaseOrder.countDocuments(),
            priceComparisons: await PriceComparison.countDocuments(),
            usersToDelete: await User.countDocuments({ role: { $nin: ['SUPER_USER', 'STOCK_ADMIN'] } }),
            usersToKeep: await User.countDocuments({ role: { $in: ['SUPER_USER', 'STOCK_ADMIN'] } })
        };

        console.log('\n⚠️  WARNING: This will PERMANENTLY DELETE EVERYTHING except Super Admins:');
        console.log(`- ${stats.projects} Projects`);
        console.log(`- ${stats.tasks} Tasks`);
        console.log(`- ${stats.notifications} Notifications`);
        console.log(`- ${stats.activities} Activity Logs`);
        console.log(`- ${stats.products} Stock Products`);
        console.log(`- ${stats.issuedItems} Issued Items`);
        console.log(`- ${stats.suppliers} Suppliers`);
        console.log(`- ${stats.purchaseOrders} Purchase Orders`);
        console.log(`- ${stats.priceComparisons} Price Comparisons`);
        console.log(`- ${stats.usersToDelete} Users (Managers, Employees, Interns)`);
        console.log(`\n✅ WILL KEEP: ${stats.usersToKeep} Admin/Super Admin Users`);

        rl.question('\nAre you CRITICALLY sure? This cannot be undone. Type "CLEAR_ALL" to confirm: ', async (answer) => {
            if (answer === 'CLEAR_ALL') {
                console.log('\n🗑️  Starting massive data wipe...');

                // Deleting all entities
                await Project.deleteMany({});
                console.log('✅ Projects cleared');

                await Task.deleteMany({});
                console.log('✅ Tasks cleared');

                await Notification.deleteMany({});
                console.log('✅ Notifications cleared');

                await Activity.deleteMany({});
                console.log('✅ Activity logs cleared');

                await Product.deleteMany({});
                console.log('✅ Products cleared');

                await IssuedItem.deleteMany({});
                console.log('✅ Issued Items cleared');

                await Supplier.deleteMany({});
                console.log('✅ Suppliers cleared');

                await PurchaseOrder.deleteMany({});
                console.log('✅ Purchase Orders cleared');

                await PriceComparison.deleteMany({});
                console.log('✅ Price Comparisons cleared');

                // Delete non-admin users
                await User.deleteMany({ role: { $nin: ['SUPER_USER', 'STOCK_ADMIN'] } });
                console.log('✅ Restricted Users cleared (Super Admins and Stock Admins kept)');

                console.log('\n✨ FULL IPMS SYSTEM RESET SUCCESSFUL');
                console.log('System is now clean and ready for fresh setup.');
            } else {
                console.log('\n❌ Operation cancelled carefully.');
            }

            await mongoose.disconnect();
            rl.close();
            process.exit(0);
        });

    } catch (err) {
        console.error('❌ Error during system wipe:', err);
        process.exit(1);
    }
};

clearFullData();
