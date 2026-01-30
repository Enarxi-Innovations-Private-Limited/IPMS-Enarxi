const mongoose = require('mongoose');

// MongoDB Atlas connection - No local fallback
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required!');
    console.error('   Set it in the root .env file to connect to MongoDB Atlas.');
    process.exit(1);
}

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            family: 4, // Force IPv4
            dbName: 'IPMSENARXI' // Enforce DB Name
        });
        console.log('✅ MongoDB connected successfully');
        console.log(`📦 Database: ${conn.connection.name}`);
        console.log(`🔌 Host: ${conn.connection.host}`);
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        if (error.reason) console.error('Reason:', error.reason);
        process.exit(1);
    }
};

// Handle connection events
mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
});

module.exports = connectDB;
