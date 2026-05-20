# RBAC Test Matrix (Owner/Admin/HR/Member)

## Preconditions
- Organization has at least 4 users: `owner`, `admin`, `hr`, `member`.
- `owner/admin/hr/member` roles exist in membership and role-permission service.
- At least one invite link is generated via modal with `branchId` + `divisionId`.

## Access Matrix

| Action | Owner | Admin | HR | Member |
| --- | --- | --- | --- | --- |
| Update organization settings | Allow | Allow | Deny (403) | Deny (403) |
| Create/update hierarchy (branch/division/department/team/channel) | Allow | Allow | Deny (403) | Deny (403) |
| Invite member by direct invite | Allow | Allow | Allow | Deny (403) |
| Create invite link | Allow | Allow | Allow | Deny (403) |
| Review join applications | Allow | Allow | Deny | Deny |
| Update member role | Allow | Allow | Deny (403) | Deny (403) |
| Remove member | Allow | Allow | Deny (403) | Deny (403) |

## Test Cases

1. **Membership role enum + normalize**
   - Create membership with `role=hr` and verify persistence.
   - Send known aliases to `normalizeRole` and verify `hr/member/admin` mapping is correct.

2. **HR invite permission**
   - Login as `hr` and call `POST /organizations/:orgId/members/invite`.
   - Expected: success.
   - If payload role is `admin`/`owner`, expected invited membership role is forced to `member`.

3. **HR blocked from org write operations**
   - Login as `hr` and call each protected write endpoint:
     - organization update
     - hierarchy create/update
     - member role update/remove
   - Expected: 403 for all blocked actions.

4. **Role sync template**
   - Ensure default org roles include `Quản trị viên`, `Nhân sự`, `Thành viên`.
   - Change membership role to `hr` and verify role-permission assignment switched to HR template.

5. **Invite link context**
   - Create link with branch/division selected.
   - Join via link with a fresh user.
   - Expected:
     - membership has `branch` and `division` set from token context.
     - frontend join toast includes context label.

6. **Regression checks**
   - join-by-link with join form enabled/disabled.
   - realtime events on invite accepted/rejected.
   - existing owner/admin flows still pass unchanged.

## Suggested Automation
- Add integration tests in organization-service for:
  - invite route policy (`owner/admin/hr`)
  - member role update denied for HR
  - join-via-link stores branch/division context
- Add frontend smoke test:
  - invite button visible for `hr`, hidden for `member`.
