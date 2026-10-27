# NOOB Forms: what is built, what is not

Run `20261028000001_noob_forms.sql` once in the Supabase SQL editor. Nothing else needs configuring: no new secrets, no new edge function.

## Where things are
| Part | File |
| --- | --- |
| Tables, security, the checked "send answers" and "publish" functions | `supabase/migrations/20261028000001_noob_forms.sql` |
| Question types, the show-if rule, checking, themes (20), templates (16), chart numbers (counts, averages, NPS), CSV / JSON | `src/utils/forms.ts` |
| Database calls | `src/services/formsApi.ts` |
| My forms (search, filters, sort, grid / list, folders, stars, archive, trash, templates) | `src/components/Forms/FormsDashboard.tsx` |
| Editor (questions, drag or arrow buttons, undo / redo, autosave, design, settings, share) | `src/components/Forms/FormEditor.tsx` |
| The form people fill (also the preview) with the NOOB button on top and the thank-you animation with "Join NOOB" and a cross | `src/components/Forms/FormRenderer.tsx` |
| Answers: totals, charts, one by one, export | `src/components/Forms/FormResponses.tsx` |
| Addresses `/forms`, `/forms/<id>`, `/forms/<id>/responses`, `/f/<address>` | `src/utils/funRoutes.ts`, `src/components/Forms/FormsHub.tsx` |
| Tests (46, on a real Postgres) | `scripts/supabase/test-forms.mjs` |

## Working end to end (tested)
Create (blank or template) -> edit -> theme -> preview (desktop / tablet / mobile) -> publish (checked) -> public link, no account -> server-side validation -> saved -> thank-you with animation -> owner sees totals, charts, each answer -> export CSV / JSON -> close -> new answers refused -> unpublish.
Security: row-level security, nobody but the owner reads a form or its answers, visitors can only call the two checked functions, a hidden question's answer is thrown away, deleting an account deletes its forms.

## Not built yet (recorded, not pretended)
- **Create with AI** and AI editing tools (needs an AI service wired to an edge function).
- Quiz mode (points, correct answers, scores), calculated fields, payments.
- File upload, signature, image choice, ranking, grids / matrix, hidden fields, heart / thumbs rating, Excel (XLSX) and PDF export, import.
- Collaboration (invite editors / viewers), real-time editing.
- Notifications, receipts by email, webhooks.
- QR code for the link, section-to-section jumps ("skip to page") and "end the form" actions (show-if rules are built).
- Charts beyond bars, per-day column chart and NPS (line / area / pie / scatter / heatmap / histogram), sentiment.
- One-response-per-person limits (needs a reliable identity; the form is anonymous by design).
- Page-switch and feature-switch entries for Forms in the admin panel.
