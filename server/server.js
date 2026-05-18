const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fix for Atlas SRV lookup
const pathModule = require('path');
require('dotenv').config({ path: pathModule.resolve(__dirname, '../.env'), override: true });
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
const { User, Project, Task, Activity, Notification } = require('./models');
const inventoryRoutes = require('./inventoryRoutes');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.PORT || 5000);
const CLIENT_URL = (process.env.CLIENT_URL || '').trim();
const BOM_URL = (process.env.BOM_URL || 'http://127.0.0.1:8000').trim();
const INVENTORY_API_URL = (process.env.INVENTORY_API_URL || (NODE_ENV === 'production' ? '' : 'http://127.0.0.1:5001')).trim();
const ADDITIONAL_ALLOWED_ORIGINS = (process.env.ADDITIONAL_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const JWT_SECRET = process.env.JWT_SECRET || (NODE_ENV !== 'production' ? 'super-secret-key-change-in-production' : '');

if (NODE_ENV === 'production' && !JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production.');
}

const app = express();

const developmentOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000'
];
const allowedOrigins = new Set([
    CLIENT_URL,
    ...ADDITIONAL_ALLOWED_ORIGINS,
    ...(NODE_ENV !== 'production' ? developmentOrigins : [])
].filter(Boolean));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        console.log('CORS blocked origin:', origin);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/api/inventory', inventoryRoutes);

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

