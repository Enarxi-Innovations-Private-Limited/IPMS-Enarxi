# Agent Context Brief

## What I Need To Know Right Now
- Fixed global input field text visibility & contrast bugs across the site and Inventory module (`index.css` & `PurchaseInward.jsx`).
- Added missing "My Tasks" navigation link to `InternLayout.jsx`.
- Fixed white text contrast on white cards/table rows in `InternDashboard.jsx`.
- Integrated `TaskDetailModal` and `WAITING_APPROVAL` status workflow in `InternTasksPage.jsx` and `InternDashboard.jsx`.
- Production build verified: `npm --prefix client run build` passed cleanly.

## Recent Gotchas
- Light-theme selector overrides in `index.css` previously forced dark `#002045` text on dark input backgrounds. Fixed by creating dedicated input background specificity rules.
- Native `<select>` popups on Windows/Chrome default to white option backgrounds; `select option { background-color: #ffffff; color: #0f172a; }` guarantees legible option text.

## Active Assumptions
- App uses Vite client built to `client/dist`.

## Carry-Forward
- All client changes ready for production build deployment.

## Next Step
Deploy updated client build to production server.
