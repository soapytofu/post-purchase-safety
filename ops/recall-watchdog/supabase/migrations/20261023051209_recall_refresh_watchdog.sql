-- Operational Supabase migration, deliberately outside Prisma's app migrations.
-- Install only on the staging database. No household/catalog writes or secrets.
create extension if not exists pg_cron;
-- statement-breakpoint
create extension if not exists pg_net with schema extensions;
-- statement-breakpoint
create extension if not exists supabase_vault with schema vault;
-- statement-breakpoint
create schema recall_ops;
-- statement-breakpoint
revoke all on schema recall_ops from public, anon, authenticated, service_role;
-- statement-breakpoint
create table recall_ops.watchdog (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  last_checked_at timestamptz,
  decision text not null default 'not_checked',
  last_dispatch_at timestamptz,
  request_id bigint,
  dispatch_status text,
  http_status integer,
  run_id text
);
-- statement-breakpoint
alter table recall_ops.watchdog enable row level security;
-- statement-breakpoint
revoke all on recall_ops.watchdog from public, anon, authenticated, service_role;
-- statement-breakpoint
insert into recall_ops.watchdog (id) values (true);
-- statement-breakpoint
create function recall_ops.check_feeds() returns text
language plpgsql security invoker
set search_path = ''
set timezone = 'UTC'
as $$
declare
  s recall_ops.watchdog%rowtype;
  checked_at timestamptz := clock_timestamp();
  needs_refresh boolean;
  recent_attempt timestamptz;
  token text;
  response record;
  new_request bigint;
  outcome text;
  workflow_run text;
begin
  -- Short row lock serializes cron and operator checks. HTTP happens after commit.
  select * into strict s from recall_ops.watchdog where id for update;
  if s.dispatch_status = 'pending' then
    select status_code, timed_out, error_msg, content into response
      from net._http_response where id = s.request_id;
    if found then
      outcome := case
        when response.timed_out or response.error_msg is not null then 'transport_error'
        when response.status_code in (200, 204) then 'accepted'
        else 'http_error' end;
      -- Store only a numeric run ID; never response bodies, headers or errors.
      if outcome = 'accepted' and response.status_code = 200 then
        begin
          workflow_run := response.content::jsonb ->> 'workflow_run_id';
          if workflow_run !~ '^[0-9]+$' then workflow_run := null; end if;
        exception when others then workflow_run := null;
        end;
      end if;
      update recall_ops.watchdog set dispatch_status = outcome,
        http_status = response.status_code, run_id = workflow_run where id;
    elsif s.last_dispatch_at <= checked_at - interval '5 minutes' then
      -- pg_net's queue/responses are unlogged; a restart can lose them.
      update recall_ops.watchdog set dispatch_status = 'response_missing' where id;
    end if;
  end if;

  select bool_or(
      state.provider is null or state.status is distinct from 'SUCCEEDED'
      or state."recordCount" <= 0 or state."lastSuccessAt" is null
      or state."lastSuccessAt" at time zone 'UTC' > checked_at
      or state."lastSuccessAt" at time zone 'UTC' <= checked_at - interval '90 minutes'
    ), max(state."lastAttemptAt" at time zone 'UTC') into needs_refresh, recent_attempt
    from (values ('openfda-food-enforcement'), ('usda-fsis-recalls'), ('cpsc-recalls')) required(provider)
    left join public."SyncState" state on state.id = required.provider;

  if not s.enabled then outcome := 'disabled';
  elsif not needs_refresh then outcome := 'fresh';
  elsif s.last_dispatch_at > checked_at - interval '60 minutes' then outcome := 'cooldown';
  elsif recent_attempt > checked_at - interval '20 minutes' and recent_attempt <= checked_at then outcome := 'recent_attempt';
  else
    select decrypted_secret into token from vault.decrypted_secrets
      where name = 'recall_watchdog_github_token';
    if token is null or length(token) < 20 then outcome := 'missing_token';
    else
      -- Destination/ref are hardcoded: no caller-controlled URL or workflow.
      new_request := net.http_post(
        url := 'https://api.github.com/repos/soapytofu/post-purchase-safety/actions/workflows/refresh-feeds.yml/dispatches',
        headers := jsonb_build_object('Authorization', 'Bearer ' || token,
          'Accept', 'application/vnd.github+json', 'Content-Type', 'application/json',
          'User-Agent', 'SafeKeep-Recall-Watchdog', 'X-GitHub-Api-Version', '2026-03-10'),
        body := '{"ref":"main","inputs":{"trigger":"supabase-watchdog"}}'::jsonb,
        timeout_milliseconds := 10000
      );
      update recall_ops.watchdog set last_dispatch_at = checked_at,
        request_id = new_request, dispatch_status = 'pending', http_status = null, run_id = null where id;
      outcome := 'dispatch_queued';
    end if;
  end if;
  update recall_ops.watchdog set last_checked_at = checked_at, decision = outcome where id;
  return outcome;
end;
$$;
-- statement-breakpoint
revoke all on function recall_ops.check_feeds() from public, anon, authenticated, service_role;
-- statement-breakpoint
-- The clock runs immediately, but dispatch is OFF until explicitly activated.
select cron.schedule('safekeep-recall-watchdog', '*/10 * * * *', 'select recall_ops.check_feeds();');
