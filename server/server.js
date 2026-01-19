const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fix for Atlas SRV lookup
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const connectDB = require('./db');
const { User, Project, Task, Activity, Product, Supplier, PurchaseOrder, IssuedItem, Notification } = require('./models');
const scraperService = require('./services/scraperService');

const app = express();
// CORS Configuration - Allow Production & Development
const allowedOrigins = [
    'https://ipms-enarxi.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'

];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin) || (origin && (origin.startsWith('http://19') || origin.startsWith('http://10')))) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // Allow all for now, log blocked ones
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Test Endpoint for DB Connection
app.get('/api/test', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

    res.json({
        message: 'Backend is running!',
        dbStatus: states[dbState] || 'unknown',
        dbName: mongoose.connection.name,
        timestamp: new Date()
    });
});

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const roles = { SUPER_USER: 'SUPER_USER', MANAGER: 'MANAGER', EMPLOYEE: 'EMPLOYEE', INTERN: 'INTERN', STOCK_ADMIN: 'STOCK_ADMIN' };

// Helper to validate ObjectId
const isValidObjectId = (id) => {
    return mongoose.Types.ObjectId.isValid(id);
};

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.xlsx' || ext === '.xls') {
            cb(null, true);
        } else {
            cb(new Error('Only Excel files are allowed'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Helper function to move files to backup folder
const moveToBackup = (sourcePath, projectInfo, originalFilename, attachmentName, deletedBy) => {
    const { projectId, projectCode, projectName, department } = projectInfo;
    const backupBaseDir = path.join(__dirname, 'uploads', 'backup');
    const projectBackupDir = path.join(backupBaseDir, `${projectCode || projectId}`);

    // Create backup directories if they don't exist
    if (!fs.existsSync(backupBaseDir)) {
        fs.mkdirSync(backupBaseDir, { recursive: true });
    }
    if (!fs.existsSync(projectBackupDir)) {
        fs.mkdirSync(projectBackupDir, { recursive: true });
    }

    const destPath = path.join(projectBackupDir, originalFilename);

    try {
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
            fs.unlinkSync(sourcePath);

            // Save metadata about the backed up file
            const metadataPath = path.join(projectBackupDir, 'metadata.json');
            let metadata = {
                files: [],
                projectInfo: {
                    projectId,
                    projectCode,
                    projectName: projectName || 'Unknown Project',
                    department: department || 'Unknown'
                },
                deletedAt: new Date().toISOString(),
                deletedBy: deletedBy || 'Unknown'
            };

            if (fs.existsSync(metadataPath)) {
                try {
                    const existingMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    metadata.files = existingMetadata.files || [];
                    // Keep existing project info if it was set properly before
                    if (existingMetadata.projectInfo?.projectName && existingMetadata.projectInfo.projectName !== 'Unknown Project') {
                        metadata.projectInfo = existingMetadata.projectInfo;
                    }
                    // Update deletedBy and deletedAt with latest info
                    metadata.deletedBy = deletedBy || existingMetadata.deletedBy || 'Unknown';
                    metadata.deletedAt = new Date().toISOString();
                } catch (e) {
                    console.error('Error reading metadata:', e);
                }
            }

            // Add file entry to metadata
            metadata.files.push({
                filename: originalFilename,
                originalName: attachmentName || originalFilename,
                backedUpAt: new Date().toISOString(),
                deletedBy: deletedBy || 'Unknown',
                type: 'attachment'
            });

            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            console.log(`✅ Moved ${originalFilename} to backup for project ${projectCode || projectId}`);
            return true;
        }
    } catch (err) {
        console.error('Error moving file to backup:', err);
    }
    return false;
};

// Helper function to sanitize filename for filesystem
const sanitizeFilename = (filename) => {
    // Remove or replace unsafe characters
    return filename
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace unsafe chars with underscore
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/__+/g, '_') // Replace multiple underscores with single
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
};

// Helper function to get unique filename if file exists
const getUniqueFilename = (dir, filename) => {
    const ext = path.extname(filename);
    const nameWithoutExt = path.basename(filename, ext);
    let finalName = filename;
    let counter = 1;

    while (fs.existsSync(path.join(dir, finalName))) {
        finalName = `${nameWithoutExt}_${counter}${ext}`;
        counter++;
    }

    return finalName;
};

// Configure multer for project attachments - uses projectCode_projectId folders
const projectAttachmentStorage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const projectId = req.params.projectId;
            // Fetch project if not already fetched
            if (!req.project) {
                req.project = await Project.findById(projectId);
            }

            if (!req.project) {
                // Fallback to projectId if project not found (shouldn't happen if ID valid)
                const uploadDir = path.join(__dirname, 'uploads', 'projects', projectId);
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                return cb(null, uploadDir);
            }

            // Use format: PRJ-2026-001_<projectId> for clarity and uniqueness
            const folderName = req.project.projectCode ? `${req.project.projectCode}_${projectId}` : projectId;
            const uploadDir = path.join(__dirname, 'uploads', 'projects', folderName);
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        } catch (error) {
            console.error('Error in multer destination:', error);
            cb(error);
        }
    },
    filename: async (req, file, cb) => {
        try {
            // Use the custom name if provided, otherwise use original filename
            let customName = null;
            if (req.body.name) {
                customName = req.body.name;
            } else if (req.body.customNames) {
                const names = Array.isArray(req.body.customNames) ? req.body.customNames : [req.body.customNames];
                const fileIndex = req.files ? req.files.length : 0;
                customName = names[fileIndex];
            }

            // Use custom name or original filename
            const baseName = customName || file.originalname;
            const ext = path.extname(file.originalname);

            // If custom name doesn't have extension, add the original extension
            let finalName = baseName;
            if (!path.extname(baseName)) {
                finalName = baseName + ext;
            }

            // Sanitize the filename
            finalName = sanitizeFilename(finalName);

            // Get the destination directory (Recalculate or trust previous execution context)
            // Since destination runs first, req.project SHOULD look populated.
            // But relying on side-effects in 'req' across multer functions is tricky if they run in parallel?
            // Actually destination runs, then filename.

            const projectId = req.params.projectId;
            if (!req.project) {
                req.project = await Project.findById(projectId);
            }

            // Use format: PRJ-2026-001_<projectId> for clarity and uniqueness
            const folderName = req.project?.projectCode ? `${req.project.projectCode}_${projectId}` : projectId;
            const uploadDir = path.join(__dirname, 'uploads', 'projects', folderName);

            // Ensure unique filename
            // Note: This relies on uploadDir existing, which destination ensures.
            // But if async race conditions occur, we might double check.
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            finalName = getUniqueFilename(uploadDir, finalName);

            cb(null, finalName);
        } catch (error) {
            console.error('Error in multer filename:', error);
            cb(error);
        }
    }
});

const projectAttachmentUpload = multer({
    storage: projectAttachmentStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.zip', '.rar'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('File type not allowed'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for project docs
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth Middleware
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ message: 'User not found' });
        req.user = user;
        next();
    } catch (err) {
        console.error('Auth error:', err.message);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
};

// Helper to log activity
const logActivity = async (type, message, userId, userName, targetId, targetName) => {
    try {
        await Activity.create({ type, message, userId, userName, targetId, targetName });
    } catch (err) {
        console.error('Failed to log activity:', err);
    }
};

// ============ AUTH ROUTES ============
app.post('/api/auth/login', async (req, res) => {
    const { employeeId, password } = req.body;
    if (!employeeId || !password) {
        return res.status(400).json({ message: 'Employee ID and password are required' });
    }
    const user = await User.findOne({ employeeId });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    await logActivity('LOGIN', `${user.name} logged in`, user._id, user.name, null, null);
    res.json({
        token,
        user: { id: user._id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role, department: user.department },
    });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    res.json({
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        employeeId: req.user.employeeId,
        role: req.user.role,
        department: req.user.department,
    });
});

app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current password and new password are required' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    if (!bcrypt.compareSync(currentPassword, req.user.passwordHash)) {
        return res.status(400).json({ message: 'Current password is incorrect' });
    }
    req.user.passwordHash = bcrypt.hashSync(newPassword, 10);


    await req.user.save();
    res.json({ message: 'Password changed successfully' });
});

// ============ NOTIFICATION ROUTES ============
app.get('/api/notifications', authMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ recipientId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifications);
    } catch (err) {
        console.error('❌ [Fetch Notifications]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch notifications', error: err.message });
    }
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipientId: req.user._id },
            { isRead: true },
            { new: true }
        );
        res.json(notification);
    } catch (err) {
        console.error('❌ [Update Notification]: Error:', err);
        res.status(500).json({ message: 'Failed to update notification', error: err.message });
    }
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
    try {
        await Notification.updateMany(
            { recipientId: req.user._id, isRead: false },
            { isRead: true }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error('❌ [Mark All Read]: Error:', err);
        res.status(500).json({ message: 'Failed to mark all as read', error: err.message });
    }
});

// ============ USER ROUTES ============
app.get('/api/users', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER, roles.EMPLOYEE, roles.STOCK_ADMIN), async (req, res) => {
    let query = {};

    if (req.user.role === roles.SUPER_USER) {
        // SuperUsers see all non-super users (managers, employees, interns, stock admins)
        query.role = { $in: ['MANAGER', 'EMPLOYEE', 'INTERN', 'STOCK_ADMIN'] };
    } else if (req.user.role === roles.MANAGER && req.user.department) {
        // Managers see only employees and interns from their department
        query.role = { $in: ['EMPLOYEE', 'INTERN'] };
        query.department = req.user.department;
    } else {
        // Others see only employees and interns
        query.role = { $in: ['EMPLOYEE', 'INTERN'] };
    }

    const users = await User.find(query).select('-passwordHash');
    res.json(users.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        employeeId: u.employeeId,
        role: u.role,
        department: u.department,
    })));
});

app.get('/api/users/:userId/details', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const projects = await Project.find({ teamIds: user._id });
    const tasks = await Task.find({ assigneeId: user._id }).populate('projectId', 'name');

    res.json({
        id: user._id,
        name: user.name,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
        department: user.department,
        projects: projects.map(p => ({ id: p._id, name: p.name, status: p.status })),
        tasks: tasks.map(t => ({
            id: t._id,
            title: t.title,
            status: t.status,
            projectId: t.projectId?._id,
            projectName: t.projectId?.name || 'Unknown',
        })),
    });
});

// Get next employee ID (for display in create form)
app.get('/api/users/next-id', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const lastUser = await User.findOne({ employeeId: { $regex: /^EMP-\d+$/ } })
            .sort({ employeeId: -1 })
            .select('employeeId');

        let nextNumber = 1;
        if (lastUser && lastUser.employeeId) {
            const match = lastUser.employeeId.match(/EMP-(\d+)/);
            if (match) {
                nextNumber = parseInt(match[1], 10) + 1;
            }
        }
        const nextId = `EMP-${String(nextNumber).padStart(3, '0')}`;
        res.json({ nextEmployeeId: nextId });
    } catch (err) {
        console.error('❌ [Get Next ID]: Error:', err);
        res.status(500).json({ message: 'Failed to get next ID', error: err.message });
    }
});

