# 🧪 Global Search - Testing Guide

## Quick Test Steps

### 1. **Start the Application**
```bash
# Terminal 1 - Start Backend
cd server
npm run dev

# Terminal 2 - Start Frontend
cd client
npm run dev
```

### 2. **Login to Each Role**

Test the search in each user role:

#### 🔵 **Super User Test**
1. Login as Super User
2. Look for the search bar at the top (center of the header)
3. Type: **"project"** or any project name
4. Expected: See projects in the dropdown
5. Click a project → Should navigate to `/super/projects`
6. Try searching for a team member name
7. Click a team member → Should navigate to `/super/teams`

#### 🟢 **Manager Test**
1. Login as Manager
2. Type: **"task"** or any task name
3. Expected: See tasks categorized in dropdown
4. Click a task → Should navigate to `/manager/tasks`
5. Search for projects → Click → Navigate to `/manager/projects`
6. Search for team members → Click → Navigate to `/manager/team`

#### 🔴 **Employee Test**
1. Login as Employee
2. Type any search query
3. Expected: See projects and tasks (NO team members)
4. Click a task → Should navigate to `/employee/tasks`
5. Click a project → Should navigate to `/employee/projects`

#### 🟣 **Intern Test**
1. Login as Intern
2. Same as Employee test
3. Should navigate to `/intern/projects` and `/intern/tasks`

---

## 🎯 Detailed Test Scenarios

### Scenario 1: Live Search
- [ ] Type "p" → No results (less than 2 characters)
- [ ] Type "pr" → Results appear immediately
- [ ] Continue typing "proj" → Results filter in real-time
- [ ] Clear search → Results disappear

### Scenario 2: Multi-Category Results
- [ ] Search shows **Projects** section with icon 📁
- [ ] Search shows **Tasks** section with icon ✅
- [ ] Search shows **Team Members** section with icon 👥 (Manager/Super User only)
- [ ] Each section shows max 5 results
- [ ] Sections are visually separated

### Scenario 3: Click Navigation
- [ ] Click on a project → Navigates to projects page
- [ ] Click on a task → Navigates to tasks page
- [ ] Click on a team member → Navigates to team page
- [ ] Click outside dropdown → Dropdown closes
- [ ] After navigation, search input clears

### Scenario 4: Visual Feedback
- [ ] Hover over result → Background changes to dark
- [ ] Hover over result → Arrow icon appears on the right
- [ ] Active search → Shows spinner icon
- [ ] No results → Shows "No results" message with icon
- [ ] Results appear → Smooth dropdown animation

### Scenario 5: Status Indicators
For **Tasks**:
- [ ] Completed tasks → Green background/icon 🟢
- [ ] In Progress tasks → Blue background/icon 🔵
- [ ] Not Started tasks → Gray background/icon ⚪
- [ ] Each task shows status text below title

For **Projects**:
- [ ] Shows project code (e.g., PRJ-2026-001)
- [ ] Shows project status (ACTIVE, PLANNING, etc.)

For **Team Members** (Manager/Super User):
- [ ] Shows avatar with first letter
- [ ] Shows role (EMPLOYEE, INTERN, etc.)
- [ ] Shows employee ID

### Scenario 6: Edge Cases
- [ ] Empty database → "No results found" message
- [ ] Special characters (@, #, $) → Searches correctly
- [ ] Very long search query → Truncates properly
- [ ] Rapid typing → Debounce works (no lag)
- [ ] Network error → Handles gracefully

---

## 🔍 Search Query Examples

Try these search queries to test:

### Projects:
```
- "website"
- "mobile"
- "PRJ"
- "2026"
- "ACTIVE"
```

### Tasks:
```
- "design"
- "bug"
- "feature"
- "review"
- "IN_PROGRESS"
```

### Team Members (Manager/Super User only):
```
- "john"
- "employee"
- "EMP"
- "intern"
- "@gmail"
```

---

## ✅ Expected Behavior Checklist

### Search Input
- [x] Visible on desktop/tablet (hidden on mobile)
- [x] Centered in header
- [x] Has search icon on left
- [x] Has keyboard shortcut hint (⌘K) on right
- [x] Placeholder text is role-appropriate
- [x] Focus ring appears when clicked

### Dropdown Results
- [x] Appears below search input
- [x] Has shadow and border
- [x] Max height with scrollbar if needed
- [x] Closes when clicking outside
- [x] Closes after clicking a result
- [x] Dark theme consistent with app

### Navigation
- [x] Correct path for Super User
- [x] Correct path for Manager
- [x] Correct path for Employee  
- [x] Correct path for Intern
- [x] Page loads successfully after click
- [x] Search clears after navigation

### Performance
- [x] Search starts after 2 characters
- [x] 300ms debounce prevents API spam
- [x] Loading state shows while searching
- [x] Results appear quickly (< 1 second)
- [x] No memory leaks (event listeners cleaned up)

---

## 🚨 Common Issues & Solutions

### Issue: Search bar not visible
**Solution**: Check that you're on desktop/tablet view. Search is hidden on mobile by design.

### Issue: No results showing
**Solution**: 
1. Check if backend is running
2. Check if there's data in the database
3. Open browser console for errors
4. Verify API endpoints are working

### Issue: Click doesn't navigate
**Solution**: 
1. Check browser console for errors
2. Verify user role matches navigation logic
3. Ensure routes are defined in App.jsx

### Issue: Results show wrong data
**Solution**: 
1. Clear browser cache
2. Check backend filters
3. Verify user permissions

### Issue: Search is slow
**Solution**: 
1. Check network tab in dev tools
2. Verify debounce is working (300ms)
3. Check backend response time

---

## 📊 Test Report Template

```
Date: __________
Tester: __________
Role Tested: __________

✅ = Pass | ❌ = Fail | ⚠️ = Issue

Basic Functionality:
[ ] Search appears correctly
[ ] Results show up
[ ] Navigation works
[ ] Dropdown closes properly

Advanced Features:
[ ] Multi-category display
[ ] Status indicators
[ ] Live filtering
[ ] Debounce working

Edge Cases:
[ ] Empty results handled
[ ] Special characters work
[ ] Long queries handled
[ ] Network errors handled

Issues Found:
_________________________________
_________________________________
_________________________________

Overall Result: [ ] PASS  [ ] FAIL
```

---

## 🎬 Video Test

Record a screen video showing:
1. Login
2. Type in search box
3. View results dropdown
4. Click various result types
5. Navigate to different pages
6. Search clears after navigation

This helps identify any visual or UX issues.

---

**Ready to test!** 🚀 Start with the Super User role and work your way down to Employee/Intern.
