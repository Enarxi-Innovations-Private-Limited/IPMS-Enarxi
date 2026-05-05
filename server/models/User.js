const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    employeeId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['SUPER_ADMIN', 'MANAGER', 'EMPLOYEE', 'INTERN', 'PURCHASE_MANAGER', 'STORE_MANAGER'],
        required: true,
    },
    department: {
        type: String,
        enum: ['IT', 'HARDWARE', 'SOFTWARE', null],
        default: null,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Method to compare password
userSchema.methods.comparePassword = function (password) {
    return bcrypt.compareSync(password, this.passwordHash);
};

// Method to hash password before saving
userSchema.statics.hashPassword = function (password) {
    return bcrypt.hashSync(password, 10);
};

// Transform output to hide passwordHash
userSchema.set('toJSON', {
    transform: (doc, ret) => {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('User', userSchema);