// Get User Performance Statistics
app.get('/api/users/:userId/performance', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER), async (req, res) => {
    try {
        const { userId } = req.params;
        if (!isValidObjectId(userId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Managers can only view performance of users in their department
        if (req.user.role === roles.MANAGER && user.department !== req.user.department) {
            return res.status(403).json({ message: 'Cannot view performance of users outside your department' });
        }

        // Get all tasks assigned to this user
        const tasks = await Task.find({ assigneeId: userId }).populate('projectId', 'name projectCode');

        // Calculate statistics
        const completedTasks = tasks.filter(t => t.status === 'COMPLETED');
        const pendingTasks = tasks.filter(t => t.status !== 'COMPLETED');
        const tasksWithPerformance = completedTasks.filter(t => t.performanceScore !== null && t.performanceScore !== undefined);

        // Performance categories
        const excellentTasks = tasksWithPerformance.filter(t => t.performanceScore >= 150);
        const onTimeTasks = tasksWithPerformance.filter(t => t.performanceScore >= 90 && t.performanceScore < 150);
        const lateTasks = tasksWithPerformance.filter(t => t.performanceScore < 90);

        // Average performance
        let averagePerformance = null;
        if (tasksWithPerformance.length > 0) {
            const totalScore = tasksWithPerformance.reduce((sum, t) => sum + t.performanceScore, 0);
            averagePerformance = Math.round(totalScore / tasksWithPerformance.length);
        }

        // Helper to format duration
        const formatDuration = (minutes) => {
            if (!minutes) return '-';
            if (minutes >= 1440) {
                const days = Math.floor(minutes / 1440);
                const hours = Math.floor((minutes % 1440) / 60);
                return hours > 0 ? `${days}d ${hours}h` : `${days} day${days > 1 ? 's' : ''}`;
            } else {
                const hours = Math.floor(minutes / 60);
                const mins = minutes % 60;
                return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
            }
        };

        res.json({
            userId: user._id,
            name: user.name,
            email: user.email,
            employeeId: user.employeeId,
            role: user.role,
            department: user.department,
            stats: {
                totalTasks: tasks.length,
                completedTasks: completedTasks.length,
                pendingTasks: pendingTasks.length,
                tasksWithDeadline: tasksWithPerformance.length,
                excellentCount: excellentTasks.length,   // >= 150%
                onTimeCount: onTimeTasks.length,          // 90-149%
                lateCount: lateTasks.length,              // < 90%
                averagePerformance,
            },
            tasks: tasks.map(t => ({
                id: t._id,
                title: t.title,
                status: t.status,
                projectId: t.projectId?._id,
                projectCode: t.projectId?.projectCode || '-',
                assignedAt: t.assignedAt,
                deadline: t.deadline,
                completedAt: t.completedAt,
                allocatedMinutes: t.allocatedMinutes,
                actualMinutes: t.actualMinutes,
                allocatedFormatted: formatDuration(t.allocatedMinutes),
                actualFormatted: formatDuration(t.actualMinutes),
                performanceScore: t.performanceScore,
            })).sort((a, b) => {
                // Sort by completedAt desc, then by deadline desc
                if (a.completedAt && b.completedAt) return new Date(b.completedAt) - new Date(a.completedAt);
                if (a.completedAt) return -1;
                if (b.completedAt) return 1;
                if (a.deadline && b.deadline) return new Date(b.deadline) - new Date(a.deadline);
                return 0;
            }),
        });
    } catch (err) {
        console.error('❌ [User Performance]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch user performance', error: err.message });
    }
});

app.post('/api/users', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { name, email, role, department, password, employeeId: manualId } = req.body;

        if (!name || !email || !role || !password) {
            return res.status(400).json({ message: 'Name, email, role, and password are required' });
        }

        let employeeId = manualId;

        // Auto-generate employee ID if not provided
        if (!employeeId) {
            const lastUser = await User.findOne({ employeeId: { $regex: /^EMP-\d+$/ } })
                .sort({ employeeId: -1 })
                .select('employeeId');

            let nextNumber = 1;
            if (lastUser && lastUser.employeeId) {
                const match = lastUser.employeeId.match(/EMP-(\d+)/);
                if (match) {
                    nextNumber = parseInt(match[1], 10) + 1;
                }
            }
            employeeId = `EMP-${String(nextNumber).padStart(3, '0')}`;
        } else {
            // Check if manual ID already exists
            const existingId = await User.findOne({ employeeId });
            if (existingId) {
                return res.status(400).json({ message: 'Employee ID already exists' });
            }
        }

        console.log('Creating new user:', { name, email, employeeId, role, department });

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        const newUser = await User.create({
            name, email, employeeId, role,
            department: department || null,
            passwordHash: bcrypt.hashSync(password, 10),
        });
        console.log('✅ User created in MongoDB:', newUser._id, newUser.name, 'with ID:', employeeId);
        await logActivity('USER_CREATED', `${role.toLowerCase()} ${name} (${employeeId}) was added`, req.user._id, req.user.name, newUser._id, name);
        res.status(201).json({ id: newUser._id, name, email, employeeId, role, department: newUser.department });
    } catch (err) {
        console.error('❌ Error creating user:', err);
        res.status(500).json({ message: 'Failed to create user', error: err.message });
    }
});

app.put('/api/users/:userId', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === roles.SUPER_USER) return res.status(403).json({ message: 'Cannot edit super user' });

    const { name, email, role, department, password } = req.body;
    if (email && email !== user.email) {
        const existing = await User.findOne({ email, _id: { $ne: user._id } });
        if (existing) return res.status(400).json({ message: 'Email already exists' });
        user.email = email;
    }
    if (name) user.name = name;
    if (role && ['MANAGER', 'EMPLOYEE', 'INTERN', 'STOCK_ADMIN'].includes(role)) user.role = role;
    if (department !== undefined) user.department = department;
    if (password) user.passwordHash = bcrypt.hashSync(password, 10);
    await user.save();
    await logActivity('USER_UPDATED', `User ${user.name} was updated`, req.user._id, req.user.name, user._id, user.name);
    res.json({ id: user._id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role, department: user.department });
});

app.delete('/api/users/:userId', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === roles.SUPER_USER) return res.status(403).json({ message: 'Cannot delete super user' });

    await logActivity('USER_DELETED', `User ${user.name} (${user.employeeId}) was removed`, req.user._id, req.user.name, user._id, user.name);
    await Project.updateMany({ teamIds: user._id }, { $pull: { teamIds: user._id } });
    await Task.deleteMany({ assigneeId: user._id });
    await User.deleteOne({ _id: user._id });
    res.json({ message: 'User deleted successfully' });
});

// ============ PROJECT ROUTES ============

// Task Templates for project creation
const taskTemplates = {
    HARDWARE: {
        'Hardware Design': [
            { title: 'Team Lead – Timeline execution plan', order: 1 },
            { title: 'Schematic Development', order: 2 },
            { title: 'Schematic Internal Approval and Client Approval', order: 3 },
            { title: 'PCB Layout Internal Approval and Client Approval', order: 4 },
            { title: 'Project Budget Sheet and Approval', order: 5 },
            { title: 'Procurement', order: 6 },
            { title: 'Boards Assembly and Fabrication', order: 7 },
            { title: 'Electrical Testing', order: 8 },
            { title: 'Peripheral Testing', order: 9 },
            { title: 'Firmware Development', order: 10 },
            { title: 'Operational Testing', order: 11 },
            { title: 'Client Demo', order: 12 },
            { title: 'Client Payment', order: 13 },
            { title: 'Client Project Handover', order: 14 },
            { title: 'Client Project Completion Certificate', order: 15 },
            { title: 'Client Documentation Handover (if Any)', order: 16 },
            { title: 'Client Feedback on Email', order: 17 },
        ],
    },
    SOFTWARE: {
        'Product Development': [
            { title: 'Requirement & PRD', order: 1 },
            { title: 'Wireframes', order: 2 },
            { title: 'UI Design', order: 3 },
            { title: 'Development', order: 4 },
            { title: 'Client Validation', order: 5 },
            { title: 'Final Review', order: 6 },
            { title: 'Closure', order: 7 },
        ],
    },
};

function getTemplatesForDepartment(department) {
    return taskTemplates[department] || {};
}

function getTemplateTasks(department, templateName) {
    const departmentTemplates = getTemplatesForDepartment(department);
    return departmentTemplates[templateName] || [];
}

// Get task templates for a department
app.get('/api/task-templates/:department', authMiddleware, async (req, res) => {
    const department = req.params.department.toUpperCase();
    const templates = getTemplatesForDepartment(department);
    const templateList = Object.keys(templates).map(name => ({
        name,
        taskCount: templates[name].length,
        tasks: templates[name],
    }));
    res.json(templateList);
});

app.get('/api/projects', authMiddleware, async (req, res) => {
    let query = {};
    if (req.user.role === roles.SUPER_USER) {
        // Super users see all projects
    } else if (req.user.role === roles.MANAGER && req.user.department) {
        // Managers see all projects in their department
        query.department = req.user.department;
    } else {
        // Employees/Interns only see projects they're assigned to
        query.teamIds = req.user._id;
    }
    const projects = await Project.find(query).populate('managerId', 'name');
    const isEmployeeOrIntern = [roles.EMPLOYEE, roles.INTERN].includes(req.user.role);

    const projectsWithStats = await Promise.all(projects.map(async (p) => {
        const taskCount = await Task.countDocuments({ projectId: p._id });
        const completedTaskCount = await Task.countDocuments({ projectId: p._id, status: 'COMPLETED' });
        return {
            id: p._id,
            name: isEmployeeOrIntern ? null : p.name,
            projectCode: p.projectCode,
            description: p.description,
            department: p.department || 'SOFTWARE',
            status: p.status,
            startDate: p.startDate,
            endDate: p.deadline,
            deadline: p.deadline,
            budget: p.budget,
            managerId: p.managerId?._id,
            managerName: p.managerId?.name,
            teamIds: p.teamIds,
            templateUsed: p.templateUsed,
            attachments: p.attachments,
            taskCount,
            completedTaskCount,
        };
    }));
    res.json(projectsWithStats);
});

// Project summary stats
app.get('/api/projects/summary', authMiddleware, async (req, res) => {
    try {
        const total = await Project.countDocuments();
        const active = await Project.countDocuments({ status: 'ACTIVE' });
        const completed = await Project.countDocuments({ status: 'COMPLETED' });
        const onHold = await Project.countDocuments({ status: 'ON_HOLD' });

        const recentProjects = await Project.find().sort({ createdAt: -1 }).limit(5);

        // Get total task counts
        const totalTasks = await Task.countDocuments();
        const completedTasks = await Task.countDocuments({ status: 'COMPLETED' });
        const inProgressTasks = await Task.countDocuments({ status: 'IN_PROGRESS' });

        // Get unique team members
        const allProjects = await Project.find().select('teamIds');
        const uniqueMembers = new Set();
        allProjects.forEach(p => p.teamIds.forEach(id => uniqueMembers.add(id.toString())));
        const totalMembers = uniqueMembers.size;

        res.json({
            total,
            active,
            completed,
            onHold,
            recentProjects: recentProjects.map(p => ({
                id: p._id,
                name: p.name,
                status: p.status,
                department: p.department,
            })),
            totalTasks,
            completedTasks,
            inProgressTasks,
            totalMembers,
        });
    } catch (err) {
        console.error('Error loading project summary:', err);
        res.status(500).json({ message: 'Failed to load project summary' });
    }
});

