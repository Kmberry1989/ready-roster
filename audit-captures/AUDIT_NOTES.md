# ReadyRoster audit notes

Date: 2026-08-30

## Captured states

1. `01-start.png` — email/password login
2. `02-signup.png` — volunteer registration
3. `03-admin-signup.png` — administrator registration
4. `04-mobile-admin-signup.png` — administrator registration at 390px wide
5. `05-applicant-entry.png` — applicant registration from an application-link query
6. `06-admin-dashboard.png` — authenticated admin dashboard with seeded event
7. `07-admin-workforce-top.png` — workforce training and assignment controls
8. `08-admin-workforce-lower.png` — workforce hierarchy, hiring, and applicant controls
9. `09-admin-document-wizard.png` — document wizard and template library
10. `10-volunteer-organizations.png` — authenticated volunteer organization picker
11. `11-volunteer-initiative.png` — volunteer initiative picker
12. `12-volunteer-documents.png` — required waiver and signature step
13. `13-volunteer-complete.png` — successful volunteer registration
14. `14-employee-goals.png` — employee learning plan and time clock
15. `15-employee-training-complete.png` — completed training assignment
16. `16-employee-schedule.png` — employee schedule and time-entry view
17. `17-employee-clocked-in.png` — active employee time entry
18. `18-employee-time-submitted.png` — submitted employee time entry
19. `19-employee-inbox.png` — employee notifications and messages
20. `20-applicant-form.png` — authenticated job application form
21. `21-applicant-submitted.png` — submitted job application

## Evidence

- The login and registration card is vertically centered. The longer registration states exceed a 720px desktop viewport and the mobile state is 887px tall against an 844px viewport.
- The original captures showed visible labels without reliable control associations. The affected auth, volunteer, applicant, employee availability, and hiring controls now use associated labels, stable names/IDs, required states, and surfaced error messages.
- `npm run lint` and `npm run build` pass. Vite still reports the existing large JavaScript chunk as a performance follow-up.
- Live Firebase-backed test data was created in `ReadyRoster Audit Test Org`: one waiver, one event, one open job, one training module, one role, one employee invitation, one training assignment, one volunteer registration, one employee time entry, and one applicant record.
- Volunteer discovery and content reads were re-tested after the tenant-scoped query/rule changes. The volunteer picker now shows only the opted-in audit organization. New registrations are saved as `Pending review`; an admin approval changes the record to `Cleared`.
- The corrected dashboard reports `Total Registrations`, `Fully Cleared`, and `Active Initiatives`; event creation now records the selected date and initiative type.
- Employee training completed at 100%; clock-in, break, clock-out, and admin approval produced an approved time entry.
- Applicant submission appeared in the admin pool, stage history persisted after moving the candidate to `reviewing`/`phone screen`, and a duplicate submission was rejected with a visible message.
- Applicant and employee sessions both expose and successfully execute a `Log out` control.
- Authenticated browser diagnostics were clean on the final volunteer flow aside from expected Vite/React development messages.

## Implemented fixes

- Enforced organization boundaries for organization, event, template, volunteer, job, and application access in `firestore.rules` and the matching client queries.
- Added an admin-controlled `Allow volunteer discovery` setting. New organizations default to enabled; existing organizations require an explicit opt-in.
- Made volunteer registrations reviewable and duplicate-resistant with deterministic participant/event IDs and admin-only status transitions.
- Added immutable applicant stage transition history with actor and timestamp data.
- Restored visible logout controls for applicant and employee sessions.
- Added the missing form associations, required-state handling, field IDs/names, and user-facing async error states in the audited flows.
- Added repository ESLint configuration and resolved the reported unused-code issues.

## Live deployment

- Firestore rules compiled and were released to Firebase project `ready-roster1` on 2026-08-30.

## Limits

- Production hosting was not deployed or verified in this pass. The final browser checks used the local Vite app against live Firebase data and rules.
- Existing organizations without `volunteerDiscoverable: true` will not appear in volunteer discovery until an admin enables the setting; this is the intended tenant-safety migration behavior.
- No automated test suite or Firebase emulator harness is currently defined in the repository; live authenticated browser regression checks were used for the changed flows.

## Confirmed follow-up findings

- Volunteer organization discovery exposes unrelated organizations to a signed-in volunteer. The live picker showed the audit organization plus `Touchy Subjects LLC` and multiple unrelated QA organizations. Tenant filtering must be enforced in both Firestore rules and the query path.
- Dashboard labels are misleading: `Total Applications` is backed by volunteer registrations, and `Fully Cleared` is effectively the count of registrations saved as `cleared`.
- The admin workforce screen is feature-rich but very long and dense; the first viewport mixes training, roles, hiring, and scheduling controls. Split these into focused routes or progressive disclosure sections.
- Applicant stage changes persist, but the UI promises a defensible stage history while the visible model only exposes the current stage. Add immutable transition history with actor and timestamp.
- Employee date inputs are visually unlabeled in the availability/leave section, and the employee portal needs a clear account/session exit path.
