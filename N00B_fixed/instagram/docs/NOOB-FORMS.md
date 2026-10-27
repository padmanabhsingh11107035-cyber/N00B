# NOOB Forms: what is built, what is not

## What the owner of the app must do (nothing else is needed)
1. Run the three migrations in the Supabase SQL editor, in this order: `20261028000001_noob_forms.sql`, `20261028000002_forms_quiz_and_more_types.sql`, `20261028000003_forms_collab_files_webhooks.sql`.
2. Deploy the two new edge functions (Supabase -> Edge Functions, "Verify JWT" OFF for both): `forms-ai` and `forms-webhook-run`. Redeploy `dynamic-handler` (two new emails).
3. For the AI helper: the function reads the same secrets as NOOB STUDY (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, several keys each are fine). Without a key the buttons say that the helper is not switched on; everything else works.
4. For web hooks that are sent by themselves: Supabase -> Integrations -> Cron -> every minute -> Edge Function `forms-webhook-run` with the header `x-noob-push` = the same value as `internal_config.push_secret`. Without it, the owner presses "Send what is waiting now".
5. Optional clean-up of files that were uploaded but never sent with an answer: `select * from public.form_uploads_orphans();` lists them (older than two days); delete them from Storage -> form-uploads.

## Where things are
| Part | File |
| --- | --- |
| Tables, security, the checked "send answers" and "publish" functions | `supabase/migrations/20261028000001_noob_forms.sql` |
| Quiz, more question types, "end the form here", scores | `supabase/migrations/20261028000002_forms_quiz_and_more_types.sql` |
| People on a form, file uploads, notes and emails to the owner, web hooks | `supabase/migrations/20261028000003_forms_collab_files_webhooks.sql` |
| Question types, show-if / end rules, checking, 20 themes, 16 templates, chart numbers, formulas, exports, file import, AI-answer check | `src/utils/forms.ts` |
| Database calls | `src/services/formsApi.ts` |
| My forms, templates, Create with AI, Import | `src/components/Forms/FormsDashboard.tsx` |
| Editor: questions, quiz, design, settings, share (link, QR, embed, people, web hooks) | `src/components/Forms/FormEditor.tsx` |
| The form people fill (also the preview), the NOOB button, the thank-you animation | `src/components/Forms/FormRenderer.tsx` |
| Answers: totals, charts, quiz statistics, one by one, export | `src/components/Forms/FormResponses.tsx` |
| AI helper (generate, rewrite, translate, options, review, summarise) | `supabase/functions/forms-ai/index.ts` |
| Web hook sender (signed, retried, private addresses refused) | `supabase/functions/forms-webhook-run/index.ts` |
| Tests (106, on a real Postgres) | `scripts/supabase/test-forms.mjs` |

## Working (tested)
- Build: blank form, 16 templates, AI, a saved form file; 24 question types (short, paragraph, email, phone, link, number, multiple choice, checkboxes, dropdown, image choice, ranking, grid, scale, stars, hearts, thumbs, NPS, date, time, consent, signature, file upload, hidden field, calculated value) plus new-page and text blocks.
- Classic, pages and one-question-at-a-time forms; progress; show-if rules and "end the form here" rules (the database applies the same rules); undo / redo; autosave that never overwrites a newer copy; 20 themes, own colours, fonts, corners, contrast warning; preview in three widths.
- Quiz mode: points, right answers (single, many, ranking order, words, numbers), explanations, pass mark, the score worked out on the server and kept with each answer; the right answers never leave the server before a person has sent theirs.
- Publish with checks; link, QR code, embed code; close, reopen, unpublish; open and close dates, a maximum number of answers.
- Answers: totals, per day, per question (bars, donut, pie, grid heat map, ranking averages, NPS, numbers), quiz statistics, search, each answer, delete, CSV, Excel (.xls), JSON, print / save as PDF.
- Working together: owner, editor, viewer (database-enforced). Notes (and a mail an hour at most) to the owner for new answers and when the maximum is reached. Web hooks.
- Security: row-level security everywhere, visitors can only call the checked functions, the private file bucket, an AI answer is only ever data that is checked again.

## Not built (recorded, not pretended)
- Payments (no payment provider is connected; nothing is simulated).
- Real-time editing by two people at once (a second window is stopped from overwriting: it is told to reload).
- A receipt e-mail to the person who filled the form (the mail system sends to NOOB accounts only).
- Per-person "one answer only" limits (the form is anonymous by design; there is no reliable identity to count).
- Jumping to a chosen page from an answer (use show-if rules and "end the form here").
- Line, area, scatter, box-plot charts, a geographic map and sentiment analysis (they need data the forms do not collect).
- Conversion of a Word / Google Forms file (only NOOB's own form file can be imported).