// Get next available project code
app.get('/api/projects/next-code', authMiddleware, async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const prefix = `PRJ-${currentYear}-`;

        // Find the last project created this year
        const lastProject = await Project
            .findOne({ projectCode: { $regex: `^${prefix}` } })
            .sort({ projectCode: -1 });

        let nextNumber = 1;
        if (lastProject && lastProject.projectCode) {
            const lastNumber = parseInt(lastProject.projectCode.split('-')[2], 10);
            nextNumber = lastNumber + 1;
        }

        const nextCode = `${prefix}${String(nextNumber).padStart(3, '0')}`;
        res.json({ nextCode });
    } catch (err) {
        console.error('Error getting next project code:', err);
        res.status(500).json({ message: 'Failed to get next project code' });
    }
});

app.get('/api/projects/:projectId', authMiddleware, async (req, res) => {
    const project = await Project.findById(req.params.projectId).populate('managerId', 'name');
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const isEmployeeOrIntern = [roles.EMPLOYEE, roles.INTERN].includes(req.user.role);

    res.json({
        id: project._id,
        name: isEmployeeOrIntern ? null : project.name,
        projectCode: project.projectCode,
        description: project.description,
        department: project.department || 'SOFTWARE',
        status: project.status,
        startDate: project.startDate,
        endDate: project.deadline,
        deadline: project.deadline,
        budget: project.budget,
        managerId: project.managerId?._id,
        managerName: project.managerId?.name,
        teamIds: project.teamIds,
        templateUsed: project.templateUsed,
        attachments: project.attachments,
    });
});

app.post('/api/projects', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { name, description, department, managerId, startDate, deadline, endDate, budget, templateName, teamIds } = req.body;
        if (!name) return res.status(400).json({ message: 'Project name is required' });

        const project = await Project.create({
            name,
            description: description || '',
            department: department || 'SOFTWARE',
            status: 'PLANNING',
            managerId: managerId || null,
            startDate: startDate || '',
            deadline: deadline || endDate,
            budget: budget || 0,
            templateUsed: templateName || '',
            teamIds: teamIds || [],
            createdBy: req.user._id,
        });

        // Notify Manager
        if (managerId) {
            await Notification.create({
                recipientId: managerId,
                type: 'PROJECT_ASSIGNMENT',
                message: `You have been assigned to project [${project.projectCode}]`,
                relatedId: project._id
            });
        }

        // Auto-create tasks from template if template is selected
        if (templateName && department) {
            const templateTasks = getTemplateTasks(department.toUpperCase(), templateName);
            for (const task of templateTasks) {
                await Task.create({
                    title: task.title,
                    description: '',
                    status: 'NOT_STARTED',
                    projectId: project._id,
                    assigneeId: null,
                    createdBy: req.user._id,
                    order: task.order,
                });
            }
            console.log(`✅ Created ${templateTasks.length} tasks from template "${templateName}"`);
        }

        // Create dedicated folder for project attachments using projectCode_projectId format
        const folderName = project.projectCode ? `${project.projectCode}_${project._id.toString()}` : project._id.toString();
        const projectUploadDir = path.join(__dirname, 'uploads', 'projects', folderName);
        if (!fs.existsSync(projectUploadDir)) {
            fs.mkdirSync(projectUploadDir, { recursive: true });
            console.log(`📁 Created attachment folder for project ${project.projectCode}: ${projectUploadDir}`);
        }

        await logActivity('PROJECT_CREATED', `Project "${name}" was created`, req.user._id, req.user.name, project._id, name);
        res.status(201).json({
            id: project._id,
            name: project.name,
            description: project.description,
            department: project.department,
            status: project.status,
            startDate: project.startDate,
            endDate: project.deadline,
            deadline: project.deadline,
            budget: project.budget,
            managerId: project.managerId,
            templateUsed: project.templateUsed,
            teamIds: project.teamIds
        });
    } catch (err) {
        console.error('Error creating project:', err);
        res.status(500).json({ message: 'Failed to create project' });
    }
});

app.put('/api/projects/:projectId', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER), async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const { name, description, department, status, deadline, endDate, teamIds } = req.body;
        console.log('Updating project:', projectId);
        console.log('Request body:', { name, description, department, status, deadline, teamIds });
        console.log('Current project status:', project.status);

        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (department) project.department = department;
        if (status) {
            console.log('Changing status from', project.status, 'to', status);
            project.status = status;
        }
        if (deadline !== undefined) {
            project.deadline = deadline;
        } else if (endDate !== undefined) {
            project.deadline = endDate;
        }

        // Handle Team Changes and Task Reassignment
        if (teamIds !== undefined) {
            const oldTeamIds = project.teamIds.map(id => id.toString());
            const newTeamIds = teamIds.map(id => id.toString());

            // Find removed members
            const removedMembers = oldTeamIds.filter(id => !newTeamIds.includes(id));

            if (removedMembers.length > 0) {
                console.log(`Removing members: ${removedMembers}, unassigning their tasks...`);
                await Task.updateMany(
                    { projectId: project._id, assigneeId: { $in: removedMembers } },
                    { $set: { assigneeId: null, status: 'NOT_STARTED' } }
                );
            }
            project.teamIds = teamIds;
        }

        await project.save();
        console.log('✅ Project updated successfully:', project._id, 'Status:', project.status);
        res.json({ id: project._id, name: project.name, description: project.description, department: project.department, status: project.status, deadline: project.deadline, teamIds: project.teamIds });
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ message: 'Failed to update project', error: err.message });
    }
});

// Upload attachments to a project
app.post('/api/projects/:projectId/attachments', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER, roles.EMPLOYEE, roles.INTERN), projectAttachmentUpload.array('attachments', 10), async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No files uploaded' });
        }

        const newAttachments = req.files.map((file, index) => {
            // If a custom name is provided, use it. If multiple files, potential issue with single name field.
            // Assumption: If multiple files, usually single name not appropriate unless it's a batch.
            // But UI likely sends one file at a time or we use originalname as fallback.
            // Check if req.body.names is array corresponding to files or single name for single file.

            let attachmentName = file.originalname;
            if (req.body.customNames) {
                const customNames = Array.isArray(req.body.customNames) ? req.body.customNames : [req.body.customNames];
                if (customNames[index]) attachmentName = customNames[index];
            } else if (req.body.name && req.files.length === 1) {
                attachmentName = req.body.name;
            }

            return {
                name: attachmentName,
                url: `/uploads/projects/${project.projectCode ? `${project.projectCode}_${projectId}` : projectId}/${file.filename}`,
                uploadedAt: new Date()
            };
        });

        project.attachments = [...(project.attachments || []), ...newAttachments];
        await project.save();

        console.log(`✅ Uploaded ${req.files.length} files to project ${projectId} by ${req.user.name}`);
        res.json({
            message: 'Files uploaded successfully',
            attachments: project.attachments
        });
    } catch (err) {
        console.error('Error uploading attachments:', err);
        res.status(500).json({ message: 'Failed to upload files' });
    }
});

// Delete an attachment from a project (moves to backup instead of permanent delete)
app.delete('/api/projects/:projectId/attachments/:filename', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER), async (req, res) => {
    try {
        const { projectId, filename } = req.params;
        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Find attachment
        const attachmentIndex = project.attachments.findIndex(a => a.url.endsWith(filename));

        if (attachmentIndex === -1) {
            return res.status(404).json({ message: 'Attachment not found in project' });
        }

        const attachment = project.attachments[attachmentIndex];

        // Move file to backup instead of deleting permanently
        // Check new path (uploads/projects/projectCode_projectId/filename), then legacy paths
        const folderName = project.projectCode ? `${project.projectCode}_${projectId}` : projectId;
        let filePath = path.join(__dirname, 'uploads', 'projects', folderName, filename);

        if (!fs.existsSync(filePath)) {
            // Try legacy path (using projectCode only)
            filePath = path.join(__dirname, 'uploads', 'projects', project.projectCode || projectId, filename);
        }

        if (!fs.existsSync(filePath)) {
            // Try legacy path (using projectId only)
            filePath = path.join(__dirname, 'uploads', 'projects', projectId, filename);
        }

        if (!fs.existsSync(filePath)) {
            // Try oldest path structure (flat in projects folder)
            filePath = path.join(__dirname, 'uploads', 'projects', filename);
        }

        // Create project info object with all details
        const projectInfo = {
            projectId: project._id.toString(),
            projectCode: project.projectCode,
            projectName: project.name,
            department: project.department
        };

        const movedToBackup = moveToBackup(filePath, projectInfo, filename, attachment.name, req.user.name);

        if (!movedToBackup) {
            console.warn(`File not found on disk for backup: ${filename}`);
        }

        // Remove from database
        project.attachments.splice(attachmentIndex, 1);
        await project.save();

        console.log(`✅ Moved attachment ${filename} to backup from project ${projectId}`);
        res.json({ message: 'Attachment moved to backup successfully', attachments: project.attachments });
    } catch (err) {
        console.error('Error deleting attachment:', err);
        res.status(500).json({ message: 'Failed to delete attachment' });
    }
});

app.delete('/api/projects/:projectId', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Move all project attachments to backup before deletion
        const backupBaseDir = path.join(__dirname, 'uploads', 'backup');

        // Determine unique backup directory name
        let backupName = project.projectCode || projectId;
        let projectBackupDir = path.join(backupBaseDir, backupName);

        // Check for duplicate names and append counter if needed
        if (fs.existsSync(projectBackupDir)) {
            let counter = 1;
            while (fs.existsSync(path.join(backupBaseDir, `${backupName}(${counter})`))) {
                counter++;
            }
            projectBackupDir = path.join(backupBaseDir, `${backupName}(${counter})`);
        }

        // Create backup directory
        if (!fs.existsSync(projectBackupDir)) {
            fs.mkdirSync(projectBackupDir, { recursive: true });
        }

        // Backup all attachments from the project
        if (project.attachments && project.attachments.length > 0) {
            for (const attachment of project.attachments) {
                const filename = attachment.url.split('/').pop();
                // Try new path structure first
                let sourcePath = path.join(__dirname, 'uploads', 'projects', projectId, filename);
                if (!fs.existsSync(sourcePath)) {
                    // Try old path structure
                    sourcePath = path.join(__dirname, 'uploads', 'projects', filename);
                }
                if (fs.existsSync(sourcePath)) {
                    const destPath = path.join(projectBackupDir, filename);
                    fs.copyFileSync(sourcePath, destPath);
                    fs.unlinkSync(sourcePath);
                }
            }
        }

        // Move entire project folder if it exists
        // Try new naming convention first (projectCode_projectId), then legacy paths
        const folderName = project.projectCode ? `${project.projectCode}_${projectId}` : projectId;
        let projectFolder = path.join(__dirname, 'uploads', 'projects', folderName);

        // Fallback to legacy paths if new format doesn't exist
        if (!fs.existsSync(projectFolder)) {
            projectFolder = path.join(__dirname, 'uploads', 'projects', project.projectCode || projectId);
        }
        if (!fs.existsSync(projectFolder)) {
            projectFolder = path.join(__dirname, 'uploads', 'projects', projectId);
        }
        if (fs.existsSync(projectFolder)) {
            // Move remaining files
            const files = fs.readdirSync(projectFolder);
            for (const file of files) {
                const srcPath = path.join(projectFolder, file);
                const destPath = path.join(projectBackupDir, file);
                // Only copy if not already there (avoid error if file was in attachments loop AND folder)
                if (!fs.existsSync(destPath)) {
                    fs.copyFileSync(srcPath, destPath);
                }
                fs.unlinkSync(srcPath);
            }
            // Remove the now-empty project folder
            fs.rmdirSync(projectFolder);
        }

        // Save backup metadata
        const metadataPath = path.join(projectBackupDir, 'metadata.json');
        const metadata = {
            projectInfo: {
                projectId: project._id,
                projectCode: project.projectCode,
                projectName: project.name,
                description: project.description,
                department: project.department,
                status: project.status
            },
            files: (project.attachments || []).map(a => ({
                filename: a.url.split('/').pop(),
                originalName: a.name,
                uploadedAt: a.uploadedAt,
                type: 'attachment'
            })),
            deletedAt: new Date().toISOString(),
            deletedBy: req.user.name
        };
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        await Task.deleteMany({ projectId: project._id });
        await Project.deleteOne({ _id: project._id });

        console.log(`✅ Project ${project.projectCode} deleted, files backed up to ${projectBackupDir}`);
        res.json({ message: 'Project deleted successfully. Files have been backed up.' });
    } catch (err) {
        console.error('❌ [Delete Project]: Error:', err);
        res.status(500).json({ message: 'Failed to delete project', error: err.message });
    }
});

