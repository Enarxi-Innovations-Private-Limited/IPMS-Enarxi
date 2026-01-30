# Manager Self-Assignment & Performance Tracking Implementation Plan

## Objective
Enable Managers to assign tasks to themselves via drag-and-drop, track their work completion, and generate performance analytics based on their completed tasks.

---

## Current Flow (Screenshot Reference)
- **"Mark as Completed"** drop zone exists
- Tasks can be dragged directly to completion
- **Problem**: No tracking of WHO completed the task (Manager vs Employee)

## Proposed New Flow
1. **"Assign to Yourself"** drop zone (Replaces or sits alongside "Mark as Completed")
2. Manager drags task → Task gets assigned to the Manager
3. Manager works on task → Marks it as "Completed" manually
4. **Benefit**: System knows the Manager personally worked on this task

---

## Feature Breakdown

### 1. UI Changes (Frontend)

#### A. Rename/Modify Drop Zone
**File**: `ManagerProjectsPage.jsx` or `ManagerTasksPage.jsx`

**Current**:
```
┌─────────────────────────┐
│   Mark as Completed     │
│   (Drag here)           │
└─────────────────────────┘
```

**Proposed**:
```
┌─────────────────────────┐
│   Assign to Yourself    │
│   (Drag task here)      │
└─────────────────────────┘
        ↓ (After Assignment)
┌─────────────────────────┐
│   Mark as Completed     │
│   (Only for YOUR tasks) │
└─────────────────────────┘
```

#### B. Drop Zone Logic
- **onDrop for "Assign to Yourself"**: Call `api.put('/tasks/:id', { assigneeId: currentUser.id })`
- **onDrop for "Mark as Completed"**: Only allow if `task.assigneeId === currentUser.id`

#### C. Visual Indicators
- Tasks assigned to the Manager should have a special badge: "📌 Assigned to You"
- Different background color for self-assigned tasks

---

### 2. Backend Changes

#### A. Task Model Update (Optional Enhancement)
**File**: `server/models/Task.js`

Add fields for performance tracking:
```javascript
{
    assignedAt: Date,       // When task was assigned
    completedAt: Date,      // When task was marked complete
    completedBy: ObjectId,  // Who actually completed it (ref: User)
    selfAssigned: Boolean,  // Was this self-assigned by manager?
}
```

#### B. API Endpoints

**Existing** (Modify):
- `PUT /api/tasks/:id` - Already supports `assigneeId` update

**New Endpoints**:
- `GET /api/manager/my-tasks` - Get tasks assigned to logged-in manager
- `GET /api/manager/performance` - Performance analytics for manager

**Performance Analytics Response**:
```json
{
    "totalTasksAssigned": 25,
    "totalTasksCompleted": 20,
    "completionRate": 80,
    "averageCompletionTime": "2.5 days",
    "tasksByMonth": [
        { "month": "Jan 2026", "assigned": 10, "completed": 8 }
    ]
}
```

---

### 3. Performance Analytics Dashboard

#### A. New Section in Manager Dashboard
**File**: `ManagerDashboard.jsx`

Add a "My Performance" card showing:
- Tasks I've completed this month
- Average time to completion
- Completion rate percentage
- Trend graph (optional)

#### B. Metrics to Track
| Metric | Description |
|--------|-------------|
| Tasks Assigned to Self | Count of tasks manager took on |
| Tasks Completed | Count of completed self-assigned tasks |
| Completion Rate | (Completed / Assigned) × 100 |
| Avg. Completion Time | Average days from assignment to completion |
| On-Time Completion | Tasks completed before deadline |

---

### 4. Database Schema Changes

#### Task Schema Additions
```javascript
// In Task model
selfAssignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
},
selfAssignedAt: {
    type: Date
},
completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
},
completedAt: {
    type: Date
}
```

---

### 5. Implementation Steps

#### Phase 1: Core Self-Assignment (Priority: HIGH) ✅ COMPLETED
1. [x] Added "Assign to Yourself" drop zone (DroppableSelfAssignZone component)
2. [x] Modified `onDrop` handler to call assign API with manager's ID and self-assignment tracking
3. [x] Added "Mark as Completed" drop zone with validation (only for tasks assigned to you)
4. [x] Added visual indicator showing available tasks for completion

#### Phase 2: Backend Tracking (Priority: HIGH) ✅ COMPLETED
1. [x] Added `selfAssignedBy`, `selfAssignedAt`, `completedBy` fields to Task model
2. [x] Updated task assignment logic to populate these fields
3. [x] Updated task completion logic to record who completed it

#### Phase 3: Performance Analytics (Priority: MEDIUM) ✅ COMPLETED
1. [x] Created `GET /api/manager/performance` endpoint with metrics
2. [x] Added "My Performance" section to Manager Dashboard
3. [x] Displaying key metrics (completion rate, avg time, on-time rate, recent completions)

#### Phase 4: Reporting (Priority: LOW)
1. [ ] Add monthly/weekly performance reports
2. [ ] Export performance data to Excel
3. [ ] Compare performance across time periods

---

## UI Mockup Concept

```
┌─────────────────────────────────────────────────────────┐
│  📋 TEAM & TASKS                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────┐                   │
│  │  👤 Assign to Yourself          │  ← DROP ZONE 1   │
│  │  Drag a task here to take it   │                   │
│  └─────────────────────────────────┘                   │
│                                                         │
│  ┌─────────────────────────────────┐                   │
│  │  ✅ Mark as Completed           │  ← DROP ZONE 2   │
│  │  (Only YOUR assigned tasks)    │                   │
│  └─────────────────────────────────┘                   │
│                                                         │
│  ┌─────────────────────────────────┐                   │
│  │  📊 MY PERFORMANCE              │                   │
│  │  ──────────────────────────────│                   │
│  │  This Month:                    │                   │
│  │  • Assigned: 8 tasks            │                   │
│  │  • Completed: 6 tasks           │                   │
│  │  • Rate: 75%                    │                   │
│  └─────────────────────────────────┘                   │
│                                                         │
│  ┌─────────────────────────────────┐                   │
│  │  👥 Team Members                │                   │
│  │  • John (3 tasks)               │                   │
│  │  • Sarah (5 tasks)              │                   │
│  └─────────────────────────────────┘                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Benefits
1. **Accountability**: Clear record of manager's personal contributions
2. **Performance Metrics**: Objective data for manager evaluations
3. **Workload Visibility**: See how much managers are doing vs delegating
4. **Fair Assessment**: Distinguish between managing and executing

---

## Next Steps
1. Review and approve this plan
2. Start with Phase 1 (UI changes)
3. Implement backend tracking
4. Add performance dashboard

Would you like me to proceed with implementation?
