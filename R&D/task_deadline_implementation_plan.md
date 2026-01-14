# Implementation Plan: Task Deadlines & Performance Tracking (Revised)

## Overview
Managers can set deadlines for tasks. Performance is automatically calculated based on:
- **Start Date:** When task is assigned to an employee
- **Deadline:** Set by manager
- **Completion Date:** When task is marked as completed

Performance is integrated into the **Team Member Details Modal** (no separate page).

---

## Performance Calculation Logic

### Formula
```
Performance Score = (Allocated Time / Actual Time Taken) × 100
```

### Examples

| Allocated Time | Time Taken | Performance | Interpretation |
|----------------|------------|-------------|----------------|
| 2 days | 1 day | 200% | Excellent - finished in half the time |
| 2 days | 2 days | 100% | On Track - finished exactly on time |
| 2 days | 3 days | 66.67% | Below Expectation - took 1 day extra |
| 2 days | 4 days | 50% | Poor - took double the time |
| 8 hours | 4 hours | 200% | Excellent - finished in half the time |
| 8 hours | 10 hours | 80% | Slightly Below - took 2 hours extra |

### Time Unit Rules
- **If deadline ≥ 1 day:** Calculate in days
- **If deadline < 1 day:** Calculate in hours

### Edge Cases
- Task not completed yet: Show "In Progress" with time remaining/overdue
- Task completed before assignment: Default to 100%
- Deadline not set: No performance calculation for that task

---

## Phase 1: Database Schema Updates

### 1.1 Update Task Model
**File:** `server/models/Task.js`

Add these fields:
```javascript
{
  assignedAt: { type: Date, default: null },       // When task was assigned (start date)
  deadline: { type: Date, default: null },          // Deadline set by manager
  completedAt: { type: Date, default: null },       // When task was completed
  allocatedDuration: { type: Number, default: null }, // In minutes (calculated from assignedAt to deadline)
  actualDuration: { type: Number, default: null },    // In minutes (calculated from assignedAt to completedAt)
  performanceScore: { type: Number, default: null }   // Calculated percentage
}
```

---

## Phase 2: Backend API Updates

### 2.1 Task Assignment Logic
**When a task is assigned (assigneeId is set):**
- Set `assignedAt` to current timestamp
- If `deadline` is already set, calculate `allocatedDuration`

### 2.2 Deadline Setting Endpoint
```
PUT /api/tasks/:taskId/deadline
Body: { deadline: "2026-01-15T18:00:00.000Z" }
```
**Logic:**
- Set `deadline` field
- Calculate `allocatedDuration` = deadline - assignedAt (in minutes)

### 2.3 Task Completion Logic
**When status changes to COMPLETED or WAITING_APPROVAL:**
- Set `completedAt` to current timestamp
- Calculate `actualDuration` = completedAt - assignedAt (in minutes)
- Calculate `performanceScore` = (allocatedDuration / actualDuration) × 100

### 2.4 Get User Performance Endpoint
```
GET /api/users/:userId/performance
Response: {
  userId: "...",
  name: "Kailash",
  stats: {
    totalTasks: 15,
    completedTasks: 12,
    averagePerformance: 115.5,  // Average across all completed tasks
    excellentTasks: 5,          // Score >= 150%
    onTimeTasks: 4,             // Score 90-149%
    lateTasks: 3,               // Score < 90%
    pendingTasks: 3
  },
  tasks: [
    {
      id: "...",
      title: "Fix login bug",
      assignedAt: "2026-01-10T09:00:00Z",
      deadline: "2026-01-12T18:00:00Z",
      completedAt: "2026-01-11T14:00:00Z",
      allocatedDuration: 2940,   // in minutes
      actualDuration: 1740,      // in minutes
      performanceScore: 169,     // %
      status: "COMPLETED"
    }
  ]
}
```

---

## Phase 3: Frontend Updates

### 3.1 Task Creation/Edit - Add Deadline Field
**Files:** 
- `ManagerDashboard.jsx`
- `ManagerProjectsPage.jsx`
- `TaskDetailModal.jsx`

