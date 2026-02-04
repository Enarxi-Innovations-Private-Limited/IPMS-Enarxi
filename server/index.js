const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-me';

app.use(cors());
app.use(express.json());

// In-memory storage for demo purposes (replace with DB in production)
const roles = {
  SUPER_USER: 'SUPER_USER',
  EMPLOYEE: 'EMPLOYEE',
  INTERN: 'INTERN',
};


// In-memory users array (empty - add users via API)
const users = [];

// Projects and tasks in-memory
const projects = [];
const tasks = [];
const activities = [];

// Utility: record activity
function recordActivity(userId, action, details) {
  activities.push({
    id: uuid(),
    userId,
    action,
    details,
    createdAt: new Date().toISOString(),
  });
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Missing Authorization header' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Invalid Authorization header' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

// RBAC middleware
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { employeeId, password } = req.body;
  if (!employeeId || !password) {
    return res.status(400).json({ message: 'Employee ID and password are required' });
  }

  // Find user by employeeId (case-insensitive)
  const user = users.find((u) => u.employeeId?.toUpperCase() === employeeId.toUpperCase());
  if (!user) return res.status(401).json({ message: 'Invalid Employee ID or password' });

  const match = bcrypt.compareSync(password, user.passwordHash);
  if (!match) return res.status(401).json({ message: 'Invalid Employee ID or password' });

  const token = jwt.sign(
    { id: user.id, role: user.role, name: user.name, email: user.email, employeeId: user.employeeId },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  recordActivity(user.id, 'LOGIN', { employeeId: user.employeeId });

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role },
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ id: user.id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role, department: user.department });
});

// Change password (any authenticated user)
app.put('/api/auth/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'New password must be at least 6 characters' });
  }

  const user = users.find((u) => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Verify current password
  if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ message: 'Current password is incorrect' });
  }

  // Update password
  user.passwordHash = bcrypt.hashSync(newPassword, 10);

  res.json({ message: 'Password changed successfully' });
});

// Get all users (for team assignment - Super User and Employee)
app.get('/api/users', authMiddleware, requireRole(roles.SUPER_USER, roles.EMPLOYEE), (req, res) => {
  // Return only employees and interns (not super users)
  const teamMembers = users
    .filter((u) => u.role === roles.EMPLOYEE || u.role === roles.INTERN)
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      employeeId: u.employeeId,
      role: u.role,
      department: u.department,
    }));
  console.log('Returning team members:', teamMembers); // Debug log
  res.json(teamMembers);
});

// Get user details with projects and tasks (Super User only)
app.get('/api/users/:userId/details', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const targetUser = users.find((u) => u.id === req.params.userId);
  if (!targetUser) {
    return res.status(404).json({ message: 'User not found' });
  }

  // Get projects the user is part of
  const userProjects = projects.filter((p) => p.teamIds && p.teamIds.includes(targetUser.id));

  // Get tasks assigned to the user
  const userTasks = tasks.filter((t) => t.assigneeId === targetUser.id);

  res.json({
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    employeeId: targetUser.employeeId,
    role: targetUser.role,
    department: targetUser.department,
    projects: userProjects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
    })),
    tasks: userTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      projectId: t.projectId,
      projectName: projects.find((p) => p.id === t.projectId)?.name || 'Unknown',
    })),
  });
});

// Create new user (Super User only)
app.post('/api/users', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  console.log('POST /api/users - Creating new user');
  console.log('Request body:', req.body);
  const { name, email, employeeId, role, department, password } = req.body;

  if (!name || !email || !employeeId || !role || !password) {
    console.log('Validation failed: missing required fields');
    return res.status(400).json({ message: 'Name, email, employeeId, role, and password are required' });
  }

  // Check if employeeId or email already exists
  if (users.find((u) => u.employeeId === employeeId)) {
    return res.status(400).json({ message: 'Employee ID already exists' });
  }
  if (users.find((u) => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists' });
  }

  const newUser = {
    id: uuid(),
    name,
    email,
    employeeId,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    department: department || null,
  };

  users.push(newUser);

  // Log activity for user creation
  activities.push({
    id: uuid(),
    type: 'USER_CREATED',
    message: `New ${role.toLowerCase()} ${name} (${employeeId}) was added to ${department || 'team'}`,
    userId: req.user.id,
    userName: req.user.name,
    targetId: newUser.id,
    targetName: newUser.name,
    timestamp: new Date().toISOString(),
  });

  res.status(201).json({
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    employeeId: newUser.employeeId,
    role: newUser.role,
    department: newUser.department,
  });
});

