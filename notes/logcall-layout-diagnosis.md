# Log Call dialog — why the fields appear to move around

Reading `client/src/components/LogCallDialog.tsx` (current version ffe0da65):

1. **Row 1 is a 2-column grid whose first cell is conditional.**
   `{companies && companies.length > 1 && (<Company select>)}` sits inside the
   same `grid sm:grid-cols-2` as Contact person / Outcome / Customer Response.
   - Group with several member companies → order is
     `Company | Contact` then `Outcome | Customer Response`.
   - Group with a single company → the Company cell is not rendered, so the grid
     reflows to `Contact | Outcome` then `Customer Response | (empty)`.
   Same dialog, two different field arrangements → this is the main cause of the
   "fields are not always in the same order" complaint.

2. **Contact-person extras push the grid rows apart.**
   Selecting a contact renders a details box (name/email/phone), "Other" renders
   an extra input, "Add new contact" renders a 4-field mini-form — all *inside*
   the first grid cell. The cell grows and the neighbouring cell's field
   (Outcome / Customer Response) visually drifts down and to the side.

3. **Collection Notes banner at the very top is conditional.**
   Groups with notes get an amber banner above everything, so the first field
   starts lower for some groups than for others.

4. **The panel under Customer Response changes size per response.**
   Confirmed → amount + promised date (+ open-promise warning), Pending
   Follow-up → amount + follow-up date, Paid → amount, Promise Broken → two
   "next action" buttons, No Answer → info banner. Expected behaviour, but
   combined with (1) and (2) the whole dialog feels unstable.

## Fix direction
Give the dialog a fixed skeleton: always the same labelled slots in the same
order (Company → Contact → Outcome → Customer Response), Company rendered as a
disabled/read-only slot when the group has a single company, contact details
moved out of the grid cell into their own full-width row below, and the
response-specific panel always in the same place with a stable minimum height.
