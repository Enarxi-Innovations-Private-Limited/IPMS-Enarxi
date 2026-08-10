# Learned Skills & Patterns

## Patterns
- **Transactional State Transitions**: Managing multi-document updates (PO, PR, StockBalance, StoreBatch) within a single Mongo session for inventory integrity.
- **Auto-routing Logic**: Seamlessly moving items from Purchase Inward to the Store Dispatch queue.
- **Sequential Stepper Transfer Flow**: Managing sequential phase tracking and unit distributions in production workflows.

## Skills
- **Mongoose Session Management**: Using `session.withTransaction` for multi-stage workflows.
- **Sequential Task Seeding**: Auto-generating sequence-ordered tasks with capacity parameters upon project creation.
- **Replica Auditing**: Identifying and closing gaps between a source-of-truth system and its port.
- **RBAC Normalization**: Ensuring consistent treatment of user roles (e.g., `SUPER_USER` vs `SUPER_ADMIN`) across decoupled frontend and backend modules.
- **Robust Data Lookups**: Using trimming and case-insensitive matching for user-entered identifiers (Item Codes, Location Codes) to prevent data entry failures.