// Edit user (Super User only)
app.put('/api/users/:userId', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const userIndex = users.findIndex((u) => u.id === req.params.userId);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }

  const targetUser = users[userIndex];

  // Prevent editing super users
  if (targetUser.role === roles.SUPER_USER) {
    return res.status(403).json({ message: 'Cannot edit super user' });
  }

  const { name, email, role, department, password } = req.body;

  // Check if email is already used by another user
  if (email && email !== targetUser.email) {
    if (users.find((u) => u.email === email && u.id !== req.params.userId)) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    targetUser.email = email;
  }

  // Update fields if provided
  if (name) targetUser.name = name;
  if (role && (role === 'EMPLOYEE' || role === 'INTERN')) targetUser.role = role;
  if (department !== undefined) targetUser.department = department;
  if (password) targetUser.passwordHash = bcrypt.hashSync(password, 10);

  // Log activity
  activities.push({
    id: uuid(),
    type: 'USER_UPDATED',
    message: `User ${targetUser.name} was updated`,
    userId: req.user.id,
    userName: req.user.name,
    targetId: targetUser.id,
    targetName: targetUser.name,
    timestamp: new Date().toISOString(),
  });

  res.json({
    id: targetUser.id,
    name: targetUser.name,
    email: targetUser.email,
    employeeId: targetUser.employeeId,
    role: targetUser.role,
    department: targetUser.department,
  });
});

// Delete user (Super User only)
app.delete('/api/users/:userId', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const userIndex = users.findIndex((u) => u.id === req.params.userId);
  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found' });
  }

  const targetUser = users[userIndex];

  // Prevent deleting super users
  if (targetUser.role === roles.SUPER_USER) {
    return res.status(403).json({ message: 'Cannot delete super user' });
  }

  // Log activity before deletion
  activities.push({
    id: uuid(),
    type: 'USER_DELETED',
    message: `User ${targetUser.name} (${targetUser.employeeId}) was removed`,
    userId: req.user.id,
    userName: req.user.name,
    targetId: targetUser.id,
    targetName: targetUser.name,
    timestamp: new Date().toISOString(),
  });

  // Remove user from all project teams
  projects.forEach((p) => {
    if (p.teamIds) {
      p.teamIds = p.teamIds.filter((id) => id !== req.params.userId);
    }
  });

  // Remove user's tasks (or you might want to reassign them)
  const userTaskIds = tasks.filter((t) => t.assigneeId === req.params.userId).map((t) => t.id);
  userTaskIds.forEach((taskId) => {
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex !== -1) {
      tasks.splice(taskIndex, 1);
    }
  });

  // Remove user
  users.splice(userIndex, 1);

  res.json({ message: 'User deleted successfully' });
});

// Activity Logs (Super User only)
app.get('/api/activity-logs', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  // Return activities sorted by timestamp (newest first), limited to 50
  const sortedActivities = [...activities]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  res.json(sortedActivities);
});

// Project routes
// Create project (Super User only)
app.post('/api/projects', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const { name, description, teamIds = [] } = req.body;
  const project = {
    id: uuid(),
    name,
    description: description || '',
    status: 'ACTIVE', // ACTIVE | COMPLETED
    teamIds,
    createdBy: req.user.id,
    createdAt: new Date().toISOString(),
  };
  projects.push(project);

  recordActivity(req.user.id, 'PROJECT_CREATED', { projectId: project.id, name: project.name });

  res.status(201).json(project);
});

// Assign team to project (Super User only)
app.put(
  '/api/projects/:projectId/team',
  authMiddleware,
  requireRole(roles.SUPER_USER),
  (req, res) => {
    const { projectId } = req.params;
    const { teamIds } = req.body;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    project.teamIds = teamIds || [];
    recordActivity(req.user.id, 'PROJECT_TEAM_UPDATED', { projectId });
    res.json(project);
  }
);

// List projects based on role
app.get('/api/projects', authMiddleware, (req, res) => {
  const user = req.user;
  let visibleProjects;

  if (user.role === roles.SUPER_USER) {
    visibleProjects = projects;
  } else {
    // Employee or Intern: projects where user is in teamIds or has tasks
    const projectIdsWithTasks = tasks
      .filter((t) => t.assigneeId === user.id)
      .map((t) => t.projectId);
    const projectIdsSet = new Set(projectIdsWithTasks);

    visibleProjects = projects.filter(
      (p) => p.teamIds.includes(user.id) || projectIdsSet.has(p.id)
    );
  }

  res.json(visibleProjects);
});

