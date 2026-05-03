# Spec F3: Onboarding & Invites UI

## Purpose
Define the user experience for new volunteers joining a ministry via an invitation link.

## 1. The Landing Page (`/join/:churchId/:ministryId?token=...`)
- **Visual Branding**: Church logo and name.
- **Invitation Context**: "You've been invited to join the **[Ministry Name]** team at **[Church Name]**."
- **Action**: "Get Started" button.

## 2. The Registration Flow
- **Step 1: Identity**: 
    - If logged in: "Join as [Name]?"
    - If not logged in: Better Auth Sign-up/Login component.
- **Step 2: Profile Completion**: 
    - Basic info (Phone, preferred contact method).
    - Role interests (Multiple choice).
- **Step 3: Confirmation**:
    - "Welcome! You are now part of the [Ministry Name] team."
    - Redirection to the **Volunteer Dashboard**.

## 3. Token Logic (Frontend side)
- On landing, the frontend must immediately validate the `token` via the API.
- If the token is `Expired` or `Used`, show a friendly "This link is no longer active" page with a button to contact the leader.

## 4. Testing Requirements (Mandatory)
- **Component**: Verify that the "Join as [Name]" button correctly uses the existing session.
- **Integration**: Verify that an invalid token redirects to the "Link Expired" page.
- **E2E**: Full journey - Click link -> Register -> View Dashboard.

## 🔗 References
- [Spec 05: Onboarding Links](./05-onboarding-links.md)

## 🔴 Mandatory UI Component Rule
Everything must be built exclusively using standard **shadcn/ui** components. Do not build custom UI elements from scratch. Make as few modifications as possible. If a component is missing, pause and ask the user to find a community implementation.
