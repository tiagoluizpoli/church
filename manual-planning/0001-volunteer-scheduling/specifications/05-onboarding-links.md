# Spec 05: Onboarding & Invitation Links

## Purpose
Enable Ministry Leaders to invite new volunteers via secure, one-time or multi-use links.

---

## 1. Invitation Link Entity
- **id**: UUID
- **church_id**: UUID
- **ministry_id**: UUID
- **team_id**: UUID (Optional)
- **token**: String (Unique, secure hash)
- **type**: "one-time" | "multi-use"
- **status**: "active" | "used" | "expired"
- **expires_at**: Timestamp

---

## 2. Onboarding Flow
1. **Generation**: Leader generates a link for a specific Ministry/Team.
2. **Access**: User clicks `/join/:token`.
3. **Validation**: 
    - Check if `expires_at` is in the future.
    - Check if `type == one-time` and `status == used`.
4. **Registration**: 
    - If user not logged in, trigger Better Auth.
    - Create `Volunteer` record (if missing).
    - Create `Ministry_Volunteer` join record.
5. **Redirection**: Send user to their new Dashboard.

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `one-time` tokens are invalidated after the first successful use.
- **Unit**: Verify that `expired` tokens prevent the registration flow.
- **Security**: Verify that a user cannot join a ministry from a different `church_id` using a valid token from their own church.
- **Integration**: Verify that a successful join automatically creates all necessary domain records (Volunteer, Join Table).
