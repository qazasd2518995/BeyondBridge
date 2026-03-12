# BeyondBridge Role Page Matrix

Updated: 2026-03-12

This matrix reflects the runtime sidebar in `backend/public/platform/js/app.js`, the view gate in `backend/public/platform/index.html`, and the current role/action checks in `backend/public/platform/js/moodle-ui.js`.

Status legend:

- `OK`: page and main CTA match the role model
- `Scoped`: shared page, but actions are role-scoped inside the page
- `Follow-up`: still has a known gap or product rule not fully settled

## Student

| Menu/Page | Expected role behavior | Status | Notes |
| --- | --- | --- | --- |
| Dashboard | personal learner overview only | OK | teacher dashboard flash was fixed |
| Course Center | browse enrolled courses only | OK | participants tab hidden for students |
| Calendar | learner schedule only | OK | course event access now checks enrollment/owner/admin |
| Notifications | learner notifications | OK | read/delete actions are self-scoped |
| Assignments | submit/view own work only | OK | teacher grading actions not shown |
| Quiz Center | attempt/view own attempts only | OK | teacher result flow split away from learner flow |
| Forums | read/post in enrolled courses only | OK | forum access now checks enrolled or course owner/admin |
| Gradebook | own grades only | OK | teacher management moved to separate page |
| Badges | browse/collect own badges | Scoped | recipients hidden; issue/revoke/delete hidden |
| Learning Paths | enroll and view own progress | Scoped | management/delete hidden |
| My Classes | student community view only | OK | separate `studentClasses` view gate |
| My Files | personal file list | OK | shared page, but user-scoped data |
| Settings | own profile/settings only | OK | avatar upload now real |

## Teacher

| Menu/Page | Expected role behavior | Status | Notes |
| --- | --- | --- | --- |
| Teaching Dashboard | teacher task overview | OK | default dashboard now resolves before app render |
| My Courses | manage owned courses | OK | course-owner model expanded beyond `instructorId` |
| My Students | bridge/class student management | OK | teacher-only navigation |
| Calendar | teaching schedule | OK | owner-aware course event access |
| Notifications | teaching notifications | OK | teacher alerts still have backend N+1 performance debt |
| Assignments | create/manage/grade owned-course assignments | OK | course page create/edit/delete now sync real assignment entities |
| Quizzes | create/manage/review owned-course quizzes | OK | no longer falls into learner attempt flow |
| Question Bank | course-scoped bank, not global bank | OK | now requires course selection and course-manage permission |
| Forums | create/manage owned-course forums | OK | course activity links now sync with real forums |
| Gradebook | course grades and analytics | OK | returns to gradebook flow correctly |
| Rubrics | teaching/admin rubric management | Scoped | delete only owner/admin; duplicate allowed for teaching users |
| Badges | teaching/admin badge authoring | Scoped | create allowed to teaching roles; delete/issue/revoke only owner/admin |
| Analytics (`gradebookManagement`) | course report workflow | OK | teacher sees owned courses only |
| Library | shared resource browsing | OK | not role-exclusive |
| Licenses | shared/org-facing license view | Follow-up | business rule still broad; not tightly role-scoped |
| My Resources | personal file/resource space | OK | shared page, user-scoped data |
| Completion Settings | teaching-only course completion config | OK | gated in view and handler |
| Learning Paths | teaching can create; owner/admin manage; teaching can view reports | Scoped | report visibility was aligned to teaching role |
| Class Management | teacher bridge/class management | OK | separate from learner class view |
| Group Management | owned-course groups only | OK | front/back both moved to course-owner model |
| Settings | own profile/settings only | OK | shared page, self-scoped |

## Admin

Admins inherit the educator shell plus the admin block.

| Menu/Page | Expected role behavior | Status | Notes |
| --- | --- | --- | --- |
| Educator pages | same as teacher, with admin override | OK | admin passes course-owner checks where applicable |
| Roles Management | admin-only | OK | gated in `showView()` and backend |
| Course Categories | admin-only | OK | gated in `showView()` and backend |
| Audit Logs | admin-only | OK | guarded in view and handler |
| SCORM Manager | admin-only management surface | OK | frontend and backend aligned to admin-only |
| LTI Manager | admin-only management surface | OK | frontend and backend aligned to admin-only |
| H5P Manager | admin-only management surface | OK | frontend and backend aligned to admin-only |
| `/admin` panel jump | dedicated admin console | OK | separate route |

## Follow-up items

1. `teacher-alerts` still does N+1 aggregation and will get slow as course volume grows.
2. `admin analytics` still relies on scan-heavy aggregation and needs indexed or cached stats.
3. Legacy course activity rows created by the old flow need a one-time repair script run:
   - `node backend/src/scripts/repair-legacy-course-activity-links.js --dry-run`
   - `node backend/src/scripts/repair-legacy-course-activity-links.js`
4. Root-level legacy `platform/` directory still exists beside the active `backend/public/platform/` frontend and remains a maintenance trap.
