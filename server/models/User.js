const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const normalizeEmailValue = (value) => {
    const raw = Array.isArray(value) ? (value.find(Boolean) || value[0] || '') : value;
    return String(raw || '').trim().toLowerCase();
};

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
        set: normalizeEmailValue,
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
        enum: ['SUPER_ADMIN', 'SUPER_USER', 'MANAGER', 'EMPLOYEE', 'INTERN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'ENGINEER', 'JUNIOR_ENGINEER', 'STOCK_ADMIN'],
        required: true,
    },
    department: {
        type: String,
        enum: ['IT', 'HARDWARE', 'SOFTWARE', null],
        default: null,
    },
    microsoftEntraId: {
        type: String,
        default: null,
        index: true,
    },
    lastLoginProvider: {
        type: String,
        enum: ['PASSWORD', 'MICROSOFT'],
        default: 'PASSWORD',
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
