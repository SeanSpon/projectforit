# Roomie student and RA prototype

Open `/prototype/index.html?screen=welcome` from the app. For a standalone copy, open `public/prototype/index.html`.

The group **Morgens Hall · Floor 9** contains demo rooms 901–912. Students belong to rooms. The assigned RA can browse the group, review room reports, change report status, send a reply to a room inbox, and post announcements visible on student dashboards. Students manage room chores, expenses, and rules. All changes are saved in this browser only. **Reset demo** clears this prototype's sample changes.

RA selection is a preview switch, not university verification. The prototype is separate from the main app's real accounts and Neon households. It sends no messages, invitations, or payments outside this browser. All displayed residents and assignments are example data.

## Screenshots

1. Welcome
2. Student / RA account setup
3. Join a room
4. Student dashboard
5. Roommates and rules
6. Chore manager
7. Shared expenses
8. Messages and reports
9. RA dashboard
10. Managed rooms

Click a managed room to open its residents, report statuses, and message form.

## Proposed live data model

| Table | Purpose |
| --- | --- |
| users | Existing accounts; verified role assigned by authorized housing staff |
| buildings / floors | Building and floor identity |
| rooms / room_members | Room assignment and its student members |
| ra_groups / ra_group_rooms | Named room groups, including a floor or a custom set of rooms |
| ra_assignments | Verified RA account assigned to a group |
| reports | Resident-submitted issue, room, assigned group and status |
| messages | Sender, authorized room or recipient, body and timestamp |
| announcements | RA author and destination group |

The server must check room membership and RA group assignments on every read and write. RA access should expose resident contact details and submitted reports; private chores, expenses, and roommate agreements remain accessible only to room members. Joining another room requires a valid invitation or housing assignment. No server-side RA tables or permissions are implemented by this prototype.

## Verification

Verified in the browser: student setup and joining, chore state surviving refresh, resident report appearing in the RA inbox, RA status update appearing to the resident, and RA reply appearing in that room's student inbox. Main app TypeScript and production build checked separately.
