#Enarxi IPMS - Search Functionality Implementation Plan

## Objective
Enable comprehensive search functionality across ALL pages for all user roles (Super Admin, Manager, Employee, Intern) in the IPMS system.

## Implementation Status

### ✅ COMPLETED (2/10)
1. **EmployeeTasksPage.jsx** ✅
   - Search by: Task title, description, project code
   - UI: Search bar + Status filter + Project filter
   
2. **InternTasksPage.jsx** ✅
   - Search by: Task title, description, project code
   - UI: Search bar + Status filter + Project filter

### 📋 IN PROGRESS (8/10)

#### Super Admin Pages (3 pages)
3. **SuperUserTeamsPage.jsx** 🔄 NEXT
   - Search by: User name, email, role, department
   - Filter: Role, Department
   
4. **SuperUserProjectsPage.jsx** ✅ ALREADY HAS SEARCH
   - Search by: Project name, description
   - Filter: Status, Department
   
5. **SuperUserBackupsPage.jsx** ✅ ALREADY HAS SEARCH
   - Search by: Project code, project name

#### Manager Pages (3 pages)
6. **ManagerProjectsPage.jsx** 🔄
   - Search by: Project name, description, project code
   - Filter: Status
   
7. **ManagerTasksPage.jsx** 🔄
   - Search by: Task title, description, assignee name, project code
   - Filter: Status, Project
   
8. **ManagerTeamPage.jsx** 🔄
   - Search by: Team member name, role
   - Filter: Role

#### Employee & Intern Pages (2 pages)
9. **EmployeeProjectsPage.jsx** 🔄
   - Search by: Project code, description
   - Filter: Status (via Kanban)
   
10. **InternProjectsPage.jsx** 🔄
    - Search by: Project code, description
    - Filter: Status (via Kanban)

## Search Implementation Pattern

All pages follow this consistent pattern:

```javascript
// 1. State Management
const [searchTerm, setSearchTerm] = useState('');

// 2. Filtering Logic
const filteredItems = items.filter((item) => {
    // ... existing filters ...
    
    // Search filter
    if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesField1 = item.field1?.toLowerCase().includes(search);
        const matchesField2 = item.field2?.toLowerCase().includes(search);
        // ... more fields ...
        if (!matchesField1 && !matchesField2 && ...) return false;
    }
    return true;
});

// 3. UI Component
<div className="relative">
    <span className="material-symbols-outlined">search</span>
    <input
        type="text"
        placeholder="Search..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
    />
</div>
```

## Next Steps

1. Implement SuperUserTeamsPage search
2. Implement Manager pages search (Projects, Tasks, Team)
3. Implement Employee/Intern Projects page search
4. Test all implementations
5. Document user-facing search capabilities

## Notes
- All search operations are case-insensitive
- Search is real-time (no submit button required)
- Search works in combination with existing filters
- UI maintains consistent styling across all pages