// ============ BACKUP MANAGEMENT ROUTES (Super Admin Only) ============

// Get all backup folders
app.get('/api/backups', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const backupBaseDir = path.join(__dirname, 'uploads', 'backup');

        if (!fs.existsSync(backupBaseDir)) {
            return res.json([]);
        }

        const backupFolders = fs.readdirSync(backupBaseDir).filter(folder => {
            const folderPath = path.join(backupBaseDir, folder);
            return fs.statSync(folderPath).isDirectory();
        });

        const backups = backupFolders.map(folder => {
            const folderPath = path.join(backupBaseDir, folder);
            const metadataPath = path.join(folderPath, 'metadata.json');

            let metadata = { projectInfo: { projectCode: folder }, files: [], deletedAt: null };
            if (fs.existsSync(metadataPath)) {
                try {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                } catch (e) {
                    console.error('Error reading backup metadata:', e);
                }
            }

            // Get actual files in folder (excluding metadata.json)
            const files = fs.readdirSync(folderPath).filter(f => f !== 'metadata.json');
            const folderStats = fs.statSync(folderPath);

            // Calculate total size
            let totalSize = 0;
            files.forEach(file => {
                const filePath = path.join(folderPath, file);
                totalSize += fs.statSync(filePath).size;
            });

            return {
                folderName: folder,
                projectCode: metadata.projectInfo?.projectCode || folder,
                projectName: metadata.projectInfo?.projectName || 'Unknown Project',
                department: metadata.projectInfo?.department || 'Unknown',
                fileCount: files.length,
                totalSize,
                deletedAt: metadata.deletedAt || folderStats.mtime,
                deletedBy: metadata.deletedBy || 'Unknown'
            };
        });

        // Sort by deletion date (newest first)
        backups.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

        res.json(backups);
    } catch (err) {
        console.error('❌ [Fetch Backups]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch backups', error: err.message });
    }
});

// Get details of a specific backup folder
app.get('/api/backups/:folderName', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { folderName } = req.params;
        const folderPath = path.join(__dirname, 'uploads', 'backup', folderName);

        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ message: 'Backup folder not found' });
        }

        const metadataPath = path.join(folderPath, 'metadata.json');
        let metadata = { projectInfo: { projectCode: folderName }, files: [], deletedAt: null };

        if (fs.existsSync(metadataPath)) {
            try {
                metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            } catch (e) {
                console.error('Error reading backup metadata:', e);
            }
        }

        // Get actual files in folder
        const files = fs.readdirSync(folderPath).filter(f => f !== 'metadata.json').map(filename => {
            const filePath = path.join(folderPath, filename);
            const stats = fs.statSync(filePath);

            // Find matching file info in metadata
            const fileInfo = metadata.files?.find(f => f.filename === filename) || {};

            return {
                filename,
                originalName: fileInfo.originalName || filename,
                size: stats.size,
                backedUpAt: fileInfo.backedUpAt || stats.mtime,
                type: fileInfo.type || 'file'
            };
        });

        res.json({
            folderName,
            projectInfo: metadata.projectInfo,
            files,
            deletedAt: metadata.deletedAt,
            deletedBy: metadata.deletedBy
        });
    } catch (err) {
        console.error('❌ [Fetch Backup Details]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch backup details', error: err.message });
    }
});

// Download a file from backup
app.get('/api/backups/:folderName/download/:filename', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { folderName, filename } = req.params;
        const filePath = path.join(__dirname, 'uploads', 'backup', folderName, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found' });
        }

        res.download(filePath, filename);
    } catch (err) {
        console.error('❌ [Download Backup]: Error:', err);
        res.status(500).json({ message: 'Failed to download file', error: err.message });
    }
});

// Permanently delete a file from backup (Super Admin only)
app.delete('/api/backups/:folderName/files/:filename', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { folderName, filename } = req.params;
        const folderPath = path.join(__dirname, 'uploads', 'backup', folderName);
        const filePath = path.join(folderPath, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: 'File not found' });
        }

        fs.unlinkSync(filePath);

        // Update metadata
        const metadataPath = path.join(folderPath, 'metadata.json');
        if (fs.existsSync(metadataPath)) {
            try {
                const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                metadata.files = metadata.files.filter(f => f.filename !== filename);
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            } catch (e) {
                console.error('Error updating metadata:', e);
            }
        }

        console.log(`✅ Permanently deleted ${filename} from backup ${folderName} by ${req.user.name}`);
        res.json({ message: 'File permanently deleted' });
    } catch (err) {
        console.error('❌ [Delete Backup File]: Error:', err);
        res.status(500).json({ message: 'Failed to delete file', error: err.message });
    }
});

// Permanently delete entire backup folder (Super Admin only)
app.delete('/api/backups/:folderName', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const { folderName } = req.params;
        const folderPath = path.join(__dirname, 'uploads', 'backup', folderName);

        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ message: 'Backup folder not found' });
        }

        // Delete all files in folder
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            fs.unlinkSync(path.join(folderPath, file));
        }

        // Remove the folder
        fs.rmdirSync(folderPath);

        console.log(`✅ Permanently deleted backup folder ${folderName} by ${req.user.name}`);
        res.json({ message: 'Backup folder permanently deleted' });
    } catch (err) {
        console.error('❌ [Delete Backup Folder]: Error:', err);
        res.status(500).json({ message: 'Failed to delete backup folder', error: err.message });
    }
});

// Serve backup files (Super Admin only - protected route)
app.use('/api/backups/files', authMiddleware, requireRole(roles.SUPER_USER), express.static(path.join(__dirname, 'uploads', 'backup')));


// Update project status (Accessible by Team Members)
app.put('/api/projects/:projectId/status', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status } = req.body;

        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Check authorization: Super User or Team Member
        const isSuperUser = req.user.role === roles.SUPER_USER;
        const isTeamMember = project.teamIds.map(id => String(id)).includes(String(req.user._id));

        if (!isSuperUser && !isTeamMember) {
            return res.status(403).json({ message: 'Not authorized to update this project' });
        }

        if (status) {
            console.log(`Updating project ${projectId} status to ${status} by ${req.user.name}`);
            if (req.user.role === roles.MANAGER && status === 'COMPLETED') {
                project.status = 'WAITING_APPROVAL';
                // Notify Super Users
                const superUsers = await User.find({ role: roles.SUPER_USER });
                for (const admin of superUsers) {
                    await Notification.create({
                        recipientId: admin._id,
                        type: 'APPROVAL_REQUEST',
                        message: `Project [${project.projectCode}] marked as complete by Manager ${req.user.name}. Needs approval.`,
                        relatedId: project._id
                    });
                }
            }
            else if (req.user.role === roles.SUPER_USER && project.status === 'WAITING_APPROVAL') {
                project.status = status; // COMPLETED (Approve) or ACTIVE (Reject)
                if (project.managerId) {
                    const action = status === 'COMPLETED' ? 'approved' : 'returned';
                    await Notification.create({
                        recipientId: project.managerId,
                        type: 'PROJECT_UPDATE',
                        message: `Project [${project.projectCode}] completion was ${action} by Super Admin`,
                        relatedId: project._id
                    });
                }
            }
            else {
                project.status = status;
            }
            await project.save();
            await logActivity('PROJECT_UPDATED', `Project "${project.name}" status updated to ${status}`, req.user._id, req.user.name, project._id, project.name);
            res.json({ id: project._id, status: project.status });
        } else {
            res.status(400).json({ message: 'Status is required' });
        }

    } catch (err) {
        console.error('❌ [Update Project Status]: Error:', err);
        res.status(500).json({ message: 'Failed to update project status', error: err.message });
    }
});

// ============ TASK ROUTES ============
app.get('/api/projects/:projectId/tasks', authMiddleware, async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }
        const tasks = await Task.find({ projectId }).populate('assigneeId', 'name');
        res.json(tasks.map(t => ({
            id: t._id,
            title: t.title,
            description: t.description,
            status: t.status,
            projectId: t.projectId,
            assigneeId: t.assigneeId?._id,
            assigneeName: t.assigneeId?.name,
        })));
    } catch (err) {
        console.error('❌ [Load Tasks]: Error:', err);
        res.status(500).json({ message: 'Failed to load tasks', error: err.message });
    }
});

app.get('/api/tasks', authMiddleware, async (req, res) => {
    let query = {};
    if (req.user.role === roles.SUPER_USER) {
        // Super users see all tasks
    } else if (req.user.role === roles.MANAGER && req.user.department) {
        // Managers see tasks from projects in their department
        const deptProjects = await Project.find({ department: req.user.department }).select('_id');
        const projectIds = deptProjects.map(p => p._id);
        query.projectId = { $in: projectIds };
    } else {
        // Employees/Interns only see their own tasks
        query.assigneeId = req.user._id;
    }
    const tasks = await Task.find(query).populate('projectId', 'name projectCode');
    const isEmployeeOrIntern = [roles.EMPLOYEE, roles.INTERN].includes(req.user.role);

    res.json(tasks.map(t => ({
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        projectId: t.projectId?._id,
        projectName: isEmployeeOrIntern ? null : (t.projectId?.name || 'Unknown'),
        projectCode: t.projectId?.projectCode || null,
        assigneeId: t.assigneeId,
        // Deadline and performance fields
        assignedAt: t.assignedAt,
        deadline: t.deadline,
        completedAt: t.completedAt,
        allocatedMinutes: t.allocatedMinutes,
        actualMinutes: t.actualMinutes,
        performanceScore: t.performanceScore,
        comments: t.comments,
        queries: t.queries,
    })));
});

