# Agent Context Brief

## What I Need To Know Right Now
- Fixed invisible task titles on Kanban cards (`KanbanTaskCard` in `InternProjectsPage.jsx` and `EmployeeProjectsPage.jsx`) by setting title typography to high-contrast `#002045` bold text.
- Fixed washed-out Kanban column titles ("New", "In Progress", "Ready for Review", "Approved / Closed") by updating column containers to `bg-slate-100/70 border border-slate-200` with `#002045` text.
- Updated My Tasks Board header, stats cards, and progress bar container to clean light-theme cards (`bg-white border border-slate-200 shadow-sm`) with `#002045` metrics and `#556070` labels.
- Added light-theme CSS safeguards in `index.css` forcing `.light-theme [class*="bg-white"] h4` and `.light-theme [class*="bg-slate-100"] h3` to render in `#002045`.
- Production build verified: `npm --prefix client run build` passed cleanly in 3.09s.

## Recent Gotchas
- `KanbanTaskCard` had `bg-white dark:bg-surface-dark`. Because the class string contained `bg-surface-dark`, global CSS rules `.light-theme [class*="bg-surface-dark"] .text-white` matched and forced title text to `#ffffff` (white text on white card). Removing `dark:bg-surface-dark` and setting explicit `#002045` title text resolved the issue completely.

## Active Assumptions
- App uses Vite client built to `client/dist`.

## Carry-Forward
- All client changes ready for production build deployment to `tracker.enarxi.com`.

## Next Step
Deploy updated client build to staging/production server (`tracker.enarxi.com`).