Add:
- Date picker input for deadline
- Display allocated time (e.g., "3 days" or "8 hours")

### 3.2 Task Table - Show Deadline Status
Add deadline column with visual indicators:
```
| Task         | Assignee | Deadline         | Status      |
|--------------|----------|------------------|-------------|
| Fix bug      | Kailash  | 🟢 Jan 15 (2d)   | In Progress |
| Add feature  | Priya    | 🔴 Jan 10 (late) | In Progress |
| Update docs  | Kailash  | ✅ Completed     | 169% 🚀     |
```

**Color Codes:**
- 🟢 Green: More than 1 day remaining
- 🟡 Yellow: Less than 1 day remaining
- 🔴 Red: Overdue
- ✅ Completed with score

### 3.3 Team Member Details Modal - Add Performance Tab
**File:** `ManagerTeamPage.jsx`

Update the "View Details" modal to show:

```
┌─────────────────────────────────────────────────────────────┐
│ 👤 Kailash - Employee                                       │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ 📊 PERFORMANCE SUMMARY                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Average Performance: 115.5% 🎯                          │ │
│ │ ───────────────────────────────────────────────────────│ │
│ │ 🚀 Excellent (≥150%): 5 tasks                          │ │
│ │ ✅ On Time (90-149%): 4 tasks                          │ │
│ │ ⚠️ Late (<90%):       3 tasks                          │ │
│ │ ⏳ Pending:           3 tasks                          │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 📋 TASK HISTORY                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Task              │ Allocated │ Actual │ Performance   │ │
│ │ ─────────────────────────────────────────────────────── │ │
│ │ Fix login bug     │ 2 days    │ 1d 5h  │ 169% 🚀      │ │
│ │ Add payment API   │ 3 days    │ 3 days │ 100% ✅      │ │
│ │ Update dashboard  │ 1 day     │ 2 days │ 50% ⚠️       │ │
│ │ Create reports    │ 2 days    │ -      │ ⏳ In Progress│ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                    [Close]  │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Assignment Flow Update

### Current Flow:
1. Manager creates task → Optionally assigns to employee

### Updated Flow:
1. Manager creates task
2. Manager sets deadline (required before assignment)
3. Manager assigns to employee → `assignedAt` is automatically set
4. Employee works on task
5. Employee marks as completed → Performance auto-calculated

---

## Implementation Steps

| Step | Task | File(s) | Time |
|------|------|---------|------|
| 1 | Add deadline fields to Task schema | Task.js | 15 min |
| 2 | Update task assignment to set `assignedAt` | server.js | 30 min |
| 3 | Add deadline update endpoint | server.js | 30 min |
| 4 | Calculate performance on completion | server.js | 45 min |
| 5 | Add user performance endpoint | server.js | 1 hour |
| 6 | Add deadline picker to task forms | Multiple | 1 hour |
| 7 | Show deadline in task tables | Multiple | 1 hour |
| 8 | Update Team member modal with performance | ManagerTeamPage.jsx | 2 hours |
| 9 | Add deadline notifications | server.js | 1 hour |

**Total Estimated Time:** ~8 hours

---

## Helper Functions Needed

### Format Duration
```javascript
function formatDuration(minutes) {
  if (minutes >= 1440) { // >= 1 day
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days} day${days > 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
  }
}
```

### Get Performance Badge
```javascript
function getPerformanceBadge(score) {
  if (score >= 150) return { emoji: '🚀', label: 'Excellent', color: 'text-green-400' };
  if (score >= 90) return { emoji: '✅', label: 'On Time', color: 'text-blue-400' };
  if (score >= 50) return { emoji: '⚠️', label: 'Late', color: 'text-yellow-400' };
  return { emoji: '❌', label: 'Very Late', color: 'text-red-400' };
}
```

---

## Ready to Implement?

This plan:
- ✅ No separate performance page (integrated into Team modal)
- ✅ No star rating system
- ✅ Performance based on allocated vs actual time
- ✅ Calculations in days or hours based on duration
- ✅ Auto-calculation when task is completed

**Shall I start implementing Phase 1 & 2 (Database + Backend)?**
