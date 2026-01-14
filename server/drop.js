const mongoose = require('mongoose');

const dropDatabase = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/ipms');
        console.log('Connected to MongoDB');
        await mongoose.connection.db.dropDatabase();
        console.log('✅ Database dropped successfully');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
};

dropDatabase();
