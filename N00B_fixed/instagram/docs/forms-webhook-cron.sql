-- NOOB Forms: send the waiting web hooks by themselves (optional).
-- Every minute the database looks for web hook deliveries that are due. Only when there is at least one, it calls the function forms-webhook-run (nothing is called when nothing is waiting).
-- It uses the same address and secret as the other NOOB functions (table internal_config: push_url, push_secret). Safe to run twice.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'noob-forms-webhooks';
    perform cron.schedule('noob-forms-webhooks', '* * * * *', $job$
      select net.http_post(
        url := replace((select value from public.internal_config where key = 'push_url'), 'dynamic-handler', 'forms-webhook-run'),
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-noob-push', (select value from public.internal_config where key = 'push_secret'))
      )
      where exists (select 1 from public.form_webhook_deliveries where status = 'pending' and next_try <= now() and attempts < 5);
    $job$);
    raise notice 'Scheduled: noob-forms-webhooks (every minute)';
  else
    raise notice 'pg_cron is not available on this project: the owner of a form sends waiting web hooks with the button "Send what is waiting now".';
  end if;
end $$;
