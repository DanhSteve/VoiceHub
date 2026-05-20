# Channel ACL E2E Checklist

## 1) Scope visibility
- User with membership scope in Division C:
  - Sidebar only renders Division C tree.
  - Other divisions are not shown.

## 2) Default lock behavior
- Channel outside primary team and without ACL:
  - Visible as structure only.
  - Cannot open messages.
  - Cannot send message.
  - Cannot join voice.

## 3) Primary team behavior
- Channel in primary team:
  - Read/write/voice allowed by default.

## 4) ACL grant flow
- Admin opens Organization Settings -> Structure -> ACL panel.
- Grant `canRead` only for a user on channel X:
  - User can open/read channel X.
  - User cannot send message to X.
- Grant `canWrite`:
  - User can send messages to X.
- Grant `canVoice`:
  - User can join voice channel X.

## 5) ACL revoke flow
- Revoke channel access for user:
  - User loses corresponding read/write/voice capabilities immediately after reload.

## 6) API checks
- `GET /api/organizations/:orgId/accessible-channel-ids`
  - Returns `channelIds`, `permissionsByChannelId`, `scope`.
- `GET /api/organizations/:orgId/channels/:channelId/access` (owner/admin only)
- `POST /api/organizations/:orgId/channels/:channelId/access/grant` (owner/admin only)
- `POST /api/organizations/:orgId/channels/:channelId/access/revoke` (owner/admin only)

## 7) Regression checks
- Invite link and join flow still work.
- Organization delete cascade also deletes `ChannelAccess`.
- Search messages only in allowed readable channels.