app.post('/api/tasks', authMiddleware, async (req, res) => {
    try {
        const { title, description, projectId, assigneeId, deadline } = req.body;
        console.log('Creating task:', { title, projectId, assigneeId, deadline });

        if (!title || !projectId) return res.status(400).json({ message: 'Title and projectId are required' });
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // If no assigneeId provided, assign to the creator
        const finalAssigneeId = assigneeId || req.user._id;

        // Set assignedAt if assignee is provided
        const assignedAt = finalAssigneeId ? new Date() : null;

        // Parse deadline if provided
        const deadlineDate = deadline ? new Date(deadline) : null;

        // Calculate allocated time in minutes if both are set
        let allocatedMinutes = null;
        if (assignedAt && deadlineDate) {
            allocatedMinutes = Math.round((deadlineDate.getTime() - assignedAt.getTime()) / (1000 * 60));
            if (allocatedMinutes < 0) allocatedMinutes = 0;
        }

        const task = await Task.create({
            title,
            description: description || '',
            projectId,
            assigneeId: finalAssigneeId,
            status: 'NOT_STARTED',
            createdBy: req.user._id,
            assignedAt,
            deadline: deadlineDate,
            allocatedMinutes,
        });

        // Auto-switch Project to ACTIVE if task is assigned
        if (finalAssigneeId) {
            const project = await Project.findById(projectId);
            if (project && project.status === 'PLANNING') {
                project.status = 'ACTIVE';
                await project.save();
                console.log(`✅ Project ${project.projectCode} auto-switched to ACTIVE upon task assignment.`);
            }
        }

        // Notify assignee about deadline if set
        if (finalAssigneeId && deadlineDate && finalAssigneeId.toString() !== req.user._id.toString()) {
            await Notification.create({
                recipientId: finalAssigneeId,
                type: 'TASK_ASSIGNMENT',
                message: `You have been assigned to task "${task.title}" with deadline: ${deadlineDate.toLocaleDateString()}`,
                relatedId: task._id
            });
        }

        console.log('✅ Task created:', task._id, 'assigned to:', finalAssigneeId, 'deadline:', deadlineDate);
        res.status(201).json({
            id: task._id,
            title: task.title,
            description: task.description,
            status: task.status,
            projectId: task.projectId,
            assigneeId: task.assigneeId,
            deadline: task.deadline,
            assignedAt: task.assignedAt,
            allocatedMinutes: task.allocatedMinutes
        });
    } catch (err) {
        console.error('❌ Error creating task:', err);
        res.status(500).json({ message: 'Failed to create task', error: err.message });
    }
});

// Get Single Task by ID
app.get('/api/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        if (!isValidObjectId(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Augment with project name
        const taskObj = task.toObject();
        if (task.projectId) {
            const project = await Project.findById(task.projectId);
            if (project) {
                taskObj.projectName = project.name;
            }
        }

        res.json(taskObj);
    } catch (err) {
        console.error('❌ [Fetch Task]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch task', error: err.message });
    }
});

// Update Task
app.put('/api/tasks/:taskId', authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        if (!isValidObjectId(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const { title, description, status, assigneeId, deadline } = req.body;
        console.log('Updating task:', taskId, { title, description, status, assigneeId, deadline });

        if (title) task.title = title;
        if (description !== undefined) task.description = description;

        // Handle deadline update
        if (deadline !== undefined) {
            task.deadline = deadline ? new Date(deadline) : null;
            // Recalculate allocated minutes if assignedAt exists
            if (task.assignedAt && task.deadline) {
                task.allocatedMinutes = Math.round((task.deadline.getTime() - task.assignedAt.getTime()) / (1000 * 60));
                if (task.allocatedMinutes < 0) task.allocatedMinutes = 0;
            }
        }

        if (status) {
            const isEmployeeOrIntern = [roles.EMPLOYEE, roles.INTERN].includes(req.user.role);
            const isManager = req.user.role === roles.MANAGER;
            const isSuperUser = req.user.role === roles.SUPER_USER;

            // Manager or Super User can directly update any status (no approval needed for them)
            if (isManager || isSuperUser) {
                // If approving an employee's waiting task, send notification
                if (task.status === 'WAITING_APPROVAL' && task.assigneeId) {
                    const action = status === 'COMPLETED' ? 'approved' : 'returned for revision';
                    await Notification.create({
                        recipientId: task.assigneeId,
                        type: 'TASK_UPDATE',
                        message: `Your task "${task.title}" was ${action} by ${isSuperUser ? 'Admin' : 'Manager'}`,
                        relatedId: task._id
                    });
                }
                task.status = status;
            }
            // Employee/Intern requesting approval (sends WAITING_APPROVAL or COMPLETED)
            else if (isEmployeeOrIntern && (status === 'WAITING_APPROVAL' || status === 'COMPLETED')) {
                task.status = 'WAITING_APPROVAL';
                const project = await Project.findById(task.projectId);
                if (project && project.managerId) {
                    await Notification.create({
                        recipientId: project.managerId,
                        type: 'APPROVAL_REQUEST',
                        message: `${req.user.name} requested approval for task "${task.title}"`,
                        relatedId: task._id
                    });
                }
            }
            // Standard update (Employee/Intern changing to NOT_STARTED or IN_PROGRESS)
            else {
                task.status = status;
            }
        }
        if (assigneeId !== undefined) {
            // Check if assignee changed or newly assigned
            const wasUnassigned = !task.assigneeId;
            const isUnassigning = !assigneeId; // Setting assigneeId to null
            const isNewAssignment = wasUnassigned && assigneeId;
            const isReassignment = task.assigneeId && assigneeId && task.assigneeId.toString() !== assigneeId;

            if (isUnassigning) {
                // Unassigning the task - clear assignment data but keep deadline
                console.log(`Unassigning task ${taskId}`);
                task.assignedAt = null;
                task.allocatedMinutes = null;
                task.actualMinutes = null;
                task.performanceScore = null;
                task.completedAt = null;
            } else if (isReassignment) {
                // Reset assignment time on reassignment
                task.assignedAt = new Date();
                await Notification.create({
                    recipientId: assigneeId,
                    type: 'TASK_ASSIGNMENT',
                    message: `You have been assigned to task "${task.title}"${task.deadline ? ` with deadline: ${task.deadline.toLocaleDateString()}` : ''}`,
                    relatedId: task._id
                });
            } else if (isNewAssignment) {
                // First time assignment - set start date
                task.assignedAt = new Date();
                await Notification.create({
                    recipientId: assigneeId,
                    type: 'TASK_ASSIGNMENT',
                    message: `You have been assigned to task "${task.title}"${task.deadline ? ` with deadline: ${task.deadline.toLocaleDateString()}` : ''}`,
                    relatedId: task._id
                });
            }

            task.assigneeId = assigneeId;

            // Recalculate allocated minutes if assignedAt and deadline exist
            if (task.assignedAt && task.deadline) {
                task.allocatedMinutes = Math.round((task.deadline.getTime() - task.assignedAt.getTime()) / (1000 * 60));
                if (task.allocatedMinutes < 0) task.allocatedMinutes = 0;
            }
        }

        // Performance Calculation Logic
        if (task.status === 'COMPLETED') {
            if (!task.completedAt) task.completedAt = new Date();

            if (task.assignedAt) {
                const actualMinutes = Math.round((task.completedAt.getTime() - task.assignedAt.getTime()) / (1000 * 60));
                task.actualMinutes = actualMinutes > 0 ? actualMinutes : 1; // Minimum 1 minute

                if (task.allocatedMinutes !== null && task.allocatedMinutes !== undefined) {
                    task.performanceScore = Math.round((task.allocatedMinutes / task.actualMinutes) * 100);
                }
            }
        } else {
            // If task is not completed (reopened), clear completion data
            // But preserve assignedAt/allocatedMinutes as it's still assigned
            task.completedAt = null;
            task.actualMinutes = null;
            task.performanceScore = null;
        }

        await task.save();
        console.log('Task updated successfully:', task._id);

        // Auto-update project status based on task completion
        if (task.projectId) {
            const allProjectTasks = await Task.find({ projectId: task.projectId });
            const totalTasks = allProjectTasks.length;
            const completedTasks = allProjectTasks.filter(t => t.status === 'COMPLETED').length;
            const inProgressTasks = allProjectTasks.filter(t => t.status === 'IN_PROGRESS').length;

            console.log('Task stats after update:', { totalTasks, completedTasks, inProgressTasks });

            const project = await Project.findById(task.projectId);
            if (project && project.status !== 'COMPLETED' && project.status !== 'WAITING_APPROVAL') {
                if (totalTasks > 0 && completedTasks === totalTasks) {
                    // All tasks completed - mark project as WAITING_APPROVAL for Super Admin
                    project.status = 'WAITING_APPROVAL';
                    await project.save();
                    console.log('✅ Project auto-updated to WAITING_APPROVAL:', project._id);

                    // Notify all Super Admins about project completion approval
                    const superAdmins = await User.find({ role: roles.SUPER_USER });
                    for (const admin of superAdmins) {
                        await Notification.create({
                            recipientId: admin._id,
                            type: 'APPROVAL_REQUEST',
                            message: `Project [${project.projectCode}] completed all tasks. Awaiting your approval to mark as completed.`,
                            relatedId: project._id
                        });
                    }
                } else if (inProgressTasks > 0 && project.status === 'PLANNING') {
                    // At least one task in progress - mark project as ACTIVE
                    project.status = 'ACTIVE';
                    await project.save();
                    console.log('✅ Project auto-updated to ACTIVE:', project._id);
                }
            }
        }

        res.json({ id: task._id, title: task.title, description: task.description, status: task.status, projectId: task.projectId, assigneeId: task.assigneeId });
    } catch (err) {
        console.error('❌ [Update Task]: Error:', err);
        res.status(500).json({ message: 'Failed to update task', error: err.message });
    }
});

