# Project Log - ZC2C_IST (Internal Sample Transfer)

## Purpose
SAP UI5 app for creating and processing packaging proposals (shipments). Recent work focused on:
- Validation logic for gross/dry-ice weights.
- Renaming UI labels from “Proposal” to “Shipment”.
- Moving text strings to i18n with view-prefixed keys.
- Minor layout tweaks on the list and wizard screens.

## Current UI/UX Changes (Frontend)
### Wizard (`PP_Wizard`)
- Step 2 button label changed to “Pack Container(s)” via i18n.
- “View Shipment History” button placed near Step 2 title (toolbar above table).
- Processing step labels and buttons moved to i18n.
- Wizard titles, labels, placeholders, and table headers now i18n with `ppWizard.*` prefix.

### Process screen (`PP_Process`)
- All labels and button texts moved to i18n with `ppProcess.*` prefix.
- Title uses i18n.

### List screen (`PP_List`)
- Page title set to “Shipment History” and moved to `customHeader` with a right-aligned button.
- “Start Proposal” renamed to **“Start new shipment”** and moved to the header (top right), i18n key `ppList.startNewShipment`.
- “Open Proposal” renamed to **“Go to Shipment”** (still in toolbar), i18n key `ppList.goToShipment`.
- Filters/table header moved to i18n (`ppList.filters`, `ppList.shipmentsHeader`).

### Hidden Feature (next cycle)
- A “Container(s)” column with a per-row “Show Container(s)” action was implemented but **feature-gated off** in `PP_List.controller.js` via:
  - `const bEnableShowContainers = false;`
  - This avoids rendering until next cycle.
  - Support code remains: dialog loads `/PackagingProposalItems` filtered by `PackageId`.

## Validation Logic (Frontend)
### Gross/Dry-Ice validation on Process button
Implemented in both:
- `webapp/controller/PP_Wizard.controller.js` (onProcessProposal)
- `webapp/controller/PP_Process.controller.js` (onProcessProposal)

Rules:
- **Gross weight required**: if `Gross <= 0`, block with i18n message `GROSS_WEIGHT_REQUIRED`.
- **Dry ice cannot exceed gross**: if `DryIce > Gross`, block with `DRY_ICE_GT_GROSS`.
- **Dry ice default**: if blank, force to `0.000` before payload and write back to model.

## i18n Organization
- View-prefixed keys:
  - `ppWizard.*`
  - `ppProcess.*`
  - `ppList.*`
- Validation keys:
  - `GROSS_WEIGHT_REQUIRED`
  - `DRY_ICE_GT_GROSS`
- Container dialog (feature-gated):
  - `showContainers`, `containersColumn`, `containersTitle`, `containersLoadFailed`, `close`

Unused old keys (cleaned):
- `viewOpenProposals`, `packContainer`, `goToShipment`, `startNewShipment`, `plantAssignment`

## Backend Considerations
- OData metadata indicates both `WeightGross` and `WeightDryIce` were marked `Nullable=false` in `ZC2C_IST_UI_SRV`.
- Frontend now forces Dry Ice to `0.000` if blank. Backend will also be adjusted to allow optional Dry Ice.

## Files Modified (key)
- `webapp/view/PP_Wizard.view.xml`
- `webapp/controller/PP_Wizard.controller.js`
- `webapp/view/PP_Process.view.xml`
- `webapp/controller/PP_Process.controller.js`
- `webapp/view/PP_List.view.xml`
- `webapp/controller/PP_List.controller.js`
- `webapp/i18n/i18n.properties`
- `ui5-deploy.yaml` (tracked for BAS migration)

## Git
Recent commits (local history):
- `UI changes , getting rid of word Proposal and replacing with Shipment & i18N texts`
- `Track ui5-deploy config`

## Notes for Next Cycle
- To enable “Show Container(s)” column, set `bEnableShowContainers = true` in `PP_List.controller.js`.
- If needed, move remaining strings (controllers) to i18n (MessageBox/Toast strings in controllers still hardcoded in places).