const syncProjectToInventory = async (project, user) => {
    // Only sync HARDWARE projects to the Inventory system
    if (project.department !== 'HARDWARE') return;
    if (!INVENTORY_API_URL) {
        console.warn('⚠️ [Sync] INVENTORY_API_URL is not configured. Skipping project sync.');
        return;
    }

    try {
        const manager = await User.findById(project.managerId);
        const inventoryBaseUrl = INVENTORY_API_URL.replace(/\/+$/, '');
        const url = inventoryBaseUrl.endsWith('/api/projects')
            ? inventoryBaseUrl
            : `${inventoryBaseUrl}/api/projects`;
        const payload = {
            name: project.name,
            projectCode: project.projectCode,
            status: project.status,
            engineerEmail: manager?.email || '',
            engineerName: manager?.name || '',
        };

        console.log(`📡 [Sync] Syncing project ${project.projectCode} to Inventory Tracker...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'Authorization': `Bearer ${jwt.sign({ id: user?._id, name: user?.name, email: user?.email, role: user?.role }, JWT_SECRET, { expiresIn: '1m' })}`
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`✅ [Sync] Project ${project.projectCode} synced successfully.`);
        } else {
            const err = await res.json();
            console.error(`❌ [Sync] Project sync failed:`, err);
        }
    } catch (err) {
        // console.error(`❌ [Sync] Error during project sync:`, err.message);
    }
};


const roles = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    SUPER_USER: 'SUPER_USER',
    MANAGER: 'MANAGER',
    EMPLOYEE: 'EMPLOYEE',
    INTERN: 'INTERN',
    STORE_MANAGER: 'STORE_MANAGER',
    PURCHASE_MANAGER: 'PURCHASE_MANAGER',
    ENGINEER: 'ENGINEER', // Legacy
    JUNIOR_ENGINEER: 'JUNIOR_ENGINEER', // Legacy
    STOCK_ADMIN: 'STOCK_ADMIN' // Legacy
};

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
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
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
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for project docs
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Performance Tracker Store
const perfStats = {};



// Performance Monitoring Middleware
app.use((req, res, next) => {
    const start = Date.now();
    
    // Once the response is finished
    res.on('finish', () => {
        const elapsed = Date.now() - start;
        const pathKey = `${req.method} ${req.path.split('?')[0]}`;
        
        // Update stats
        if (!perfStats[pathKey]) {
            perfStats[pathKey] = { totalTime: 0, count: 0, maxTime: 0, lastAccessed: null };
        }
        perfStats[pathKey].totalTime += elapsed;
        perfStats[pathKey].count += 1;
        perfStats[pathKey].maxTime = Math.max(perfStats[pathKey].maxTime, elapsed);
        perfStats[pathKey].lastAccessed = new Date();

        // Don't double-log inventory proxy requests (they log themselves)
        if (req.path.startsWith('/api/inventory')) return;

        let color = '\x1b[32m'; // Green
        if (elapsed > 500) color = '\x1b[33m'; // Yellow
        if (elapsed > 1000) color = '\x1b[31m'; // Red
        
        console.log(`⏱️  [${req.method}] ${req.path} - ${color}${elapsed}ms\x1b[0m`);
    });
    
    next();
});

// Auth Middleware
const authMiddleware = async (req, res, next) => {
    let token;
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        console.warn(`🚫 [Auth] No token — ${req.method} ${req.path}`);
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            console.warn(`🚫 [Auth] User not found for token — ${req.method} ${req.path}`);
            return res.status(401).json({ message: 'User not found' });
        }
        req.user = user;
        req.user.role = (user.role || '').toUpperCase().replace(/\s+/g, '_'); // normalize case and spaces
        next();
    } catch (err) {
        console.error(`🚫 [Auth] Invalid token — ${err.message} — ${req.method} ${req.path}`);
        return res.status(401).json({ message: 'Invalid token' });
    }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
    const userRole = (req.user.role || '').toUpperCase();
    const allowed = allowedRoles.map(r => r.toUpperCase());
    if (!allowed.includes(userRole)) {
        console.warn(`🚫 [Role] ${req.user.role} (normalized: ${userRole}) not in [${allowedRoles.join(',')}] — ${req.path}`);
        return res.status(403).json({ message: 'Forbidden' });
    }
    // Normalize the role on the user object for downstream use
    req.user.role = userRole;
    next();
};

// Management endpoint to view performance audit
app.get('/api/system/performance', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), (req, res) => {
    const sorted = Object.entries(perfStats)
        .map(([path, data]) => ({
            endpoint: path,
            averageMs: (data.totalTime / data.count).toFixed(2),
            maxMs: data.maxTime.toFixed(2),
            count: data.count,
            lastAccessed: data.lastAccessed
        }))
        .sort((a, b) => b.averageMs - a.averageMs); // Sort by slowest average

    res.json({
        timestamp: new Date(),
        summary: sorted,
        slowest: sorted[0] || null
    });
});

// Inventory routes removed (moved to direct frontend connection)

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
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
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
        if (!req.user || !req.user._id) {
            console.warn('⚠️ [Notifications] req.user or req.user._id missing');
            return res.status(401).json({ message: 'User context missing' });
        }
        
        // Ensure ID is ObjectId for strict matching
        const uid = typeof req.user._id === 'string' ? new mongoose.Types.ObjectId(req.user._id) : req.user._id;
        
        const notifications = await Notification.find({ recipientId: uid })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(notifications);
    } catch (err) {
        console.error('❌ [Fetch Notifications] Critical Error:', {
            error: err.message,
            stack: err.stack,
            userId: req.user?._id
        });
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
app.get('/api/users', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.MANAGER, roles.EMPLOYEE), async (req, res) => {
    let query = {};

    if (req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN) {
        // Super Admins see all non-super users
        query.role = { $in: ['MANAGER', 'EMPLOYEE', 'INTERN', 'PURCHASE_MANAGER', 'STORE_MANAGER'] };
    } else if (req.user.role === roles.MANAGER && req.user.department) {
        // Managers see only employees and interns from their department
        query.role = { $in: ['EMPLOYEE', 'INTERN'] };
        query.department = req.user.department;
    } else {
        // Others see only employees and interns
        query.role = { $in: ['EMPLOYEE', 'INTERN'] };
    }

    const users = await User.find(query).select('-passwordHash');
    console.log(`🔍 [API Users]: Found ${users.length} users. Departments:`, users.map(u => `${u.name}: ${u.department || 'null'}`).join(', '));
    res.json(users.map(u => ({
        id: u._id,
        name: u.name,
        email: u.email,
        employeeId: u.employeeId,
        role: u.role,
        department: u.department,
    })));
});

app.get('/api/users/:userId/details', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.get('/api/users/next-id', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.get('/api/users/:userId/performance', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.ENGINEER, roles.MANAGER), async (req, res) => {
    try {
        const { userId } = req.params;
        if (!isValidObjectId(userId)) {
            return res.status(400).json({ message: 'Invalid user ID' });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Managers can only view performance of users in their department
        if ((req.user.role === roles.ENGINEER || req.user.role === roles.MANAGER) && user.department !== req.user.department) {
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

app.post('/api/users', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
    try {
        const { name, email, role, department, password, employeeId: manualId } = req.body;

        if (!name || !email || !role || !password) {
            return res.status(400).json({ message: 'Name, email, role, and password are required' });
        }

        // 🔒 SECURITY RESTRICTION: Prevent creation of Super Admins
        if (role === 'SUPER_ADMIN' || role === 'SUPER_USER') {
            return res.status(403).json({ message: 'Security Alert: Creation of Super Admin roles is strictly prohibited.' });
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

app.put('/api/users/:userId', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === roles.SUPER_USER || user.role === roles.SUPER_ADMIN) return res.status(403).json({ message: 'Cannot edit super user' });

    const { name, email, role, department, password } = req.body;
    if (email && email !== user.email) {
        const existing = await User.findOne({ email, _id: { $ne: user._id } });
        if (existing) return res.status(400).json({ message: 'Email already exists' });
        user.email = email;
    }
    if (name) user.name = name;
    
    if (role) {
        // 🔒 SECURITY RESTRICTION: Prevent promoting to Super Admin
        if (role === 'SUPER_ADMIN' || role === 'SUPER_USER') {
            return res.status(403).json({ message: 'Security Alert: Promotion to Super Admin role is strictly prohibited.' });
        }
        
        const allowedRoles = ['MANAGER', 'EMPLOYEE', 'INTERN', 'PURCHASE_MANAGER', 'STORE_MANAGER'];
        if (allowedRoles.includes(role)) {
            user.role = role;
        } else {
            return res.status(400).json({ message: 'Invalid role specified' });
        }
    }

    if (department !== undefined) user.department = department;
    if (password) user.passwordHash = bcrypt.hashSync(password, 10);
    await user.save();
    await logActivity('USER_UPDATED', `User ${user.name} was updated`, req.user._id, req.user.name, user._id, user.name);
    res.json({ id: user._id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role, department: user.department });
});

app.delete('/api/users/:userId', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === roles.SUPER_USER || user.role === roles.SUPER_ADMIN) return res.status(403).json({ message: 'Cannot delete super user' });

    await logActivity('USER_DELETED', `User ${user.name} (${user.employeeId}) was removed`, req.user._id, req.user.name, user._id, user.name);
    await Project.updateMany({ teamIds: user._id }, { $pull: { teamIds: user._id } });
    await Task.deleteMany({ assigneeId: user._id });
    await User.deleteOne({ _id: user._id });
    res.json({ message: 'User deleted successfully' });
});

// ============ PROJECT ROUTES ============

// Import task templates from dedicated module
const { taskTemplates, getTemplatesForDepartment, getTemplateTasks } = require('./taskTemplates');

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
    try {
        let query = {};
        if (req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN) {
            // Super users see all projects
        } else if (req.user.role === roles.ENGINEER || req.user.role === roles.MANAGER) {
            query.$or = [
                { managerId: req.user._id },
                { teamIds: req.user._id }
            ];
        } else {
            query.teamIds = req.user._id;
        }
        const projects = await Project.find(query)
            .populate('managerId', 'name')
            .populate('teamIds', 'name employeeId');
        const isEmployeeOrIntern = [roles.JUNIOR_ENGINEER, roles.EMPLOYEE, roles.INTERN].includes(req.user.role);

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
                teamIds: Array.isArray(p.teamIds) ? p.teamIds : [],
                templateUsed: p.templateUsed,
                attachments: Array.isArray(p.attachments) ? p.attachments : [],
                taskCount,
                completedTaskCount,
            };
        }));
        res.json(projectsWithStats);
    } catch (err) {
        console.error('❌ [Load Projects]: Error:', err);
        res.status(500).json({ message: 'Failed to load projects' });
    }
});

app.get('/api/projects/summary', authMiddleware, async (req, res) => {
    try {
        let query = {};
        const isAdmin = [roles.SUPER_USER, roles.SUPER_ADMIN].includes(req.user.role);

        if (!isAdmin) {
            query.$or = [
                { managerId: req.user._id },
                { teamIds: req.user._id }
            ];
        }

        const total = await Project.countDocuments(query);
        const active = await Project.countDocuments({ ...query, status: 'ACTIVE' });
        const completed = await Project.countDocuments({ ...query, status: 'COMPLETED' });
        const onHold = await Project.countDocuments({ ...query, status: 'ON_HOLD' });
        const delayed = await Project.countDocuments({ 
            ...query, 
            deadline: { $lt: new Date() }, 
            status: { $ne: 'COMPLETED' } 
        });

        const recentProjects = await Project.find(query).sort({ createdAt: -1 }).limit(5);

        let taskQuery = {};
        if (!isAdmin) {
            const projects = await Project.find(query).select('_id');
            const projectIds = projects.map(p => p._id);
            taskQuery.projectId = { $in: projectIds };
        }

        const totalTasks = await Task.countDocuments(taskQuery);
        const completedTasks = await Task.countDocuments({ ...taskQuery, status: 'COMPLETED' });
        const inProgressTasks = await Task.countDocuments({ ...taskQuery, status: 'IN_PROGRESS' });

        const allRelevantProjects = await Project.find(query).select('teamIds');
        const uniqueMembers = new Set();
        allRelevantProjects.forEach((p) => {
            const teamIds = Array.isArray(p.teamIds) ? p.teamIds : [];
            teamIds.forEach((id) => uniqueMembers.add(id.toString()));
        });
        const totalMembers = uniqueMembers.size;

        res.json({
            total,
            active,
            completed,
            onHold,
            delayed,
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
        res.status(500).json({ message: 'Failed to load project summary' });
    }
});

app.get('/api/projects/next-code', authMiddleware, async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const prefix = `PRJ-${currentYear}-`;
        const lastProject = await Project.findOne({ projectCode: { $regex: `^${prefix}` } }).sort({ projectCode: -1 });
        let nextNumber = 1;
        if (lastProject && lastProject.projectCode) {
            const lastNumber = parseInt(lastProject.projectCode.split('-')[2], 10);
            nextNumber = lastNumber + 1;
        }
        const nextCode = `${prefix}${String(nextNumber).padStart(3, '0')}`;
        res.json({ nextCode });
    } catch (err) {
        res.status(500).json({ message: 'Failed to get next project code' });
    }
});

app.get('/api/projects/:projectId', authMiddleware, async (req, res) => {
    try {
        const project = await Project.findById(req.params.projectId).populate('managerId', 'name');
        if (!project) return res.status(404).json({ message: 'Project not found' });
        const isEmployeeOrIntern = [roles.JUNIOR_ENGINEER, roles.INTERN].includes(req.user.role);
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
            teamIds: project.teamIds.map(id => id.toString()),
            templateUsed: project.templateUsed,
            attachments: project.attachments,
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post('/api/projects', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
    try {
        const { name, description, department, managerId, startDate, deadline, endDate, budget, templateName, teamIds } = req.body;
        console.log('Creating project:', { name, department, managerId, startDate, deadline, endDate });

        if (!name) return res.status(400).json({ message: 'Project name is required' });

        // Ensure we have a deadline (either from deadline or endDate field)
        const projectDeadline = deadline || endDate;
        if (!projectDeadline) {
            return res.status(400).json({ message: 'Project deadline/end date is required' });
        }

        const project = await Project.create({
            name,
            description: description || '',
            department: department || 'SOFTWARE',
            status: 'PLANNING',
            managerId: managerId || null,
            startDate: startDate || new Date(),
            deadline: projectDeadline,
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
                    assigneeId: project.managerId || null,
                    assignedAt: project.managerId ? new Date() : null,
                    createdBy: req.user._id,
                    order: task.order,
                });
            }
            console.log(`✅ Created ${templateTasks.length} tasks from template "${templateName}" and assigned to Manager`);
        }

        // Create dedicated folder for project attachments using projectCode_projectId format
        const folderName = project.projectCode ? `${project.projectCode}_${project._id.toString()}` : project._id.toString();
        const projectUploadDir = path.join(__dirname, 'uploads', 'projects', folderName);
        if (!fs.existsSync(projectUploadDir)) {
            fs.mkdirSync(projectUploadDir, { recursive: true });
            console.log(`📁 Created attachment folder for project ${project.projectCode}: ${projectUploadDir}`);
        }

        await logActivity('PROJECT_CREATED', `Project "${name}" was created`, req.user._id, req.user.name, project._id, name);
        
        // Sync to Inventory Tracker
        await syncProjectToInventory(project, req.user);

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

// Get Excel Template for Bulk Project Upload
app.get('/api/projects/template', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), (req, res) => {
    try {
        const wb = xlsx.utils.book_new();
        const wsData = [
            ['Project Name', 'Description', 'Department', 'Manager Email', 'Start Date', 'Deadline', 'Budget'],
            ['Sample Project Alpha', 'This is a sample project description', 'SOFTWARE', 'manager@enarxi.in', '2026-05-01', '2026-12-31', '500000'],
            ['Hardware Expansion B', 'Building new server racks', 'HARDWARE', 'engineer@enarxi.in', '2026-06-15', '2026-09-30', '1250000'],
        ];
        const ws = xlsx.utils.aoa_to_sheet(wsData);
        xlsx.utils.book_append_sheet(wb, ws, 'ProjectsTemplate');
        
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Project_Bulk_Upload_Template.xlsx');
        res.end(buf);
    } catch (err) {
        console.error('Error generating template:', err);
        res.status(500).json({ message: 'Failed to generate template' });
    }
});

// Bulk Project Upload
app.post('/api/projects/bulk', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        if (data.length === 0) return res.status(400).json({ message: 'Excel sheet is empty' });

        const results = {
            success: [],
            errors: []
        };

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowIndex = i + 2; // Row number in Excel

            try {
                const name = row['Project Name'];
                const description = row['Description'] || '';
                const department = (row['Department'] || 'SOFTWARE').toUpperCase();
                const managerEmail = row['Manager Email'];
                const startDateStr = row['Start Date'];
                const deadlineStr = row['Deadline'];
                const budget = parseFloat(row['Budget'] || 0);

                if (!name) throw new Error('Project Name is required');
                if (!deadlineStr) throw new Error('Deadline is required');
                if (!['SOFTWARE', 'HARDWARE'].includes(department)) throw new Error('Invalid Department (Must be SOFTWARE or HARDWARE)');

                // Find manager if email provided
                let managerId = null;
                if (managerEmail) {
                    const manager = await User.findOne({ email: new RegExp(`^${managerEmail.trim()}$`, 'i') });
                    if (manager) managerId = manager._id;
                }

                // Process dates
                const parseDate = (d) => {
                    if (!d) return null;
                    const date = new Date(d);
                    return isNaN(date.getTime()) ? null : date;
                };

                const startDate = parseDate(startDateStr) || new Date();
                const deadline = parseDate(deadlineStr);
                if (!deadline) throw new Error('Invalid Deadline date format (Use YYYY-MM-DD)');

                const project = await Project.create({
                    name,
                    description,
                    department,
                    status: 'PLANNING',
                    managerId,
                    startDate,
                    deadline,
                    budget,
                    createdBy: req.user._id,
                });

                // Notify Manager
                if (managerId) {
                    await Notification.create({
                        recipientId: managerId,
                        type: 'PROJECT_ASSIGNMENT',
                        message: `You have been assigned to project [${project.projectCode}] (Bulk Upload)`,
                        relatedId: project._id
                    });
                }

                // Create attachment folder
                const folderName = project.projectCode ? `${project.projectCode}_${project._id.toString()}` : project._id.toString();
                const projectUploadDir = path.join(__dirname, 'uploads', 'projects', folderName);
                if (!fs.existsSync(projectUploadDir)) {
                    fs.mkdirSync(projectUploadDir, { recursive: true });
                }

                await logActivity('PROJECT_CREATED', `Project "${name}" was created via Bulk Upload`, req.user._id, req.user.name, project._id, name);
                
                // Sync to Inventory Tracker
                await syncProjectToInventory(project, req.user);

                results.success.push({ name, projectCode: project.projectCode });
            } catch (rowErr) {
                results.errors.push({ row: rowIndex, name: row['Project Name'] || 'Unknown', error: rowErr.message });
            }
        }

        // Clean up uploaded file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        res.json({
            message: `Processed ${data.length} rows: ${results.success.length} succeeded, ${results.errors.length} failed.`,
            summary: results
        });

    } catch (err) {
        console.error('Bulk upload error:', err);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ message: 'Failed to process bulk upload' });
    }
});

app.put('/api/projects/:projectId', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.ENGINEER, roles.MANAGER), async (req, res) => {
    try {
        const { projectId } = req.params;
        if (!isValidObjectId(projectId)) {
            return res.status(400).json({ message: 'Invalid project ID' });
        }

        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const { name, description, department, status, deadline, endDate, teamIds, budget, managerId } = req.body;
        console.log('Updating project:', projectId);
        console.log('Request body:', { name, description, department, status, deadline, teamIds, budget, managerId });
        console.log('Current project status:', project.status);

        if (name) project.name = name;
        if (description !== undefined) project.description = description;
        if (department) project.department = department;
        if (managerId !== undefined) project.managerId = managerId;

        // Only Super Users can update budget
        if (budget !== undefined && (req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN)) {
            project.budget = budget;
        }

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
            // Robustly extract string IDs from both raw IDs and potentially populated objects
            const oldTeamIds = project.teamIds.map(id =>
                (id && typeof id === 'object' && id._id) ? id._id.toString() : id.toString()
            );
            const newTeamIds = teamIds.map(id =>
                (id && typeof id === 'object' && (id._id || id.id)) ? (id._id || id.id).toString() : id.toString()
            );

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
        
        // Sync to Inventory Tracker
        await syncProjectToInventory(project, req.user);

        console.log('✅ Project updated successfully:', project._id, 'Status:', project.status);
        res.json({ id: project._id, name: project.name, description: project.description, department: project.department, status: project.status, deadline: project.deadline, teamIds: project.teamIds.map(id => id.toString()) });
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ message: 'Failed to update project', error: err.message });
    }
});

// Upload attachments to a project
app.post('/api/projects/:projectId/attachments', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.ENGINEER, roles.MANAGER, roles.JUNIOR_ENGINEER, roles.INTERN, roles.EMPLOYEE), projectAttachmentUpload.array('attachments', 10), async (req, res) => {
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
app.delete('/api/projects/:projectId/attachments/:filename', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.ENGINEER, roles.MANAGER), async (req, res) => {
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

app.delete('/api/projects/:projectId', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.get('/api/backups', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.get('/api/backups/:folderName', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.get('/api/backups/:folderName/download/:filename', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.delete('/api/backups/:folderName/files/:filename', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.delete('/api/backups/:folderName', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
app.use('/api/backups/files', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), express.static(path.join(__dirname, 'uploads', 'backup')));


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
        const isSuperUser = req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN;
        const isTeamMember = project.teamIds.map(id => String(id)).includes(String(req.user._id));

        if (!isSuperUser && !isTeamMember) {
            return res.status(403).json({ message: 'Not authorized to update this project' });
        }

        if (status) {
            console.log(`Updating project ${projectId} status to ${status} by ${req.user.name}`);
            if ((req.user.role === roles.ENGINEER || req.user.role === roles.MANAGER) && status === 'COMPLETED') {
                project.status = 'WAITING_APPROVAL';
                // Notify Super Users
                const superUsers = await User.find({ role: { $in: [roles.SUPER_USER, roles.SUPER_ADMIN] } });
                for (const admin of superUsers) {
                    await Notification.create({
                        recipientId: admin._id,
                        type: 'APPROVAL_REQUEST',
                        message: `Project [${project.projectCode}] marked as complete by Manager ${req.user.name}. Needs approval.`,
                        relatedId: project._id
                    });
                }
            }
            else if ((req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN) && project.status === 'WAITING_APPROVAL') {
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
    try {
        let query = {};
        if (req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN) {
            // Super users see all tasks
        } else if ((req.user.role === roles.ENGINEER || req.user.role === roles.MANAGER)) {
            const myProjects = await Project.find({
                $or: [{ managerId: req.user._id }, { teamIds: req.user._id }]
            }).select('_id');
            const projectIds = myProjects.map(p => p._id);
            query.projectId = { $in: projectIds };
        } else {
            // Employees/Interns only see their own tasks
            query.assigneeId = req.user._id;
        }
        const tasks = await Task.find(query).populate('projectId', 'name projectCode');
        const isEmployeeOrIntern = [roles.JUNIOR_ENGINEER, roles.INTERN].includes(req.user.role);

        res.json(tasks.map(t => ({
            id: t._id,
            title: t.title,
            description: t.description,
            status: t.status,
            projectId: t.projectId?._id,
            projectName: isEmployeeOrIntern ? null : (t.projectId?.name || 'Unknown'),
            projectCode: t.projectId?.projectCode || null,
            assigneeId: t.assigneeId,
            rejectionReason: t.rejectionReason,
            assignedAt: t.assignedAt,
            deadline: t.deadline,
            completedAt: t.completedAt,
            allocatedMinutes: t.allocatedMinutes,
            actualMinutes: t.actualMinutes,
            performanceScore: t.performanceScore,
            comments: Array.isArray(t.comments) ? t.comments : [],
            queries: Array.isArray(t.queries) ? t.queries : [],
            delayStatus: t.delayStatus,
            delayReason: t.delayReason,
            delayRequestedAt: t.delayRequestedAt,
            adminDelayApproved: t.adminDelayApproved,
            delayRejectionReason: t.delayRejectionReason
        })));
    } catch (err) {
        console.error('❌ [Load Tasks]: Error:', err);
        res.status(500).json({ message: 'Failed to load tasks', error: err.message });
    }
});

// Get single task by ID
app.get('/api/tasks/:id', authMiddleware, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Task.findById(req.params.id).populate('projectId', 'name projectCode');
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Check permissions
        const isEmployeeOrIntern = [roles.JUNIOR_ENGINEER, roles.INTERN].includes(req.user.role);
        const isManager = req.user.role === roles.ENGINEER;
        const isSuperUser = req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN;

        // Employees/Interns can only view their own tasks
        if (isEmployeeOrIntern && task.assigneeId && task.assigneeId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to view this task' });
        }

        // Managers can only view tasks in their department projects
        if (isManager && task.projectId) {
            const project = await Project.findById(task.projectId);
            if (project && project.department !== req.user.department) {
                return res.status(403).json({ message: 'Not authorized to view this task' });
            }
        }

        res.json({
            id: task._id,
            _id: task._id,
            title: task.title,
            description: task.description,
            status: task.status,
            projectId: task.projectId?._id,
            projectName: isEmployeeOrIntern ? null : (task.projectId?.name || 'Unknown'),
            projectCode: task.projectId?.projectCode || null,
            assigneeId: task.assigneeId,
            rejectionReason: task.rejectionReason,
            assignedAt: task.assignedAt,
            deadline: task.deadline,
            completedAt: task.completedAt,
            allocatedMinutes: task.allocatedMinutes,
            actualMinutes: task.actualMinutes,
            performanceScore: task.performanceScore,
            comments: task.comments,
            queries: task.queries, // This preserves the MongoDB _id for each query
        });
    } catch (err) {
        console.error('❌ [Get Task]: Error:', err);
        res.status(500).json({ message: 'Failed to load task', error: err.message });
    }
});

app.post('/api/tasks', authMiddleware, async (req, res) => {
    try {
        const { title, description, projectId, assigneeId, deadline } = req.body;
        console.log('Creating task:', { title, projectId, assigneeId, deadline });

        if (!title || !projectId) return res.status(400).json({ message: 'Title and projectId are required' });
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // If no assigneeId provided, assign to the creator ONLY if they are an Employee or Intern
        const finalAssigneeId = assigneeId || (['EMPLOYEE', 'INTERN'].includes(req.user.role) ? req.user._id : null);

        // Set assignedAt if assignee is provided
        const assignedAt = finalAssigneeId ? new Date() : null;

        // Parse deadline if provided
        const deadlineDate = deadline ? new Date(deadline) : null;
        if (deadlineDate && deadlineDate < new Date().setHours(0, 0, 0, 0)) {
            return res.status(400).json({ message: 'Deadline cannot be in the past' });
        }

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
        // Auto-switch Project to ACTIVE if task is assigned AND ensure User is in Team
        if (finalAssigneeId) {
            const project = await Project.findById(projectId);
            if (project) {
                let projectUpdated = false;

                // 1. Switch to ACTIVE if pending
                if (project.status === 'PLANNING') {
                    project.status = 'ACTIVE';
                    projectUpdated = true;
                    console.log(`✅ Project ${project.projectCode} auto-switched to ACTIVE upon task assignment.`);
                }

                // 2. Add Assignee to Team Members if not present
                // Ensure teamIds is initialized
                if (!project.teamIds) project.teamIds = [];

                // Check if finalAssigneeId is already in teamIds (comparing strings to be safe)
                const isMember = project.teamIds.some(id => id.toString() === finalAssigneeId.toString());

                if (!isMember) {
                    project.teamIds.push(finalAssigneeId);
                    projectUpdated = true;
                    console.log(`✅ User ${finalAssigneeId} auto-added to Project ${project.projectCode} team.`);
                }

                if (projectUpdated) {
                    await project.save();
                }
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

        // Ensure delay fields are present (explicitly for clarity/safety)
        if (!taskObj.delayStatus) taskObj.delayStatus = 'NONE';

        res.json(taskObj);
    } catch (err) {
        console.error('❌ [Fetch Task]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch task', error: err.message });
    }
});

// Delete Task
app.delete('/api/tasks/:taskId', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.ENGINEER), async (req, res) => {
    console.log(`Received DELETE request for task: ${req.params.taskId}`);
    try {
        const { taskId } = req.params;
        if (!isValidObjectId(taskId)) {
            console.log('Invalid Object ID for delete:', taskId);
            return res.status(400).json({ message: 'Invalid task ID' });
        }

        const task = await Task.findById(taskId);
        if (!task) {
            console.log('Task not found in DB for delete:', taskId);
            return res.status(404).json({ message: 'Task not found in database' });
        }

        // Optionally check ownership/project management here if strictly required,
        // but requireRole(MANAGER) covers the basic 'Manager can delete' requirement.
        // For stricter control:
        if (req.user.role === roles.ENGINEER && task.projectId) {
            const project = await Project.findById(task.projectId);
            // If manager is not the manager of this project
            if (project && project.managerId && project.managerId.toString() !== req.user._id.toString()) {
                // Check if they are authorized otherwise? 
                // For now, allow managers to delete tasks as requested by user flow.
            }
        }

        await Task.findByIdAndDelete(taskId);
        console.log(`✅ Task deleted: ${taskId}`);
        res.json({ message: 'Task deleted successfully', id: taskId });
    } catch (err) {
        console.error('❌ [Delete Task]: Error:', err);
        res.status(500).json({ message: 'Failed to delete task', error: err.message });
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

        const { title, description, status, assigneeId, deadline, selfAssignedBy, selfAssignedAt, completedBy, rejectionReason } = req.body;
        console.log('Updating task:', taskId, { title, description, status, assigneeId, deadline, selfAssignedBy, selfAssignedAt, completedBy });

        if (title) task.title = title;
        if (description !== undefined) task.description = description;

        // Handle deadline update
        if (deadline !== undefined) {
            const newDeadline = deadline ? new Date(deadline) : null;
            if (newDeadline && newDeadline < new Date().setHours(0, 0, 0, 0)) {
                return res.status(400).json({ message: 'Deadline cannot be in the past' });
            }
            task.deadline = newDeadline;
            // Recalculate allocated minutes if assignedAt exists
            if (task.assignedAt && task.deadline) {
                const start = new Date(task.assignedAt);
                start.setHours(0, 0, 0, 0);
                const end = new Date(task.deadline);
                end.setHours(0, 0, 0, 0);
                const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
                task.allocatedMinutes = diffDays * 1440; // Store as minutes (days * 24 * 60)
            }
        }

        if (status) {
            const isEmployeeOrIntern = [roles.JUNIOR_ENGINEER, roles.INTERN].includes(req.user.role);
            const isManager = req.user.role === roles.ENGINEER;
            const isSuperUser = req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN;

            // Manager or Super User can directly update any status (no approval needed for them)
            if (isManager || isSuperUser) {
                // If approving an employee's waiting task, send notification
                if (task.status === 'WAITING_APPROVAL' && task.assigneeId) {
                    const action = status === 'COMPLETED' ? 'approved' : 'returned for revision';

                    // Handle Rejection Logic
                    if (status === 'IN_PROGRESS' && rejectionReason) {
                        task.rejectionReason = rejectionReason;
                        task.rejectedAt = new Date();
                        task.rejectedBy = req.user._id;
                    }

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

            // Ensure assignee is added to Project Team if assigned
            if (assigneeId && task.projectId) {
                try {
                    const project = await Project.findById(task.projectId);
                    if (project) {
                        if (!project.teamIds) project.teamIds = [];
                        const isMember = project.teamIds.some(id => id.toString() === assigneeId.toString());
                        if (!isMember) {
                            project.teamIds.push(assigneeId);
                            await project.save();
                            console.log(`✅ User ${assigneeId} auto-added to Project ${project.projectCode} team (Update Task).`);
                        }
                    }
                } catch (err) {
                    console.error('Error auto-adding team member:', err);
                }
            }

            // Recalculate allocated minutes if assignedAt and deadline exist
            if (task.assignedAt && task.deadline) {
                const start = new Date(task.assignedAt);
                start.setHours(0, 0, 0, 0);
                const end = new Date(task.deadline);
                end.setHours(0, 0, 0, 0);
                const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
                task.allocatedMinutes = diffDays * 1440; // Store as minutes
            }
        }

        // Self-Assignment Tracking (for Manager Performance Analytics)
        if (selfAssignedBy !== undefined) {
            task.selfAssignedBy = selfAssignedBy;
        }
        if (selfAssignedAt !== undefined) {
            task.selfAssignedAt = selfAssignedAt ? new Date(selfAssignedAt) : null;
        }
        if (completedBy !== undefined) {
            task.completedBy = completedBy;
        }

        // Performance Calculation Logic
        if (task.status === 'COMPLETED') {
            if (!task.completedAt) task.completedAt = new Date();
            // Track who completed the task if not already set
            if (!task.completedBy && req.user) {
                task.completedBy = req.user._id;
            }

            if (task.assignedAt) {
                const start = new Date(task.assignedAt);
                start.setHours(0, 0, 0, 0);
                const end = new Date(task.completedAt);
                end.setHours(0, 0, 0, 0);

                const actualDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
                task.actualMinutes = actualDays * 1440;

                if (task.adminDelayApproved) {
                    // Delay excused: Treat as on-time (100% score) regardless of actual time taken
                    if (task.allocatedMinutes !== null && task.allocatedMinutes !== undefined) {
                        task.actualMinutes = task.allocatedMinutes;
                        task.performanceScore = 100;
                    }
                } else if (task.allocatedMinutes !== null && task.allocatedMinutes !== undefined) {
                    task.performanceScore = Math.min(100, Math.round((task.allocatedMinutes / task.actualMinutes) * 100));
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
                    const superAdmins = await User.find({ role: { $in: [roles.SUPER_USER, roles.SUPER_ADMIN] } });
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
        const isSuperUser = req.user.role === roles.SUPER_USER || req.user.role === roles.SUPER_ADMIN;
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
                    task.performanceScore = Math.min(100, Math.round((task.allocatedMinutes / task.actualMinutes) * 100));
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
                        const superAdmins = await User.find({ role: { $in: [roles.SUPER_USER, roles.SUPER_ADMIN] } });
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

// ============ DELAY REASON WORKFLOW ROUTES ============

// 1. Employee/Intern reports a delay
app.post('/api/tasks/:taskId/delay', authMiddleware, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { reason } = req.body;

        if (!isValidObjectId(taskId)) return res.status(400).json({ message: 'Invalid task ID' });
        if (!reason) return res.status(400).json({ message: 'Reason is required' });

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        // Verify user is the assignee
        if (task.assigneeId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Only the assignee can report a delay' });
        }

        task.delayReason = reason;
        task.delayStatus = 'PENDING_MANAGER';
        task.delayRequestedAt = new Date();

        await task.save();

        // Notify Project Manager
        const project = await Project.findById(task.projectId);
        if (project && project.managerId) {
            await Notification.create({
                recipientId: project.managerId,
                type: 'APPROVAL_REQUEST',
                message: `Delay reported for task "${task.title}". Reason: ${reason}`,
                relatedId: task._id
            });
        }

        res.json({ message: 'Delay reported successfully', task });
    } catch (err) {
        console.error('❌ [Report Delay]: Error:', err);
        res.status(500).json({ message: 'Failed to report delay' });
    }
});

// 2. Manager Reviews Delay (Approves to forward to Admin, or Rejects)
app.put('/api/tasks/:taskId/delay/manager-review', authMiddleware, requireRole(roles.MANAGER), async (req, res) => {
    try {
        const { taskId } = req.params;
        const { approved, rejectionReason } = req.body; // approved = true (Forward to Admin) or false (Reject)

        if (!isValidObjectId(taskId)) return res.status(400).json({ message: 'Invalid task ID' });

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (task.delayStatus !== 'PENDING_MANAGER') {
            return res.status(400).json({ message: 'Task is not pending manager review' });
        }

        task.managerDelayReviewedBy = req.user._id;
        task.managerDelayReviewedAt = new Date();

        if (approved) {
            task.managerDelayApproved = true;
            task.delayStatus = 'PENDING_ADMIN';

            // Notify Super Admin
            const superAdmins = await User.find({ role: { $in: [roles.SUPER_USER, roles.SUPER_ADMIN] } });
            for (const admin of superAdmins) {
                await Notification.create({
                    recipientId: admin._id,
                    type: 'APPROVAL_REQUEST',
                    message: `Manager verified delay for "${task.title}". Needs Admin approval.`,
                    relatedId: task._id
                });
            }

        } else {
            task.managerDelayApproved = false;
            task.delayStatus = 'REJECTED';
            task.rejectionReason = rejectionReason || 'Rejected by Manager';
            task.rejectedAt = new Date();
            task.rejectedBy = req.user._id;

            // Notify Employee
            await Notification.create({
                recipientId: task.assigneeId,
                type: 'TASK_UPDATE',
                message: `Your delay request for "${task.title}" was rejected by Manager.`,
                relatedId: task._id
            });
        }

        await task.save();
        res.json({ message: 'Manager review submitted', task });
    } catch (err) {
        console.error('❌ [Manager Delay Review]: Error:', err);
        res.status(500).json({ message: 'Failed to review delay' });
    }
});

// 3. Admin Final Review
app.put('/api/tasks/:taskId/delay/admin-review', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
    try {
        const { taskId } = req.params;
        const { approved, rejectionReason } = req.body;

        if (!isValidObjectId(taskId)) return res.status(400).json({ message: 'Invalid task ID' });

        const task = await Task.findById(taskId);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        if (task.delayStatus !== 'PENDING_ADMIN') {
            return res.status(400).json({ message: 'Task is not pending admin review' });
        }

        task.adminDelayReviewedBy = req.user._id;
        task.adminDelayReviewedAt = new Date();

        if (approved) {
            task.adminDelayApproved = true;
            task.delayStatus = 'APPROVED';

            // EXCUSE LOGIC: Update performance score to 100% (Excused)
            // We set actualMinutes equal to allocatedMinutes effectively to show on-time
            if (task.allocatedMinutes) {
                task.actualMinutes = task.allocatedMinutes;
                task.performanceScore = 100;
            }

            // Notify Employee & Manager
            await Notification.create({
                recipientId: task.assigneeId,
                type: 'TASK_UPDATE',
                message: `Your delay request for "${task.title}" was APPROVED. It will not affect your score.`,
                relatedId: task._id
            });

        } else {
            task.adminDelayApproved = false;
            task.delayStatus = 'REJECTED';
            task.rejectionReason = rejectionReason || 'Rejected by Admin';
            task.rejectedAt = new Date();
            task.rejectedBy = req.user._id;

            // Notify Employee
            await Notification.create({
                recipientId: task.assigneeId,
                type: 'TASK_UPDATE',
                message: `Your delay request for "${task.title}" was REJECTED by Admin.`,
                relatedId: task._id
            });
        }

        await task.save();
        res.json({ message: 'Admin review submitted', task });

    } catch (err) {
        console.error('❌ [Admin Delay Review]: Error:', err);
        res.status(500).json({ message: 'Failed to review delay' });
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
app.put('/api/tasks/:taskId/queries/:queryId/respond', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.MANAGER), async (req, res) => {
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
        query.responseByName = req.user.name;
        query.status = 'RESOLVED';
        query.respondedAt = new Date();
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

// ============ MANAGER PERFORMANCE ANALYTICS ============
// Get manager's self-assigned tasks and performance metrics
app.get('/api/manager/performance', authMiddleware, requireRole(roles.MANAGER, roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
    try {
        const managerId = req.user._id;

        // Get all tasks self-assigned by this manager
        const selfAssignedTasks = await Task.find({ selfAssignedBy: managerId });

        // Get all tasks completed by this manager
        const completedByManager = await Task.find({
            completedBy: managerId,
            status: 'COMPLETED'
        });

        // Get tasks assigned to this manager (either self-assigned or delegated)
        const managerTasks = await Task.find({ assigneeId: managerId });

        // Calculate metrics
        const totalSelfAssigned = selfAssignedTasks.length;
        const completedSelfAssigned = selfAssignedTasks.filter(t => t.status === 'COMPLETED').length;
        const completionRate = totalSelfAssigned > 0 ? Math.round((completedSelfAssigned / totalSelfAssigned) * 100) : 0;

        // Calculate average completion time (in hours)
        let avgCompletionTimeHours = 0;
        const completedWithTime = completedByManager.filter(t => t.assignedAt && t.completedAt);
        if (completedWithTime.length > 0) {
            const totalMs = completedWithTime.reduce((sum, t) => {
                return sum + (new Date(t.completedAt).getTime() - new Date(t.assignedAt).getTime());
            }, 0);
            avgCompletionTimeHours = Math.round((totalMs / completedWithTime.length) / (1000 * 60 * 60) * 10) / 10;
        }

        // Monthly breakdown (last 6 months)
        const now = new Date();
        const monthlyData = [];
        for (let i = 5; i >= 0; i--) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

            const monthTasks = selfAssignedTasks.filter(t => {
                const assignedDate = new Date(t.selfAssignedAt || t.createdAt);
                return assignedDate >= monthStart && assignedDate <= monthEnd;
            });

            const monthCompleted = monthTasks.filter(t => t.status === 'COMPLETED').length;

            monthlyData.push({
                month: monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
                selfAssigned: monthTasks.length,
                completed: monthCompleted
            });
        }

        // On-time completion rate
        const tasksWithDeadline = completedByManager.filter(t => t.deadline && t.completedAt);
        const onTimeCount = tasksWithDeadline.filter(t =>
            new Date(t.completedAt) <= new Date(t.deadline)
        ).length;
        const onTimeRate = tasksWithDeadline.length > 0
            ? Math.round((onTimeCount / tasksWithDeadline.length) * 100)
            : 0;

        res.json({
            summary: {
                totalSelfAssigned,
                completedSelfAssigned,
                completionRate,
                avgCompletionTimeHours,
                onTimeRate,
                totalCompletedByMe: completedByManager.length,
                pendingTasks: managerTasks.filter(t => t.status !== 'COMPLETED').length
            },
            monthlyData,
            recentCompletions: completedByManager
                .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
                .slice(0, 5)
                .map(t => ({
                    id: t._id,
                    title: t.title,
                    completedAt: t.completedAt,
                    selfAssigned: t.selfAssignedBy?.toString() === managerId.toString()
                }))
        });
    } catch (err) {
        console.error('❌ [Manager Performance]: Error:', err);
        res.status(500).json({ message: 'Failed to fetch performance data', error: err.message });
    }
});

// Project Status Manual Update (Manager override)
app.put('/api/projects/:projectId/status', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN, roles.MANAGER), async (req, res) => {
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
app.get('/api/activity-logs', authMiddleware, requireRole(roles.SUPER_USER, roles.SUPER_ADMIN), async (req, res) => {
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
        if (req.user.role !== roles.SUPER_USER && req.user.role !== roles.SUPER_ADMIN) {
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

// ============ BOM AUTOMATION INTEGRATION ============
const startBOMAutomation = async () => {
    if (NODE_ENV === 'production') {
        console.log('ℹ️ [BOM] Production mode detected. Skipping Python auto-spawn.');
        return;
    }

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');

    const bomDir = path.join(__dirname, 'BOM');
    
    // Cross-platform python executable path
    const pythonExe = process.platform === 'win32' 
        ? path.join(bomDir, 'venv', 'Scripts', 'python.exe')
        : path.join(bomDir, 'venv', 'bin', 'python');

    if (!fs.existsSync(bomDir)) {
        console.error('⚠️ [BOM] Automation directory not found at:', bomDir);
        return;
    }

    if (!fs.existsSync(pythonExe)) {
        console.error('⚠️ [BOM] Python executable not found at:', pythonExe);
        console.log('   (Did you create the virtual environment in Automation-for-BOM?)');
        return;
    }

    console.log(`🚀 [BOM] Starting Automation Server using: ${pythonExe}`);

    const deepHealthCheck = async () => {
        try {
            const progress = await fetch(`${BOM_URL}/progress`, { method: 'GET' });
            if (!progress.ok) return false;

            const inject = await fetch(`${BOM_URL}/inject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: [{ component: 'health-check', qty: 1, ROBU: 'R0' }]
                })
            });
            if (!inject.ok) return false;

            const process = await fetch(`${BOM_URL}/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mapping: {
                        component: 'component',
                        quantity: 'qty',
                        vendors: ['ROBU'],
                        skip_cart_phase: true
                    }
                })
            });

            return process.ok;
        } catch (_) {
            return false;
        }
    };

    const killPort8000IfNeeded = async () => {
        if (os.platform() !== 'win32') return;
        try {
            const { execSync } = require('child_process');
            const output = execSync('netstat -ano | findstr :8000', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
            const pids = Array.from(new Set(
                output
                    .split(/\r?\n/)
                    .map((line) => line.trim().split(/\s+/).pop())
                    .filter((pid) => /^\d+$/.test(pid))
            ));
            for (const pid of pids) {
                try {
                    execSync(`taskkill /PID ${pid} /F`, { stdio: ['ignore', 'ignore', 'ignore'] });
                    console.log(`⚠️ [BOM] Killed stale process on port 8000 (PID ${pid}).`);
                } catch (_) {
                    // ignore per-pid failures
                }
            }
        } catch (_) {
            // nothing listening
        }
    };

    const bomHealthy = await deepHealthCheck();
    if (bomHealthy) {
        console.log(`✅ [BOM] Existing BOM server is healthy at ${BOM_URL}. Skipping child process spawn.`);
        return;
    }
    await killPort8000IfNeeded();

    const bomProcess = spawn(pythonExe, ['-m', 'app.main'], {
        cwd: bomDir,
        shell: false,
        env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' }
    });

    bomProcess.stdout.on('data', (data) => {
        console.log(`[BOM] ${data.toString().trim()}`);
    });

    bomProcess.stderr.on('data', (data) => {
        console.error(`[BOM ERROR] ${data.toString().trim()}`);
    });

    bomProcess.on('close', (code) => {
        console.log(`🛑 [BOM] Automation Server exited with code ${code}`);
    });
};

// ============ BOM PROXY ROUTES ============
// This proxies requests from the main API to the Python BOM server on port 8000
const BOM_SERVER_URL = BOM_URL;

app.use('/api/bom', authMiddleware, async (req, res, next) => {
    const targetPath = req.path || '/';
    if (targetPath === '/upload') {
        return next();
    }
    const queryString = req.originalUrl.includes('?') ? req.originalUrl.substring(req.originalUrl.indexOf('?')) : '';
    const url = `${BOM_SERVER_URL}${targetPath}${queryString}`;
    
    try {
        console.log(`📡 [BOM Proxy] ${req.method} ${url}`);
        
        const fetchOptions = {
            method: req.method,
            headers: {
                // Pass through relevant headers
                'Accept': req.headers['accept'],
                'Authorization': req.headers['authorization'],
            }
        };

        // Handle Body
        if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            if (req.headers['content-type']?.includes('multipart/form-data')) {
                // For file uploads, we need to handle the buffer and boundary
                // Multer has already parsed the file if it was hitting an upload endpoint
                // But here we are catching all /api/bom*
                // If it's an upload, let's let multer handle it first if needed, 
                // but since we are proxying, we might need a more direct pipe.
                // For simplicity, let's handle the specific /upload route with multer
                return res.status(400).json({ message: 'Use specific upload handler' });
            } else {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(req.body);
            }
        }

        const response = await fetch(url, fetchOptions);
        
        // Handle Streaming Response (for Export)
        if (targetPath === '/export') {
            const contentType = response.headers.get('content-type');
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', response.headers.get('content-disposition'));
            const buffer = await response.arrayBuffer();
            return res.send(Buffer.from(buffer));
        }

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`❌ [BOM Proxy Error]:`, err.message);
        res.status(502).json({ message: 'BOM Automation Server unreachable', error: err.message });
    }
});

// Specific handler for BOM Upload to handle Multipart via proxy
app.post('/api/bom/upload', authMiddleware, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    
    try {
        const formData = new FormData();
        const blob = new Blob([fs.readFileSync(req.file.path)], { type: req.file.mimetype });
        formData.append('file', blob, req.file.originalname);

        const response = await fetch(`${BOM_SERVER_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        // Clean up temp file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error(`❌ [BOM Upload Proxy Error]:`, err);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(502).json({ message: 'BOM Automation Server unreachable' });
    }
});

