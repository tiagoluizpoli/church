# Spec F4: Print & Export Service

## Purpose
Define the tools required for Ministry Leaders to extract scheduling data from the platform for physical display or external record-keeping.

## Core Features
1. **High-Fidelity Print / Image Export**: A well-designed, branded printable view of the finalized schedule. Instead of a basic black-and-white print dump, this should be a high-quality visual representation consistent with the `shadcn/ui` design system. It should look premium and may include the ability to export the schedule as a rendered image.
2. **Excel (.xlsx) Export**: Allow leaders to export assignment data into a fully formatted `.xlsx` file. This must not be a raw CSV; the exported Excel file should include styled headers, appropriate colors, and well-organized columns for immediate readability by ministry teams.

## Frontend & Backend Constraints
- **Strict Shadcn/UI Dependency**: All print and export interface elements (buttons, menus, dialogs) must be built with standard `shadcn/ui` components.
- **Excel Generation**: Use a robust library (e.g., `exceljs`) to generate the styled `.xlsx` files with proper formatting.