// Quick status update endpoint
app.put('/api/tasks/:taskId/status', authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        if (!isValidObjectId(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const { status } = req.body;
        if (!status || !['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'WAITING_APPROVAL', 'ON_HOLD'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        console.log('Updating task status:', taskId, status);

        const isEmployeeOrIntern = [roles.EMPLOYEE, roles.INTERN].includes(req.user.role);
        const isManager = req.user.role === roles.MANAGER;
        const isSuperUser = req.user.role === roles.SUPER_USER;
        let isApprovalFlow = false;

        // Manager or Super User can directly update any status (no approval needed for them)
        if (isManager || isSuperUser) {
            // If approving an employee's waiting task, send notification
            if (task.status === 'WAITING_APPROVAL' && task.assigneeId) {
                isApprovalFlow = true;
                const action = status === 'COMPLETED' ? 'approved' : 'returned for revision';
                await Notification.create({
                    recipientId: task.assigneeId,
                    type: 'TASK_UPDATE',
                    message: `Your task "${task.title}" was ${action} by ${isSuperUser ? 'Admin' : 'Manager'}`,
                    relatedId: task._id
                });
            }
            task.status = status;
        }
        // Employee/Intern requesting approval (sends WAITING_APPROVAL or COMPLETED)
        else if (isEmployeeOrIntern && (status === 'WAITING_APPROVAL' || status === 'COMPLETED')) {
            task.status = 'WAITING_APPROVAL';
            isApprovalFlow = true;
            const project = await Project.findById(task.projectId);
            if (project && project.managerId) {
                await Notification.create({
                    recipientId: project.managerId,
                    type: 'APPROVAL_REQUEST',
                    message: `${req.user.name} requested approval for task "${task.title}"`,
                    relatedId: task._id
                });
            }
        }
        // Standard update (Employee/Intern changing to NOT_STARTED or IN_PROGRESS)
        else {
            task.status = status;
        }

        // Calculate performance when task is marked COMPLETED
        if (task.status === 'COMPLETED' && !task.completedAt) {
            task.completedAt = new Date();

            // Calculate actual time taken (in minutes)
            if (task.assignedAt) {
                task.actualMinutes = Math.round((task.completedAt.getTime() - task.assignedAt.getTime()) / (1000 * 60));
                if (task.actualMinutes < 1) task.actualMinutes = 1; // Minimum 1 minute

                // Calculate performance score: (allocated / actual) * 100
                if (task.allocatedMinutes && task.allocatedMinutes > 0) {
                    task.performanceScore = Math.round((task.allocatedMinutes / task.actualMinutes) * 100);
                    console.log(`📊 Performance calculated for task ${task._id}: ${task.performanceScore}% (${task.allocatedMinutes}min allocated / ${task.actualMinutes}min actual)`);
                }
            }
        }

        // Reset performance data if task is reopened (moved back from COMPLETED)
        if (task.status !== 'COMPLETED' && task.completedAt) {
            task.completedAt = null;
            task.actualMinutes = null;
            task.performanceScore = null;
        }

        await task.save();
        console.log('Task status updated successfully');

        // Notify Manager about status update (ONLY if not handled by approval flow)
        if (!isApprovalFlow && task.projectId) {
            const project = await Project.findById(task.projectId);
            if (project && project.managerId) {
                await Notification.create({
                    recipientId: project.managerId,
                    type: 'STATUS_UPDATE',
                    message: `Task "${task.title}" status updated to ${status.replace('_', ' ')}`,
                    relatedId: task.projectId
                });
            }
        }

        // Auto-update project status based on task completion
        let projectStatus = null;
        if (task.projectId) {
            console.log('Checking project tasks for projectId:', task.projectId);
            const allProjectTasks = await Task.find({ projectId: task.projectId });
            const totalTasks = allProjectTasks.length;
            const completedTasks = allProjectTasks.filter(t => t.status === 'COMPLETED').length;
            const inProgressTasks = allProjectTasks.filter(t => t.status === 'IN_PROGRESS').length;

            console.log('Task stats:', { totalTasks, completedTasks, inProgressTasks });

            const project = await Project.findById(task.projectId);
            if (project) {
                console.log('Current project status:', project.status);
                projectStatus = project.status;

                if (project.status !== 'COMPLETED' && project.status !== 'WAITING_APPROVAL') {
                    if (totalTasks > 0 && completedTasks === totalTasks) {
                        // All tasks completed - mark project as WAITING_APPROVAL for Super Admin
                        project.status = 'WAITING_APPROVAL';
                        await project.save();
                        projectStatus = 'WAITING_APPROVAL';
                        console.log('✅ Project auto-updated to WAITING_APPROVAL:', project._id);

                        // Notify all Super Admins about project completion approval
                        const superAdmins = await User.find({ role: roles.SUPER_USER });
                        for (const admin of superAdmins) {
                            await Notification.create({
                                recipientId: admin._id,
                                type: 'APPROVAL_REQUEST',
                                message: `Project [${project.projectCode}] completed all tasks. Awaiting your approval to mark as completed.`,
                                relatedId: project._id
                            });
                        }
                    } else if (inProgressTasks > 0 && project.status === 'PLANNING') {
                        // At least one task in progress - mark project as ACTIVE
                        project.status = 'ACTIVE';
                        await project.save();
                        projectStatus = 'ACTIVE';
                        console.log('✅ Project auto-updated to ACTIVE:', project._id);
                    }
                }
            } else {
                console.log('Project not found for ID:', task.projectId);
            }
        } else {
            console.log('Task has no projectId');
        }

        res.json({ id: task._id, status: task.status, projectStatus });
    } catch (err) {
        console.error('❌ [Update Task Status]: Error:', err);
        res.status(500).json({ message: 'Failed to update task status', error: err.message });
    }
});

app.post('/api/tasks/:taskId/transfer', authMiddleware, requireRole(roles.EMPLOYEE), async (req, res) => {
    try {
        const { taskId } = req.params;
        if (!isValidObjectId(taskId)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const { newAssigneeId } = req.body;
        console.log('Transferring task:', taskId, 'to:', newAssigneeId);

        if (!newAssigneeId) return res.status(400).json({ message: 'New assignee ID is required' });
        if (!isValidObjectId(newAssigneeId)) {
            return res.status(400).json({ message: 'Invalid assignee ID' });
        }

        const newAssignee = await User.findById(newAssigneeId);
        if (!newAssignee) {
            return res.status(404).json({ message: 'Assignee not found' });
        }
        if (newAssignee.role !== roles.INTERN) {
            return res.status(400).json({ message: 'Can only transfer to interns' });
        }

        task.assigneeId = newAssigneeId;
        await task.save();
        console.log('Task transferred successfully to:', newAssignee.name);
        await logActivity('TASK_TRANSFERRED', `Task "${task.title}" transferred to ${newAssignee.name}`, req.user._id, req.user.name, task._id, task.title);
        res.json({ message: 'Task transferred successfully' });
    } catch (err) {
        console.error('❌ [Transfer Task]: Error:', err);
        res.status(500).json({ message: 'Failed to transfer task', error: err.message });
    }
});

// ============ WORK UPDATES & QUERIES ============

// Add Work Update (Comment)
app.post('/api/tasks/:taskId/comments', authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { text } = req.body;
        if (!text) return res.status(400).json({ message: 'Comment text is required' });

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        task.comments.push({
            userId: req.user._id,
            userName: req.user.name,
            text,
            createdAt: new Date()
        });
        await task.save();

        // Notify Manager of Work Update
        if (task.projectId) {
            const project = await Project.findById(task.projectId);
            if (project && project.managerId && project.managerId.toString() !== req.user._id.toString()) {
                await Notification.create({
                    recipientId: project.managerId,
                    type: 'TASK_UPDATE',
                    message: `${req.user.name} posted a work update on task: ${task.title}`,
                    relatedId: task._id
                });
            }
        }

        res.status(201).json(task.comments[task.comments.length - 1]);
    } catch (err) {
        console.error('❌ [Add Comment]: Error:', err);
        res.status(500).json({ message: 'Failed to add comment', error: err.message });
    }
});

// Raise Query
app.post('/api/tasks/:taskId/queries', authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { question } = req.body;
        if (!question) return res.status(400).json({ message: 'Question is required' });

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        task.queries.push({
            userId: req.user._id,
            userName: req.user.name,
            question,
            status: 'PENDING',
            createdAt: new Date()
        });
        await task.save();

        // Notify Manager
        if (task.projectId) {
            const project = await Project.findById(task.projectId);
            if (project && project.managerId) {
                await Notification.create({
                    recipientId: project.managerId,
                    message: `New query raised by ${req.user.name} on task: ${task.title}`,
                    type: 'QUERY_RAISED',
                    relatedId: task._id
                });
            }
        }

        res.status(201).json(task.queries[task.queries.length - 1]);
    } catch (err) {
        console.error('❌ [Raise Query]: Error:', err);
        res.status(500).json({ message: 'Failed to raise query', error: err.message });
    }
});

// Respond to Query
app.put('/api/tasks/:taskId/queries/:queryId/respond', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER), async (req, res) => {
    try {
        const { taskId, queryId } = req.params;
        const { response } = req.body;

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const query = task.queries.id(queryId);
        if (!query) {
            console.log(`Query not found: ${queryId} in task ${taskId}. Existing queries:`, task.queries.map(q => q._id));
            return res.status(404).json({ message: 'Query not found' });
        }

        query.response = response;
        query.responseBy = req.user._id;
        query.status = 'RESOLVED';
        query.resolvedAt = new Date();

        await task.save();

        // Notify Assignee (Intern/Employee)
        if (task.assigneeId) {
            await Notification.create({
                recipientId: task.assigneeId,
                message: `Query resolved by ${req.user.name} for task: ${task.title}`,
                type: 'QUERY_RESOLVED',
                relatedId: task._id
            });
        }

        res.json(query);
    } catch (err) {
        console.error('❌ [Respond Query]: Error:', err);
        res.status(500).json({ message: 'Failed to respond to query', error: err.message });
    }
});

// Project Status Manual Update (Manager override)
app.put('/api/projects/:projectId/status', authMiddleware, requireRole(roles.SUPER_USER, roles.MANAGER), async (req, res) => {
    try {
        const { projectId } = req.params;
        const { status } = req.body;
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const allowedStatuses = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];
        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        project.status = status;
        await project.save();

        await logActivity('PROJECT_STATUS_UPDATED', `Project ${project.name} status updated to ${status}`, req.user._id, req.user.name, project._id, project.name);

        res.json({ id: project._id, status: project.status });
    } catch (err) {
        console.error('❌ [Update Project Status]: Error:', err);
        res.status(500).json({ message: 'Failed to update status', error: err.message });
    }
});

// ============ ACTIVITY ROUTES ============
app.get('/api/activity-logs', authMiddleware, requireRole(roles.SUPER_USER), async (req, res) => {
    try {
        const activities = await Activity.find().sort({ timestamp: -1 }).limit(50);
        res.json(activities.map(a => ({
            id: a._id,
            action: a.message || a.type,
            details: a.targetName || '',
            userName: a.userName,
            type: a.type,
            createdAt: a.timestamp,
        })));
    } catch (err) {
        console.error('❌ [Load Activity Logs]: Error:', err);
        res.status(500).json({ message: 'Failed to load activity logs', error: err.message });
    }
});

app.get('/api/activities', authMiddleware, async (req, res) => {
    try {
        let query = {};
        if (req.user.role !== roles.SUPER_USER) {
            query.userId = req.user._id;
        }
        const activities = await Activity.find(query).sort({ timestamp: -1 }).limit(20);
        res.json(activities.map(a => ({
            id: a._id,
            action: a.message || a.type,
            details: a.targetName || '',
            userName: a.userName,
            type: a.type,
            createdAt: a.timestamp,
        })));
    } catch (err) {
        console.error('❌ [Load Activities]: Error:', err);
        res.status(500).json({ message: 'Failed to load activities', error: err.message });
    }
});

// ============ STOCK MANAGEMENT ROUTES ============

// -------- Product Routes --------
// Get all products with filters
app.get('/api/stock/products', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { category, status, search, lowStock } = req.query;
        let query = {};

        if (category && category !== 'ALL') {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { partNumber: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (lowStock === 'true') {
            query.$expr = { $lte: ['$quantity', '$minQuantity'] };
        }

        const products = await Product.find(query).populate('supplier', 'name').sort({ createdAt: -1 });

        res.json(products.map(p => ({
            id: p._id,
            partNumber: p.partNumber,
            name: p.name,
            category: p.category,
            description: p.description,
            specifications: p.specifications,
            quantity: p.quantity,
            minQuantity: p.minQuantity,
            maxQuantity: p.maxQuantity,
            reorderPoint: p.reorderPoint,
            unitPrice: p.unitPrice,
            totalValue: p.totalValue,
            stockStatus: p.stockStatus,
            supplier: p.supplier ? { id: p.supplier._id, name: p.supplier.name } : null,
            location: p.location,
            lastRestocked: p.lastRestocked,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
        })));
    } catch (err) {
        console.error('❌ [Load Products]: Error:', err);
        res.status(500).json({ message: 'Failed to load products', error: err.message });
    }
});

// Get product statistics
app.get('/api/stock/products/stats', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const totalItems = await Product.countDocuments();
        const products = await Product.find();

        let totalValue = 0;
        let lowStock = 0;
        let outOfStock = 0;

        products.forEach(p => {
            totalValue += p.totalValue;
            if (p.quantity === 0) outOfStock++;
            else if (p.quantity <= p.minQuantity) lowStock++;
        });

        const issuedItems = await IssuedItem.countDocuments({ status: 'ISSUED' });

        res.json({
            totalItems,
            totalValue: Math.round(totalValue),
            lowStock,
            outOfStock,
            issuedItems,
        });
    } catch (err) {
        console.error('❌ [Load Stats]: Error:', err);
        res.status(500).json({ message: 'Failed to load statistics', error: err.message });
    }
});

