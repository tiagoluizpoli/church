# Spec 08: Domain Service — Slot Generator

## Purpose
Automate the creation of complex time slot structures based on event duration and ministry templates.

---

## 1. Generation Strategies

### I. Equal Split
- **Input**: Event duration (e.g., 2 hours), Slot duration (e.g., 30 mins).
- **Output**: 4 sequential slots.

### II. Template-Based
- **Input**: Ministry "Sunday Morning" template.
- **Output**: Predefined slots like "Pre-service (8:00-8:30)", "Service (8:30-10:00)", "Cleanup (10:00-10:30)".

---

## 2. Requirement Inheritance
- When slots are generated, they automatically inherit the `SlotRequirement` (Role + Count) from the parent Ministry settings or the chosen Template.

---

## 3. Testing Requirements (Mandatory)
- **Unit**: Verify that `Equal Split` handles remainders (e.g., 65 mins / 30 mins slot).
- **Unit**: Verify that `Template-Based` generation correctly copies the `required_count` for each role.
- **Integration**: Verify that generating slots for a 2-day event correctly labels them with the date.
- **Transactional**: Verify that if requirement creation fails, the entire slot batch is rolled back.