// ============ START SERVER ============
const startServer = async () => {
    try {
        await connectDB();

        // ── Role Normalization Migration ─────────────────────────────
        // Normalize all stored roles to uppercase so queries work correctly
        // regardless of how they were originally saved (e.g. 'Manager' → 'MANAGER')
        try {
            const allUsers = await User.find({});
            const needsUpdate = allUsers.filter(u => u.role && u.role !== u.role.toUpperCase());
            if (needsUpdate.length > 0) {
                await Promise.all(needsUpdate.map(u =>
                    User.updateOne({ _id: u._id }, { $set: { role: u.role.toUpperCase() } })
                ));
                console.log(`✅ [Migration] Normalized ${needsUpdate.length} user role(s) to uppercase`);
                needsUpdate.forEach(u => console.log(`   • ${u.name}: "${u.role}" → "${u.role.toUpperCase()}"`));
            } else {
                console.log('✅ [Migration] All user roles already uppercase — no changes needed');
            }
        } catch (migErr) {
            console.error('⚠️  [Migration] Role normalization failed (non-fatal):', migErr.message);
        }
        // ─────────────────────────────────────────────────────────────

        const bindHost = NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0';
        app.listen(PORT, bindHost, () => {
            console.log(`\n🚀 Server running on http://${bindHost}:${PORT}`);

            if (NODE_ENV !== 'production') {
                startBOMAutomation();
            }
        });
    } catch (error) {
        console.error('❌ [Start Server]: Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
