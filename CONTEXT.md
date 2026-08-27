# Agent Context Brief

## What I Need To Know Right Now
- Fixed blue highlight / dark box contrast issues on Attachments and "Upload New Document" sections across `InternProjectsPage.jsx`, `InternDashboard.jsx`, `EmployeeProjectsPage.jsx`, and `EmployeeDashboard.jsx`.
- Converted dark surface containers (`bg-surface-dark`, `bg-background-dark/20`) to light theme cards (`bg-white border border-slate-200 shadow-sm`).
- Updated Attachments header bar, file items, text titles, metadata labels, inputs, and drag & drop file upload zone to high-contrast `#002045` and `#556070` light theme styling.
- Production build verified: `npm --prefix client run build` passed cleanly in 3.24s with 0 errors.

## Recent Gotchas
- The Attachments section retained dark mode background utility classes (`bg-surface-dark`, `bg-background-dark/50`, `text-white`), causing solid dark blue highlights behind text when rendered in light theme mode. Updating them to explicit light slate (`bg-slate-50 border border-slate-200 text-[#002045]`) completely resolves the issue.

## Active Assumptions
- Application client is built using Vite to `client/dist`.

## Carry-Forward
- All client UI updates are built and ready for production server deployment.

## Next Step
Deploy updated client build to staging/production server (`tracker.enarxi.com`).