// Project summary analytics (Super User)
app.get(
  '/api/projects/summary',
  authMiddleware,
  requireRole(roles.SUPER_USER),
  (req, res) => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === 'ACTIVE').length;
    const completed = projects.filter((p) => p.status === 'COMPLETED').length;

    // project completion percentage based on tasks
    const projectSummaries = projects.map((p) => {
      const projectTasks = tasks.filter((t) => t.projectId === p.id);
      const done = projectTasks.filter((t) => t.status === 'COMPLETED').length;
      const completion = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;
      return { projectId: p.id, name: p.name, completion };
    });

    // delayed projects placeholder (no due dates here, so mark 0)
    const delayed = 0;

    // workload distribution: tasks per user
    const workload = {};
    tasks.forEach((t) => {
      const userId = t.assigneeId;
      workload[userId] = (workload[userId] || 0) + 1;
    });

    res.json({
      total,
      active,
      completed,
      delayed,
      projectSummaries,
      workload,
    });
  }
);

// Update project status (Super User / Manager)
app.put('/api/projects/:projectId/status', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const { projectId } = req.params;
  const { status } = req.body;
  const allowedStatuses = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const project = projects.find((p) => p.id === projectId);
  if (!project) return res.status(404).json({ message: 'Project not found' });

  project.status = status;
  recordActivity(req.user.id, 'PROJECT_STATUS_UPDATED', { projectId, status });

  res.json(project);
});

// Mark project completed (Super User)
app.put(
  '/api/projects/:projectId/complete',
  authMiddleware,
  requireRole(roles.SUPER_USER),
  (req, res) => {
    const { projectId } = req.params;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    project.status = 'COMPLETED';
    recordActivity(req.user.id, 'PROJECT_COMPLETED', { projectId });
    res.json(project);
  }
);

// Task routes
// Create task (Employee only, within assigned project)
app.post(
  '/api/tasks',
  authMiddleware,
  requireRole(roles.EMPLOYEE, roles.SUPER_USER),
  (req, res) => {
    const { projectId, title, description, assigneeId } = req.body;
    const project = projects.find((p) => p.id === projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Employee can only create tasks in projects they are assigned to
    if (req.user.role === roles.EMPLOYEE && !project.teamIds.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not part of this project team' });
    }

    const task = {
      id: uuid(),
      projectId,
      title,
      description: description || '',
      status: 'NOT_STARTED', // NOT_STARTED | IN_PROGRESS | COMPLETED
      assigneeId: assigneeId !== undefined ? assigneeId : (['EMPLOYEE', 'INTERN'].includes(req.user.role) ? req.user.id : null),
      createdBy: req.user.id,
      createdAt: new Date().toISOString(),
      comments: [],
      queries: [],  // Task queries for manager
      history: [],
      transferredFrom: null,
    };
    tasks.push(task);

    // Automation: If project is PLANNING and task is assigned, switch to ACTIVE
    if (project.status === 'PLANNING' && task.assigneeId) {
      project.status = 'ACTIVE';
      recordActivity(req.user.id, 'PROJECT_STATUS_UPDATED', { projectId, status: 'ACTIVE', reason: 'Task Assignment' });
    }

    recordActivity(req.user.id, 'TASK_CREATED', { taskId: task.id, projectId });

    res.status(201).json(task);
  }
);

// Generic Task Update (Manager/Super User) - e.g., for reassignment via drag-and-drop
app.put('/api/tasks/:taskId', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const { taskId } = req.params;
  const { title, description, assigneeId, status } = req.body;

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const project = projects.find(p => p.id === task.projectId);

  // Update fields if provided
  if (title) task.title = title;
  if (description) task.description = description;

  // Handle Assignment Change
  if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
    // Check if project status needs update
    if (project && project.status === 'PLANNING' && assigneeId) {
      project.status = 'ACTIVE';
      recordActivity(req.user.id, 'PROJECT_STATUS_UPDATED', { projectId: project.id, status: 'ACTIVE', reason: 'Task Assignment' });
    }

    task.assigneeId = assigneeId;
    // Record history/activity for assignment change?
    recordActivity(req.user.id, 'TASK_UPDATED', { taskId, update: 'Assignee Changed' });
  }

  if (status) task.status = status;

  res.json(task);
});

