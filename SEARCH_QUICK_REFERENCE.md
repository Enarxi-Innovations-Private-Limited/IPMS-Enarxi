# 🔍 Global Search - Quick Reference Card

## 📍 Where to Find It
**Location:** Top center of the header on all dashboards (desktop/tablet only)

```
+----------------------------------------------------------+
|  [Menu]  IPMS         [🔍 Search here...]  ⌘K   [👤User]  |
+----------------------------------------------------------+
```

---

## ⚡ Quick Actions

| Action | Result |
|--------|--------|
| **Type 2+ characters** | Search begins automatically |
| **Click a result** | Navigate to relevant page |
| **Click outside** | Close dropdown |
| **Clear search** | Results disappear |
| **Press ESC** | Close dropdown (future enhancement) |

---

## 🎯 What You Can Search

### 📁 Projects
- Project name → "Mobile App Redesign"
- Project code → "PRJ-2026-001"
- Description → "E-commerce platform"

### ✅ Tasks  
- Task title → "Design homepage"
- Description → "Create wireframes"
- Status → Shows color-coded status

### 👥 Team Members (Manager/Super User only)
- Name → "John Doe"
- Email → "john@company.com"
- Employee ID → "EMP-001"

---

## 🎨 Visual Indicators

### Task Status Colors:
| Status | Color | Icon |
|--------|-------|------|
| ✅ Completed | 🟢 Green | check_circle |
| 🔄 In Progress | 🔵 Blue | pending |
| ⏸️ Not Started | ⚪ Gray | circle |
| ⏳ Waiting Approval | 🟡 Yellow | schedule |

### Result Item Structure:
```
┌─────────────────────────────────────────────┐
│ [📁] Project Name                      [→]  │
│      PRJ-2026-001 • ACTIVE                  │
└─────────────────────────────────────────────┘
```

---

## 🗺️ Navigation Map

### Where Clicking a Result Takes You:

**Super User:**
```
Projects  → /super/projects
Tasks     → /super/projects (no tasks page)
Members   → /super/teams
```

**Manager:**
```
Projects  → /manager/projects
Tasks     → /manager/tasks
Members   → /manager/team
```

**Employee:**
```
Projects  → /employee/projects
Tasks     → /employee/tasks
Members   → ❌ (not visible)
```

**Intern:**
```
Projects  → /intern/projects
Tasks     → /intern/tasks
Members   → ❌ (not visible)
```

---

## ⏱️ Performance Specs

| Metric | Value |
|--------|-------|
| **Debounce Delay** | 300ms |
| **Min Characters** | 2 |
| **Max Results/Category** | 5 |
| **Search Fields** | 3-4 per item type |
| **API Requests** | 3 parallel (Projects, Tasks, Users) |

---

## 🔧 Keyboard Shortcuts (Planned)

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Focus search |
| `↓` | Navigate down results |
| `↑` | Navigate up results |
| `Enter` | Select highlighted result |
| `Esc` | Close dropdown |

---

## 💻 Code Locations

```
📦 Components
└─ 📁 client/src/components/common/
   ├─ 📄 GlobalSearch.jsx           ← Main search component
   ├─ 📄 SuperUserLayout.jsx        ← Super User integration
   ├─ 📄 ManagerLayout.jsx          ← Manager integration  
   ├─ 📄 EmployeeLayout.jsx         ← Employee integration
   └─ 📄 InternLayout.jsx           ← Intern integration
```

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| **Search not visible** | Check screen size (hidden on mobile) |
| **No results appear** | Verify backend is running |
| **Results wrong** | Check user role permissions |
| **Search is slow** | Check network tab for API issues |
| **Click doesn't work** | Check browser console for errors |

---

## 📊 Sample Search Queries

### Try These:
```javascript
// Projects
"website"
"mobile"
"PRJ"
"2026"

// Tasks
"design"
"bug fix"
"review"
"completed"

// Team Members (Manager/Super User)
"john"
"employee"
"EMP"
"@gmail"
```

---

## 🎓 Implementation Details

### Component Props:
```javascript
<GlobalSearch 
  placeholder="Search projects, tasks, team..." 
/>
```

### No configuration needed! 
- Auto-detects user role
- Auto-routes to correct pages
- Auto-filters results by permissions

---

## 📈 Future Enhancements Roadmap

**Phase 1** ✅ COMPLETE
- [x] Live search
- [x] Multi-category results
- [x] Role-based navigation
- [x] Visual indicators

**Phase 2** 🔜 PLANNED
- [ ] Keyboard shortcuts (⌘K)
- [ ] Search history
- [ ] Fuzzy search
- [ ] Highlight matches

**Phase 3** 💡 IDEAS
- [ ] Voice search
- [ ] Advanced filters
- [ ] Quick actions
- [ ] Search analytics

---

## 📞 Need Help?

1. Read: `SEARCH_IMPLEMENTATION.md` (Technical docs)
2. Read: `SEARCH_TESTING_GUIDE.md` (Testing guide)
3. Check browser console for errors
4. Verify backend API is running
5. Test with sample data

---

## ✨ Pro Tips

💡 **Tip 1:** Type at least 2 characters for results to appear

💡 **Tip 2:** Search is case-insensitive, so "PROJECT" = "project"

💡 **Tip 3:** Results update in real-time as you type

💡 **Tip 4:** Click anywhere outside to close the dropdown

💡 **Tip 5:** Each category shows max 5 results - be specific!

💡 **Tip 6:** Search works on project codes too (PRJ-2026-001)

---

## 🎯 Success Checklist

Use this before going live:

- [ ] Search bar visible on all dashboards
- [ ] Type 2+ chars → results appear
- [ ] Results are categorized correctly
- [ ] Click result → correct navigation
- [ ] Role permissions work properly
- [ ] Search clears after clicking
- [ ] No lag or performance issues
- [ ] UI looks clean and professional
- [ ] Mobile view hides search properly
- [ ] Error states handled gracefully

---

**Quick Reference v1.0** | Last Updated: January 21, 2026
