# Spec F4: Print & Export Service

## Purpose
Define the tools required for Ministry Leaders to extract scheduling data from the platform for physical display or external record-keeping.

## Core Features
1. **Clean Mobile Printing**: 
    - Use standard CSS `@media print` directives to strip away all UI "chrome" (navigation, buttons, background colors).
    - Enforce a high-contrast "Clinical" layout: black text on white background, standard system fonts (Inter), and thin `1px` borders for tables.
    - Provide a dedicated `/print` route that renders a simplified, unstyled view of the data for reliable browser printing.
2. **PDF Export**:
    - Leverages the browser's native **"Print to PDF"** functionality. No custom PDF engine required.
3. **Excel (.xlsx) Export**: 
    - Export assignment data into a formatted `.xlsx` file using `exceljs`.
    - **Styling**: Bold headers, auto-filters enabled, and frozen top rows for utility. Focus on data density: Date, Ministry, Role, Volunteer Name, and Status.

## Frontend & Backend Constraints
- **Strict Shadcn/UI Dependency**: All print and export interface elements (buttons, menus, dialogs) must be built with standard `shadcn/ui` components.
- **Utility First**: Design for clarity and fast scanning, not decorative elements.
