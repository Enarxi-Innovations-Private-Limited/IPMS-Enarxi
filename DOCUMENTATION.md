# 📚 IPMS - Internal Project Management System
## Complete Technical Documentation

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Backend (Express.js)](#backend-expressjs)
5. [Frontend (React)](#frontend-react)
6. [Database Models](#database-models)
7. [Approval Workflow System](#approval-workflow-system)
8. [Authentication & Authorization](#authentication--authorization)
9. [API Endpoints Reference](#api-endpoints-reference)
10. [Key React Concepts Used](#key-react-concepts-used)
11. [Key Express Concepts Used](#key-express-concepts-used)
12. [File Structure](#file-structure)
13. [Learning Resources](#learning-resources)

---

## 🎯 Project Overview

**IPMS** (Internal Project Management System) is a full-stack web application designed to manage projects, tasks, and team members within an organization. It implements a **hierarchical approval workflow** system where:

- **Employees/Interns** work on tasks and request approval when complete
- **Managers** approve/reject task completions
- **Super Admins** approve/reject project completions

### Key Features

| Feature | Description |
|---------|-------------|
| Project Management | Create, edit, delete, and track projects |
| Task Management | Assign tasks to team members, track progress |
| Hierarchical Approval | Multi-level approval workflow |
| Role-Based Access | Different dashboards for different roles |
| Real-time Notifications | In-app notification system |
| File Attachments | Upload documents to projects |
| Stock Management | Inventory tracking (separate module) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Components: Dashboard, Projects, Tasks, Teams, Modals    │  │
│  │ State: useState, useEffect hooks                         │  │
│  │ Routing: React Router DOM                                │  │
│  │ HTTP Client: Axios (api.js service)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/REST API
                             │ (JSON + JWT Auth)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVER (Express.js)                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Middleware: CORS, JSON Parser, Auth, Role Check          │  │
│  │ Routes: /api/users, /api/projects, /api/tasks, etc.      │  │
│  │ Business Logic: Approval workflow, notifications         │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Mongoose ODM
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       DATABASE (MongoDB)                        │
│  Collections: users, projects, tasks, notifications, etc.       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | JavaScript runtime |
| **Express.js** | Web framework for REST API |
| **MongoDB** | NoSQL database |
| **Mongoose** | MongoDB ODM (Object Document Mapper) |
| **JWT** | JSON Web Tokens for authentication |
| **bcryptjs** | Password hashing |
| **multer** | File upload handling |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | UI library |
| **Vite** | Build tool and dev server |
| **React Router DOM** | Client-side routing |
| **Axios** | HTTP client for API calls |
| **TailwindCSS** | Utility-first CSS framework |
| **dnd-kit** | Drag and drop functionality |

---

## 🔧 Backend (Express.js)

### Understanding Express.js

Express.js is a minimal and flexible Node.js web application framework. Here's how it works in this project:

### 1. App Initialization (`server.js`)

```javascript
const express = require('express');
const app = express();

// Middleware - runs on every request
app.use(cors());           // Enable Cross-Origin Resource Sharing
app.use(express.json());   // Parse JSON request bodies
```

**Concept: Middleware**
Middleware functions are functions that have access to the request (`req`), response (`res`), and the next middleware function. They can:
- Execute code
- Modify request/response objects
- End the request-response cycle
- Call the next middleware

### 2. Route Definition

```javascript
// GET request - Fetch data
app.get('/api/projects', authMiddleware, async (req, res) => {
    const projects = await Project.find();
    res.json(projects);
});

// POST request - Create data
app.post('/api/projects', authMiddleware, async (req, res) => {
    const project = await Project.create(req.body);
    res.status(201).json(project);
});

// PUT request - Update data
app.put('/api/projects/:projectId', authMiddleware, async (req, res) => {
    const project = await Project.findByIdAndUpdate(req.params.projectId, req.body);
    res.json(project);
});

// DELETE request - Remove data
app.delete('/api/projects/:projectId', authMiddleware, async (req, res) => {
    await Project.findByIdAndDelete(req.params.projectId);
    res.json({ message: 'Deleted' });
});
```

**Concept: Route Parameters**
`:projectId` is a route parameter. Access it via `req.params.projectId`.

### 3. Custom Middleware

#### Authentication Middleware
```javascript
const authMiddleware = async (req, res, next) => {
    try {
        // Extract token from Authorization header
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        
        // Verify JWT token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Find user and attach to request
        const user = await User.findById(decoded.id);
        req.user = user;
        
        // Call next middleware
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};
```

#### Role-Based Authorization
```javascript
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        next();
    };
};

// Usage
app.delete('/api/projects/:id', 
    authMiddleware, 
    requireRole('SUPER_USER', 'MANAGER'),
    async (req, res) => { ... }
);
```

### 4. Error Handling

```javascript
app.get('/api/something', async (req, res) => {
    try {
        // Business logic
        const data = await SomeModel.find();
        res.json(data);
    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ 
            message: 'Something went wrong',
            error: err.message 
        });
    }
});
```

---

## ⚛️ Frontend (React)

### Understanding React Concepts Used

### 1. Functional Components

All components in this project are **functional components** using React Hooks.

```javascript
export default function SuperUserProjectsPage() {
    // Component logic here
    return (
        <div>
            {/* JSX - UI structure */}
        </div>
    );
}
```

### 2. useState Hook - State Management

```javascript
// Simple state
const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

// Object state
const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    status: 'PLANNING'
});

// Updating object state (spread operator)
setCreateForm({ ...createForm, name: 'New Name' });
```

**Key Point:** State updates trigger re-renders!

### 3. useEffect Hook - Side Effects

```javascript
// Run once on mount (empty dependency array)
useEffect(() => {
    loadProjects();
    loadUsers();
}, []);

// Run when dependency changes
useEffect(() => {
    if (selectedProject) {
        loadProjectTasks(selectedProject.id);
    }
}, [selectedProject]);

// Cleanup function
useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval); // Cleanup on unmount
}, []);
```

### 4. Conditional Rendering

```javascript
// Using && operator
{loading && <p>Loading...</p>}

// Using ternary operator
{isLoggedIn ? <Dashboard /> : <Login />}

// Multiple conditions
{task.status === 'WAITING_APPROVAL' ? (
    <span>Pending Approval</span>
) : task.status === 'COMPLETED' ? (
    <span>Completed</span>
) : (
    <select>...</select>
)}
```

### 5. List Rendering with map()

```javascript
{projects.map((project) => (
    <div key={project.id}>
        <h3>{project.name}</h3>
        <p>{project.description}</p>
    </div>
))}
```

**Key Point:** Always provide a unique `key` prop!

### 6. Event Handling

```javascript
// Button click
<button onClick={() => handleDelete(project.id)}>Delete</button>

// Form submission
<form onSubmit={handleSubmit}>
    <input 
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
    />
</form>

// Preventing event propagation
<button onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    handleAction();
}}>
```

### 7. Props - Component Communication

```javascript
// Parent component
<TaskCard 
    task={task} 
    onApprove={handleApprove} 
    onReject={handleReject} 
/>

// Child component
function TaskCard({ task, onApprove, onReject }) {
    return (
        <div>
            <h4>{task.title}</h4>
            <button onClick={() => onApprove(task.id)}>Approve</button>
        </div>
    );
}
```

### 8. React Router - Client-Side Routing

```javascript
// Route configuration
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/super/*" element={<SuperUserDashboard />} />
                <Route path="/manager/*" element={<ManagerDashboard />} />
                <Route path="/employee/*" element={<EmployeeDashboard />} />
                <Route path="*" element={<Navigate to="/login" />} />
            </Routes>
        </BrowserRouter>
    );
}

// Programmatic navigation
import { useNavigate } from 'react-router-dom';

function Component() {
    const navigate = useNavigate();
    
    const handleLogin = () => {
        // After login
        navigate('/super');
    };
}
```

---

## 📊 Database Models

### User Model
```javascript
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: {
        type: String,
        enum: ['SUPER_USER', 'MANAGER', 'EMPLOYEE', 'INTERN', 'STOCK_ADMIN'],
        default: 'EMPLOYEE'
    },
    createdAt: { type: Date, default: Date.now }
});
```

### Project Model
```javascript
const projectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    department: {
        type: String,
        enum: ['SOFTWARE', 'HARDWARE'],
        default: 'SOFTWARE'
    },
    status: {
        type: String,
        enum: ['PLANNING', 'ACTIVE', 'ON_HOLD', 'WAITING_APPROVAL', 'COMPLETED'],
        default: 'PLANNING'
    },
    managerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    attachments: [{
        name: String,
        url: String,
        uploadedAt: Date
    }]
});
```

### Task Model
```javascript
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    status: {
        type: String,
        enum: ['NOT_STARTED', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED', 'ON_HOLD'],
        default: 'NOT_STARTED'
    },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
```

### Notification Model
```javascript
const notificationSchema = new mongoose.Schema({
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, required: true },
    type: {
        type: String,
        enum: ['PROJECT_ASSIGNMENT', 'TASK_ASSIGNMENT', 'STATUS_UPDATE', 
               'APPROVAL_REQUEST', 'TASK_UPDATE', 'PROJECT_UPDATE', 'SYSTEM']
    },
    relatedId: mongoose.Schema.Types.ObjectId,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
```

---

## 🔄 Approval Workflow System

This is the **core business logic** of the application.

### Task Approval Flow

```
┌─────────────────┐
│   EMPLOYEE      │
│ Creates Task    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  NOT_STARTED    │
│     Status      │
└────────┬────────┘
         │ Works on task
         ▼
┌─────────────────┐
│  IN_PROGRESS    │
│     Status      │
└────────┬────────┘
         │ Clicks "Ask for Approval"
         ▼
┌─────────────────────────────────────┐
│        WAITING_APPROVAL             │
│ (Notification sent to Manager)      │
└────────────────┬────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌─────────┐             ┌─────────┐
│ MANAGER │             │ MANAGER │
│ Approves│             │ Rejects │
└────┬────┘             └────┬────┘
     │                       │
     ▼                       ▼
┌──────────┐           ┌────────────┐
│COMPLETED │           │IN_PROGRESS │
│ (Green)  │           │ (Rework)   │
└──────────┘           └────────────┘
```

### Project Approval Flow

```
┌─────────────────────────────────────┐
│   All Tasks Marked as COMPLETED     │
│   (Auto-triggered when last task    │
│    is approved by Manager)          │
└────────────────┬────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────┐
│   Project Status: WAITING_APPROVAL  │
│   (Notification sent to all         │
│    Super Admins)                    │
└────────────────┬────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
┌───────────┐           ┌───────────┐
│SUPER ADMIN│           │SUPER ADMIN│
│ Approves  │           │ Rejects   │
└─────┬─────┘           └─────┬─────┘
      │                       │
      ▼                       ▼
┌──────────┐            ┌──────────┐
│COMPLETED │            │  ACTIVE  │
│ (Purple) │            │ (Rework) │
└──────────┘            └──────────┘
```

### Backend Implementation

```javascript
// Task status update with approval logic
app.put('/api/tasks/:taskId', authMiddleware, async (req, res) => {
    const task = await Task.findById(req.params.taskId);
    const { status } = req.body;
    
    const isEmployeeOrIntern = ['EMPLOYEE', 'INTERN'].includes(req.user.role);
    const isManager = req.user.role === 'MANAGER';
    const isSuperUser = req.user.role === 'SUPER_USER';

    // RULE 1: Manager/Super User can set any status directly
    if (isManager || isSuperUser) {
        // If approving an employee's waiting task, notify them
        if (task.status === 'WAITING_APPROVAL' && task.assigneeId) {
            const action = status === 'COMPLETED' ? 'approved' : 'returned';
            await Notification.create({
                recipientId: task.assigneeId,
                type: 'TASK_UPDATE',
                message: `Your task was ${action}`
            });
        }
        task.status = status;
    }
    // RULE 2: Employee/Intern requesting approval
    else if (isEmployeeOrIntern && 
             (status === 'WAITING_APPROVAL' || status === 'COMPLETED')) {
        task.status = 'WAITING_APPROVAL';
        // Notify manager
        const project = await Project.findById(task.projectId);
        if (project?.managerId) {
            await Notification.create({
                recipientId: project.managerId,
                type: 'APPROVAL_REQUEST',
                message: `Task needs approval`
            });
        }
    }
    // RULE 3: Standard status change
    else {
        task.status = status;
    }

    await task.save();

    // AUTO-UPDATE PROJECT STATUS
    if (task.projectId) {
        const allTasks = await Task.find({ projectId: task.projectId });
        const allCompleted = allTasks.every(t => t.status === 'COMPLETED');
        
        if (allCompleted) {
            const project = await Project.findById(task.projectId);
            project.status = 'WAITING_APPROVAL';
            await project.save();
            
            // Notify all Super Admins
            const admins = await User.find({ role: 'SUPER_USER' });
            for (const admin of admins) {
                await Notification.create({
                    recipientId: admin._id,
                    type: 'APPROVAL_REQUEST',
                    message: `Project ready for approval`
                });
            }
        }
    }
});
```

---

## 🔐 Authentication & Authorization

### JWT (JSON Web Token) Flow

```
┌──────────┐     1. POST /login        ┌──────────┐
│  Client  │  ─────────────────────▶  │  Server  │
│          │   { email, password }     │          │
│          │                           │          │
│          │     2. JWT Token          │          │
│          │  ◀─────────────────────   │          │
│          │   { token: "eyJ..." }     │          │
│          │                           │          │
│          │  3. API Request           │          │
│          │  ─────────────────────▶   │          │
│          │  Header: Authorization:   │          │
│          │  Bearer eyJ...            │          │
│          │                           │          │
│          │  4. Response              │          │
│          │  ◀─────────────────────   │          │
└──────────┘                           └──────────┘
```

### Token Storage (Frontend)

```javascript
// services/authService.js
export const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('user', JSON.stringify(res.data.user));
    return res.data;
};

export const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
};

export const getCurrentUser = () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
};
```

### API Service with Auth Header

```javascript
// services/api.js
import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api'
});

// Interceptor adds token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

export default api;
```

---

## 📡 API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login and get JWT |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users` | List all users |
| GET | `/api/users/:id` | Get user by ID |
| PUT | `/api/users/:id` | Update user |
| DELETE | `/api/users/:id` | Delete user |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project details |
| PUT | `/api/projects/:id` | Update project |
| PUT | `/api/projects/:id/status` | Update project status |
| DELETE | `/api/projects/:id` | Delete project |
| POST | `/api/projects/:id/attachments` | Upload files |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/tasks` | List project tasks |
| POST | `/api/projects/:id/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| PUT | `/api/tasks/:id/status` | Quick status update |
| DELETE | `/api/tasks/:id` | Delete task |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get user's notifications |
| PUT | `/api/notifications/:id/read` | Mark as read |
| PUT | `/api/notifications/read-all` | Mark all as read |

---

## 📁 File Structure

```
Project Management/
├── client/                          # Frontend (React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/              # Shared layouts
│   │   │   │   ├── SuperUserLayout.jsx
│   │   │   │   ├── ManagerLayout.jsx
│   │   │   │   ├── EmployeeLayout.jsx
│   │   │   │   └── InternLayout.jsx
│   │   │   ├── dashboard/           # Role-specific pages
│   │   │   │   ├── SuperUserDashboard.jsx
│   │   │   │   ├── SuperUserProjectsPage.jsx
│   │   │   │   ├── ManagerDashboard.jsx
│   │   │   │   ├── ManagerProjectsPage.jsx
│   │   │   │   ├── EmployeeDashboard.jsx
│   │   │   │   ├── EmployeeProjectsPage.jsx
│   │   │   │   ├── InternDashboard.jsx
│   │   │   │   └── InternProjectsPage.jsx
│   │   │   └── auth/
│   │   │       └── LoginPage.jsx
│   │   ├── services/
│   │   │   ├── api.js               # Axios instance
│   │   │   └── authService.js       # Auth functions
│   │   ├── App.jsx                  # Main app with routes
│   │   └── main.jsx                 # Entry point
│   ├── package.json
│   └── vite.config.js
│
├── server/                          # Backend (Express)
│   ├── models/
│   │   ├── User.js
│   │   ├── Project.js
│   │   ├── Task.js
│   │   ├── Notification.js
│   │   ├── Product.js               # Stock module
│   │   ├── Supplier.js
│   │   ├── PurchaseOrder.js
│   │   ├── IssuedItem.js
│   │   ├── Activity.js
│   │   └── index.js                 # Export all models
│   ├── services/
│   │   └── scraperService.js
│   ├── db.js                        # MongoDB connection
│   ├── server.js                    # Main server file
│   ├── seed.js                      # Database seeding
│   └── package.json
│
└── DOCUMENTATION.md                 # This file
```

---

## 📖 Key Concepts Summary

### Express.js Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Middleware** | Functions that process requests | `app.use(cors())` |
| **Routing** | Map URLs to handlers | `app.get('/api/users', ...)` |
| **Route Params** | Dynamic URL segments | `/api/users/:id` |
| **Request Body** | POST/PUT data | `req.body` |
| **Query Params** | URL query string | `req.query.search` |
| **Response** | Send data back | `res.json(data)` |
| **Status Codes** | HTTP response codes | `res.status(201)` |
| **async/await** | Handle Promises | `const data = await Model.find()` |

### React Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **Functional Components** | Functions returning JSX | `function App() { return <div /> }` |
| **useState** | Local state management | `const [x, setX] = useState(0)` |
| **useEffect** | Side effects | `useEffect(() => {...}, [deps])` |
| **Props** | Pass data to children | `<Child data={data} />` |
| **Conditional Rendering** | Show/hide based on state | `{show && <Modal />}` |
| **List Rendering** | Render arrays | `{items.map(i => <Item key={i.id} />)}` |
| **Event Handling** | Handle user actions | `onClick={() => handleClick()}` |
| **Controlled Components** | Form inputs tied to state | `value={state} onChange={...}` |

---

## 🎓 Learning Resources

### Express.js
- [Express.js Official Guide](https://expressjs.com/en/guide/routing.html)
- [MDN Express Tutorial](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs)
- [REST API Design Best Practices](https://restfulapi.net/)

### React
- [React Official Documentation](https://react.dev/)
- [React Hooks Guide](https://react.dev/reference/react)
- [React Router Documentation](https://reactrouter.com/)

### MongoDB & Mongoose
- [Mongoose Documentation](https://mongoosejs.com/docs/)
- [MongoDB University](https://university.mongodb.com/)

### Authentication
- [JWT.io](https://jwt.io/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 🚀 Running the Project

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)

### Backend Setup
```bash
cd server
npm install
npm run dev
```

### Frontend Setup
```bash
cd client
npm install
npm run dev
```

### Environment Variables
Create `.env` in server folder:
```
MONGODB_URI=mongodb://localhost:27017/ipms
JWT_SECRET=your-secret-key
PORT=5000
```

---

## 📝 Author Notes

This project demonstrates:
1. ✅ Full-stack JavaScript development
2. ✅ RESTful API design
3. ✅ JWT authentication
4. ✅ Role-based access control (RBAC)
5. ✅ Multi-level approval workflows
6. ✅ Real-time notifications
7. ✅ Modern React patterns (Hooks, functional components)
8. ✅ MongoDB with Mongoose ODM

---

*Documentation generated for IPMS - Internal Project Management System*
*Last updated: January 2026*