// Assign or transfer task to another team member (Employee only)
app.put(
  '/api/tasks/:taskId/transfer',
  authMiddleware,
  requireRole(roles.EMPLOYEE, roles.SUPER_USER),
  (req, res) => {
    const { taskId } = req.params;
    const { newAssigneeId, reason } = req.body;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const project = projects.find((p) => p.id === task.projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    if (!project.teamIds.includes(newAssigneeId)) {
      return res.status(400).json({ message: 'New assignee is not part of project team' });
    }

    // Record history
    task.history.push({
      from: task.assigneeId,
      to: newAssigneeId,
      reason: reason || '',
      transferredBy: req.user.id,
      transferredAt: new Date().toISOString(),
    });
    task.transferredFrom = task.assigneeId;
    task.assigneeId = newAssigneeId;

    recordActivity(req.user.id, 'TASK_TRANSFERRED', { taskId, newAssigneeId, reason });

    res.json(task);
  }
);

// Update task status (Employee + Intern permitted for their tasks)
app.put('/api/tasks/:taskId/status', authMiddleware, (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;
  const allowedStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  // Only assignee or Super User can update
  if (req.user.role !== roles.SUPER_USER && task.assigneeId !== req.user.id) {
    return res.status(403).json({ message: 'Not allowed to update this task' });
  }

  task.status = status;
  recordActivity(req.user.id, 'TASK_STATUS_UPDATED', { taskId, status });

  res.json(task);
});

// Add work update or comment (Employee + Intern on their tasks)
app.post('/api/tasks/:taskId/comments', authMiddleware, (req, res) => {
  const { taskId } = req.params;
  const { text } = req.body;
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  if (req.user.role !== roles.SUPER_USER && task.assigneeId !== req.user.id) {
    return res.status(403).json({ message: 'Not allowed to comment on this task' });
  }

  const comment = {
    id: uuid(),
    userId: req.user.id,
    text,
    createdAt: new Date().toISOString(),
  };
  task.comments.push(comment);

  recordActivity(req.user.id, 'TASK_COMMENT_ADDED', { taskId });

  res.status(201).json(comment);
});

// Get tasks (role-based)
app.get('/api/tasks', authMiddleware, (req, res) => {
  const user = req.user;
  let visibleTasks;
  if (user.role === roles.SUPER_USER) {
    visibleTasks = tasks;
  } else {
    visibleTasks = tasks.filter((t) => t.assigneeId === user.id || t.createdBy === user.id);
  }
  res.json(visibleTasks);
});

// Activity feed (Super User only)
app.get('/api/activities', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  res.json(
    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  );
});

// Raise a query on a task (Employee + Intern on their tasks)
app.post('/api/tasks/:taskId/queries', authMiddleware, (req, res) => {
  const { taskId } = req.params;
  const { question } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ message: 'Query question is required' });
  }

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  // Only assignee can raise a query (or Super User for testing)
  if (req.user.role !== roles.SUPER_USER && task.assigneeId !== req.user.id) {
    return res.status(403).json({ message: 'Not allowed to raise query on this task' });
  }

  // Initialize queries array if not exists
  if (!task.queries) {
    task.queries = [];
  }

  const query = {
    id: uuid(),
    userId: req.user.id,
    userName: req.user.name,
    question: question.trim(),
    status: 'PENDING', // PENDING | RESOLVED
    response: null,
    respondedBy: null,
    respondedByName: null,
    createdAt: new Date().toISOString(),
    respondedAt: null,
  };
  task.queries.push(query);

  recordActivity(req.user.id, 'TASK_QUERY_RAISED', { taskId, queryId: query.id });

  res.status(201).json(query);
});

// Respond to a query (Super User only - acting as manager)
app.put('/api/tasks/:taskId/queries/:queryId/respond', authMiddleware, requireRole(roles.SUPER_USER), (req, res) => {
  const { taskId, queryId } = req.params;
  const { response } = req.body;

  if (!response || !response.trim()) {
    return res.status(400).json({ message: 'Response is required' });
  }

  const task = tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ message: 'Task not found' });

  if (!task.queries) {
    return res.status(404).json({ message: 'No queries found for this task' });
  }

  const query = task.queries.find((q) => q.id === queryId);
  if (!query) return res.status(404).json({ message: 'Query not found' });

  query.response = response.trim();
  query.respondedBy = req.user.id;
  query.respondedByName = req.user.name;
  query.status = 'RESOLVED';
  query.respondedAt = new Date().toISOString();

  recordActivity(req.user.id, 'TASK_QUERY_RESPONDED', { taskId, queryId });

  res.json(query);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


