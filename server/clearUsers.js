const mongoose = require('mongoose');

const clearUsers = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/ipms');
        console.log('Connected to MongoDB');

        // Delete all users except SUPER_USER and STOCK_ADMIN
        const result = await mongoose.connection.db.collection('users').deleteMany({
            role: { $in: ['MANAGER', 'EMPLOYEE', 'INTERN'] }
        });

        console.log(`✅ Deleted ${result.deletedCount} users (MANAGER, EMPLOYEE, INTERN)`);

        // Also clear related tasks
        const taskResult = await mongoose.connection.db.collection('tasks').deleteMany({});
        console.log(`✅ Deleted ${taskResult.deletedCount} tasks`);

        // Clear activities
        const activityResult = await mongoose.connection.db.collection('activities').deleteMany({});
        console.log(`✅ Deleted ${activityResult.deletedCount} activity logs`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

clearUsers();