// Create product
app.post('/api/stock/products', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { partNumber, name, category, description, specifications, quantity, minQuantity, maxQuantity, reorderPoint, unitPrice, supplier, location } = req.body;

        if (!partNumber || !name || !category) {
            return res.status(400).json({ message: 'Part number, name, and category are required' });
        }

        const existing = await Product.findOne({ partNumber: partNumber.toUpperCase() });
        if (existing) {
            return res.status(400).json({ message: 'Part number already exists' });
        }

        const product = await Product.create({
            partNumber: partNumber.toUpperCase(),
            name,
            category,
            description: description || '',
            specifications: specifications || {},
            quantity: quantity || 0,
            minQuantity: minQuantity || 10,
            maxQuantity: maxQuantity || 1000,
            reorderPoint: reorderPoint || 20,
            unitPrice: unitPrice || 0,
            supplier: supplier || null,
            location: location || '',
            createdBy: req.user._id,
        });

        await logActivity('PRODUCT_CREATED', `Product ${name} (${partNumber}) was added to inventory`, req.user._id, req.user.name, product._id, name);

        res.status(201).json({
            id: product._id,
            partNumber: product.partNumber,
            name: product.name,
            message: 'Product created successfully',
        });
    } catch (err) {
        console.error('❌ [Create Product]: Error:', err);
        res.status(500).json({ message: 'Failed to create product', error: err.message });
    }
});

// Update product
app.put('/api/stock/products/:id', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const { name, category, description, specifications, quantity, minQuantity, maxQuantity, reorderPoint, unitPrice, supplier, location } = req.body;

        if (name) product.name = name;
        if (category) product.category = category;
        if (description !== undefined) product.description = description;
        if (specifications !== undefined) product.specifications = specifications;
        if (quantity !== undefined) {
            product.quantity = quantity;
            product.lastRestocked = new Date();
        }
        if (minQuantity !== undefined) product.minQuantity = minQuantity;
        if (maxQuantity !== undefined) product.maxQuantity = maxQuantity;
        if (reorderPoint !== undefined) product.reorderPoint = reorderPoint;
        if (unitPrice !== undefined) product.unitPrice = unitPrice;
        if (supplier !== undefined) product.supplier = supplier;
        if (location !== undefined) product.location = location;

        await product.save();
        res.json({ message: 'Product updated successfully', id: product._id });
    } catch (err) {
        console.error('❌ [Update Product]: Error:', err);
        res.status(500).json({ message: 'Failed to update product', error: err.message });
    }
});

// Delete product
app.delete('/api/stock/products/:id', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid product ID' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        // Check if product is issued
        const issuedCount = await IssuedItem.countDocuments({ product: product._id, status: 'ISSUED' });
        if (issuedCount > 0) {
            return res.status(400).json({ message: 'Cannot delete product with issued items' });
        }

        await Product.deleteOne({ _id: product._id });
        res.json({ message: 'Product deleted successfully' });
    } catch (err) {
        console.error('❌ [Delete Product]: Error:', err);
        res.status(500).json({ message: 'Failed to delete product', error: err.message });
    }
});

// -------- Supplier Routes --------
// Get all suppliers
app.get('/api/stock/suppliers', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const suppliers = await Supplier.find().sort({ name: 1 });
        res.json(suppliers.map(s => ({
            id: s._id,
            name: s.name,
            contactPerson: s.contactPerson,
            email: s.email,
            phone: s.phone,
            address: s.address,
            city: s.city,
            country: s.country,
            paymentTerms: s.paymentTerms,
            deliveryTime: s.deliveryTime,
            rating: s.rating,
            isActive: s.isActive,
            notes: s.notes,
        })));
    } catch (err) {
        console.error('❌ [Load Suppliers]: Error:', err);
        res.status(500).json({ message: 'Failed to load suppliers', error: err.message });
    }
});

// Create supplier
app.post('/api/stock/suppliers', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { name, contactPerson, email, phone, address, city, country, paymentTerms, deliveryTime, rating, notes } = req.body;

        if (!name || !contactPerson || !email || !phone) {
            return res.status(400).json({ message: 'Name, contact person, email, and phone are required' });
        }

        const supplier = await Supplier.create({
            name,
            contactPerson,
            email,
            phone,
            address: address || '',
            city: city || '',
            country: country || 'India',
            paymentTerms: paymentTerms || 'Net 30',
            deliveryTime: deliveryTime || '7-14 days',
            rating: rating || 0,
            notes: notes || '',
            createdBy: req.user._id,
        });

        res.status(201).json({ id: supplier._id, name: supplier.name, message: 'Supplier created successfully' });
    } catch (err) {
        console.error('❌ [Create Supplier]: Error:', err);
        res.status(500).json({ message: 'Failed to create supplier', error: err.message });
    }
});

// Update supplier
app.put('/api/stock/suppliers/:id', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid supplier ID' });
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        const { name, contactPerson, email, phone, address, city, country, paymentTerms, deliveryTime, rating, isActive, notes } = req.body;

        if (name) supplier.name = name;
        if (contactPerson) supplier.contactPerson = contactPerson;
        if (email) supplier.email = email;
        if (phone) supplier.phone = phone;
        if (address !== undefined) supplier.address = address;
        if (city !== undefined) supplier.city = city;
        if (country !== undefined) supplier.country = country;
        if (paymentTerms !== undefined) supplier.paymentTerms = paymentTerms;
        if (deliveryTime !== undefined) supplier.deliveryTime = deliveryTime;
        if (rating !== undefined) supplier.rating = rating;
        if (isActive !== undefined) supplier.isActive = isActive;
        if (notes !== undefined) supplier.notes = notes;

        await supplier.save();
        res.json({ message: 'Supplier updated successfully' });
    } catch (err) {
        console.error('❌ [Update Supplier]: Error:', err);
        res.status(500).json({ message: 'Failed to update supplier', error: err.message });
    }
});

// Delete supplier
app.delete('/api/stock/suppliers/:id', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid supplier ID' });
        }

        const supplier = await Supplier.findById(req.params.id);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        // Check if supplier has products
        const productCount = await Product.countDocuments({ supplier: supplier._id });
        if (productCount > 0) {
            return res.status(400).json({ message: `Cannot delete supplier with ${productCount} associated products` });
        }

        await Supplier.deleteOne({ _id: supplier._id });
        res.json({ message: 'Supplier deleted successfully' });
    } catch (err) {
        console.error('❌ [Delete Supplier]: Error:', err);
        res.status(500).json({ message: 'Failed to delete supplier', error: err.message });
    }
});

// -------- Issue/Return Routes --------
// Issue product to employee
app.post('/api/stock/issue', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { productId, quantity, employeeId, projectId, purpose, expectedReturnDate } = req.body;

        if (!productId || !quantity || !employeeId) {
            return res.status(400).json({ message: 'Product, quantity, and employee are required' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        if (product.quantity < quantity) {
            return res.status(400).json({ message: `Insufficient stock. Available: ${product.quantity}` });
        }

        const employee = await User.findById(employeeId);
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        // Create issued item record
        const issuedItem = await IssuedItem.create({
            product: product._id,
            productName: product.name,
            partNumber: product.partNumber,
            quantity,
            employee: employee._id,
            employeeName: employee.name,
            project: projectId || null,
            purpose: purpose || '',
            expectedReturnDate: expectedReturnDate || null,
            issuedBy: req.user._id,
        });

        // Update product quantity
        product.quantity -= quantity;
        await product.save();

        await logActivity('ITEM_ISSUED', `${quantity}x ${product.name} issued to ${employee.name}`, req.user._id, req.user.name, product._id, product.name);

        res.status(201).json({ message: 'Product issued successfully', id: issuedItem._id });
    } catch (err) {
        console.error('❌ [Issue Product]: Error:', err);
        res.status(500).json({ message: 'Failed to issue product', error: err.message });
    }
});

// Get all issued items
app.get('/api/stock/issued', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { status, employeeId } = req.query;
        let query = {};

        if (status && status !== 'ALL') {
            query.status = status;
        }

        if (employeeId) {
            query.employee = employeeId;
        }

        const issuedItems = await IssuedItem.find(query)
            .populate('employee', 'name employeeId')
            .populate('project', 'name')
            .sort({ issueDate: -1 });

        // Check and update overdue status
        for (let item of issuedItems) {
            if (item.checkOverdue()) {
                await item.save();
            }
        }

        res.json(issuedItems.map(item => ({
            id: item._id,
            product: { id: item.product, name: item.productName, partNumber: item.partNumber },
            quantity: item.quantity,
            employee: { id: item.employee._id, name: item.employee.name, employeeId: item.employee.employeeId },
            project: item.project ? { id: item.project._id, name: item.project.name } : null,
            purpose: item.purpose,
            status: item.status,
            issueDate: item.issueDate,
            expectedReturnDate: item.expectedReturnDate,
            actualReturnDate: item.actualReturnDate,
            returnedQuantity: item.returnedQuantity,
            condition: item.condition,
            returnNotes: item.returnNotes,
        })));
    } catch (err) {
        console.error('❌ [Load Issued Items]: Error:', err);
        res.status(500).json({ message: 'Failed to load issued items', error: err.message });
    }
});

// Return issued product
app.post('/api/stock/return/:id', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid issued item ID' });
        }

        const issuedItem = await IssuedItem.findById(req.params.id);
        if (!issuedItem) {
            return res.status(404).json({ message: 'Issued item not found' });
        }

        if (issuedItem.status === 'RETURNED') {
            return res.status(400).json({ message: 'Item already returned' });
        }

        const { returnedQuantity, condition, returnNotes } = req.body;

        const qtyToReturn = returnedQuantity || issuedItem.quantity;

        if (qtyToReturn > issuedItem.quantity) {
            return res.status(400).json({ message: 'Return quantity exceeds issued quantity' });
        }

        // Update issued item
        issuedItem.status = 'RETURNED';
        issuedItem.actualReturnDate = new Date();
        issuedItem.returnedQuantity = qtyToReturn;
        issuedItem.condition = condition || 'GOOD';
        issuedItem.returnNotes = returnNotes || '';
        await issuedItem.save();

        // Update product quantity (only if condition is GOOD)
        if (condition === 'GOOD' || !condition) {
            const product = await Product.findById(issuedItem.product);
            if (product) {
                product.quantity += qtyToReturn;
                await product.save();
            }
        }

        await logActivity('ITEM_RETURNED', `${qtyToReturn}x ${issuedItem.productName} returned by ${issuedItem.employeeName}`, req.user._id, req.user.name, issuedItem.product, issuedItem.productName);

        res.json({ message: 'Product returned successfully' });
    } catch (err) {
        console.error('❌ [Return Product]: Error:', err);
        res.status(500).json({ message: 'Failed to return product', error: err.message });
    }
});

// -------- Purchase Order Routes --------
// Get all purchase orders
app.get('/api/stock/purchase-orders', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};

        if (status && status !== 'ALL') {
            query.status = status;
        }

        const purchaseOrders = await PurchaseOrder.find(query)
            .populate('supplier', 'name contactPerson')
            .populate('createdBy', 'name')
            .sort({ orderDate: -1 });

        res.json(purchaseOrders.map(po => ({
            id: po._id,
            poNumber: po.poNumber,
            supplier: { id: po.supplier._id, name: po.supplier.name, contactPerson: po.supplier.contactPerson },
            items: po.items,
            totalAmount: po.totalAmount,
            status: po.status,
            orderDate: po.orderDate,
            expectedDelivery: po.expectedDelivery,
            actualDelivery: po.actualDelivery,
            notes: po.notes,
            createdBy: po.createdBy.name,
            createdAt: po.createdAt,
        })));
    } catch (err) {
        console.error('❌ [Load Purchase Orders]: Error:', err);
        res.status(500).json({ message: 'Failed to load purchase orders', error: err.message });
    }
});

// Create purchase order
app.post('/api/stock/purchase-orders', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { supplierId, items, expectedDelivery, notes } = req.body;

        if (!supplierId || !items || items.length === 0) {
            return res.status(400).json({ message: 'Supplier and items are required' });
        }

        const supplier = await Supplier.findById(supplierId);
        if (!supplier) {
            return res.status(404).json({ message: 'Supplier not found' });
        }

        // Validate and enrich items
        const enrichedItems = [];
        let totalAmount = 0;

        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({ message: `Product ${item.productId} not found` });
            }

            const itemTotal = item.quantity * item.unitPrice;
            totalAmount += itemTotal;

            enrichedItems.push({
                product: product._id,
                productName: product.name,
                partNumber: product.partNumber,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: itemTotal,
            });
        }

        const purchaseOrder = await PurchaseOrder.create({
            supplier: supplier._id,
            items: enrichedItems,
            totalAmount,
            status: 'DRAFT',
            expectedDelivery: expectedDelivery || null,
            notes: notes || '',
            createdBy: req.user._id,
        });

        await logActivity('PO_CREATED', `Purchase order ${purchaseOrder.poNumber} created for ${supplier.name}`, req.user._id, req.user.name, purchaseOrder._id, purchaseOrder.poNumber);

        res.status(201).json({ message: 'Purchase order created successfully', id: purchaseOrder._id, poNumber: purchaseOrder.poNumber });
    } catch (err) {
        console.error('❌ [Create Purchase Order]: Error:', err);
        res.status(500).json({ message: 'Failed to create purchase order', error: err.message });
    }
});

// Update purchase order status
app.put('/api/stock/purchase-orders/:id', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid purchase order ID' });
        }

        const purchaseOrder = await PurchaseOrder.findById(req.params.id);
        if (!purchaseOrder) {
            return res.status(404).json({ message: 'Purchase order not found' });
        }

        const { status, notes } = req.body;

        if (status) {
            purchaseOrder.status = status;

            if (status === 'APPROVED') {
                purchaseOrder.approvedBy = req.user._id;
                purchaseOrder.approvedAt = new Date();
            }
        }

        if (notes !== undefined) {
            purchaseOrder.notes = notes;
        }

        await purchaseOrder.save();
        res.json({ message: 'Purchase order updated successfully' });
    } catch (err) {
        console.error('❌ [Update Purchase Order]: Error:', err);
        res.status(500).json({ message: 'Failed to update purchase order', error: err.message });
    }
});

// Receive purchase order (update stock)
app.post('/api/stock/purchase-orders/:id/receive', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid purchase order ID' });
        }

        const purchaseOrder = await PurchaseOrder.findById(req.params.id);
        if (!purchaseOrder) {
            return res.status(404).json({ message: 'Purchase order not found' });
        }

        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({ message: 'Purchase order already received' });
        }

        // Update stock for each item
        for (const item of purchaseOrder.items) {
            const product = await Product.findById(item.product);
            if (product) {
                product.quantity += item.quantity;
                product.lastRestocked = new Date();
                await product.save();
            }
        }

        purchaseOrder.status = 'RECEIVED';
        purchaseOrder.actualDelivery = new Date();
        await purchaseOrder.save();

        await logActivity('PO_RECEIVED', `Purchase order ${purchaseOrder.poNumber} received and stock updated`, req.user._id, req.user.name, purchaseOrder._id, purchaseOrder.poNumber);

        res.json({ message: 'Purchase order received and stock updated successfully' });
    } catch (err) {
        console.error('❌ [Receive Purchase Order]: Error:', err);
        res.status(500).json({ message: 'Failed to receive purchase order', error: err.message });
    }
});

// -------- Excel Import Routes --------
// Upload and import Excel file
app.post('/api/stock/import/excel', authMiddleware, requireRole(roles.STOCK_ADMIN), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(worksheet);

        if (data.length === 0) {
            fs.unlinkSync(req.file.path); // Clean up uploaded file
            return res.status(400).json({ message: 'Excel file is empty' });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [],
        };

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            try {
                // Map Excel columns to database fields
                const partNumber = row['Part Number'] || row['PartNumber'] || row['partNumber'];
                const name = row['Name'] || row['name'];
                const category = row['Category'] || row['category'];
                const quantity = parseInt(row['Quantity'] || row['quantity'] || 0);
                const unitPrice = parseFloat(row['Unit Price'] || row['UnitPrice'] || row['unitPrice'] || 0);
                const minQuantity = parseInt(row['Min Quantity'] || row['MinQuantity'] || row['minQuantity'] || 10);
                const description = row['Description'] || row['description'] || '';
                const specifications = row['Specifications'] || row['specifications'] || '';

                if (!partNumber || !name || !category) {
                    results.errors.push({ row: i + 2, error: 'Missing required fields (Part Number, Name, Category)' });
                    results.failed++;
                    continue;
                }

                // Check if product already exists
                const existing = await Product.findOne({ partNumber: partNumber.toString().toUpperCase() });
                if (existing) {
                    results.errors.push({ row: i + 2, error: `Part number ${partNumber} already exists` });
                    results.failed++;
                    continue;
                }

                // Parse specifications if it's a string
                let specsMap = {};
                if (specifications && typeof specifications === 'string') {
                    specifications.split(',').forEach(spec => {
                        const [key, value] = spec.split(':').map(s => s.trim());
                        if (key && value) {
                            specsMap[key] = value;
                        }
                    });
                }

                await Product.create({
                    partNumber: partNumber.toString().toUpperCase(),
                    name,
                    category: category.toUpperCase().replace(/\s+/g, '_'),
                    description,
                    specifications: specsMap,
                    quantity,
                    minQuantity,
                    unitPrice,
                    createdBy: req.user._id,
                });

                results.success++;
            } catch (err) {
                results.errors.push({ row: i + 2, error: err.message });
                results.failed++;
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        await logActivity('EXCEL_IMPORT', `Imported ${results.success} products from Excel`, req.user._id, req.user.name, null, null);

        res.json({
            message: `Import completed: ${results.success} products imported, ${results.failed} failed`,
            results,
        });
    } catch (err) {
        console.error('❌ [Import Excel]: Error:', err);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ message: 'Failed to import Excel file', error: err.message });
    }
});

// Download Excel template
app.get('/api/stock/import/template', authMiddleware, requireRole(roles.STOCK_ADMIN), (req, res) => {
    try {
        const templateData = [
            {
                'Part Number': 'RES-001',
                'Name': '100 Ohm Resistor',
                'Category': 'RESISTOR',
                'Description': '1/4W Carbon Film Resistor',
                'Specifications': 'Resistance:100R, Tolerance:5%, Power:0.25W',
                'Quantity': 100,
                'Min Quantity': 20,
                'Unit Price': 0.50,
            },
            {
                'Part Number': 'CAP-001',
                'Name': '100uF Capacitor',
                'Category': 'CAPACITOR',
                'Description': 'Electrolytic Capacitor',
                'Specifications': 'Capacitance:100uF, Voltage:16V, Type:Electrolytic',
                'Quantity': 50,
                'Min Quantity': 10,
                'Unit Price': 2.00,
            },
        ];

        const worksheet = xlsx.utils.json_to_sheet(templateData);
        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, 'Products');

        const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=stock_import_template.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        console.error('❌ [Generate Template]: Error:', err);
        res.status(500).json({ message: 'Failed to generate template', error: err.message });
    }
});

// -------- AI Recommendations Routes --------
// Get AI purchase recommendations
app.post('/api/stock/ai/recommendations', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const recommendations = [];

        // Get all products
        const products = await Product.find().populate('supplier', 'name');

        for (const product of products) {
            let reason = '';
            let priority = 0;
            let suggestedQuantity = 0;

            // Rule 1: Out of stock (highest priority)
            if (product.quantity === 0) {
                reason = 'Out of stock - immediate action required';
                priority = 10;
                suggestedQuantity = product.reorderPoint * 2;
            }
            // Rule 2: Below minimum quantity
            else if (product.quantity <= product.minQuantity) {
                reason = 'Stock below minimum threshold';
                priority = 8;
                suggestedQuantity = product.reorderPoint - product.quantity;
            }
            // Rule 3: At or below reorder point
            else if (product.quantity <= product.reorderPoint) {
                reason = 'Approaching reorder point';
                priority = 6;
                suggestedQuantity = product.reorderPoint;
            }

            if (priority > 0) {
                const estimatedCost = suggestedQuantity * product.unitPrice;

                recommendations.push({
                    product: {
                        id: product._id,
                        partNumber: product.partNumber,
                        name: product.name,
                        category: product.category,
                        currentStock: product.quantity,
                        minQuantity: product.minQuantity,
                        reorderPoint: product.reorderPoint,
                    },
                    reason,
                    priority,
                    suggestedQuantity,
                    estimatedCost,
                    supplier: product.supplier ? {
                        id: product.supplier._id,
                        name: product.supplier.name,
                    } : null,
                });
            }
        }

        // Sort by priority (highest first)
        recommendations.sort((a, b) => b.priority - a.priority);

        res.json({
            totalRecommendations: recommendations.length,
            recommendations: recommendations.slice(0, 20), // Return top 20
            totalEstimatedCost: recommendations.reduce((sum, r) => sum + r.estimatedCost, 0),
        });
    } catch (err) {
        console.error('❌ [Generate Recommendations]: Error:', err);
        res.status(500).json({ message: 'Failed to generate recommendations', error: err.message });
    }
});

// Get AI insights
app.get('/api/stock/ai/insights', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const products = await Product.find();
        const issuedItems = await IssuedItem.find({ status: 'ISSUED' });

        // Calculate insights
        const totalValue = products.reduce((sum, p) => sum + p.totalValue, 0);
        const avgStockLevel = products.reduce((sum, p) => sum + p.quantity, 0) / products.length;

        // Most issued products (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentIssues = await IssuedItem.find({
            issueDate: { $gte: thirtyDaysAgo },
        });

        const issueCounts = {};
        recentIssues.forEach(item => {
            const key = item.productName;
            issueCounts[key] = (issueCounts[key] || 0) + item.quantity;
        });

        const topIssued = Object.entries(issueCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ productName: name, issuedQuantity: count }));

        // Categories distribution
        const categoryCounts = {};
        products.forEach(p => {
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
        });

        res.json({
            summary: {
                totalProducts: products.length,
                totalValue: Math.round(totalValue),
                avgStockLevel: Math.round(avgStockLevel),
                totalIssued: issuedItems.length,
            },
            topIssued,
            categoryDistribution: categoryCounts,
            insights: [
                {
                    type: 'warning',
                    message: `${products.filter(p => p.quantity <= p.minQuantity).length} products below minimum stock`,
                },
                {
                    type: 'info',
                    message: `${issuedItems.length} items currently issued to employees`,
                },
            ],
        });
    } catch (err) {
        console.error('❌ [Generate Insights]: Error:', err);
        res.status(500).json({ message: 'Failed to generate insights', error: err.message });
    }
});

// Price Comparison Route
app.post('/api/stock/price-comparison', authMiddleware, requireRole(roles.STOCK_ADMIN), async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ message: 'Query is required' });
        }

        console.log(`Analyzing prices for: ${query}`);
        const results = await scraperService.comparePrices(query);
        res.json({ results });
    } catch (error) {
        console.error('❌ [Price Comparison]: Error:', error);
        res.status(500).json({ message: 'Failed to fetch prices', error: error.message });
    }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`\n🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ [Start Server]: Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
