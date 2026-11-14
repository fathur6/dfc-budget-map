# DFC Budget Map

Monthly cash-flow planning in MYR with a game-style commitment board. The board shows one prior month and four months ahead of the selected month. Each cell opens a payment editor with a month-specific amount and status. Use a last month for fixed-term instalments, or the same first and last month for a one-off commitment. Due dates and the current month follow Malaysia time.

## Run locally

```sh
npm ci
npm run dev
npm test
npm run build
```

The sample budget is fictional. **Start fresh** opens a blank browser budget. **Data** imports or exports a private JSON backup. Browser budgets persist in the current browser and origin. Export before moving between origins or devices. Import replaces the current workspace.

## Install on iPhone

Open the production app in Safari, then use **Share → Add to Home Screen**. Leave **Open as Web App** on if the option appears. In a browser where you are already signed in, use **Data → Set sign-in password**. Open **Budget Map** from the Home Screen and sign in with the same email and that password. Supabase sync needs an internet connection.

## How projections work

- Open any **Income** cell in Monthly Summary to set the base income for that month and add gifts, project income, loan proceeds or other sources. A blank override uses the default. Set the override to zero for months with only additional sources. Without a known base income, the app leaves the balance blank.
- Gifts, project income and other income are added to the selected month’s income. Loan proceeds appear separately and increase that month’s cash balance. Enter repayments in the Commitment Map.
- The Commitment Map shows each instalment in its original due month. Choose a payment month on the instalment to allocate an early or late payment to that month's budget. Use **Planned** before payment and **Paid** with the actual month once settled. **View transfers** in Monthly Summary shows the original total and each adjustment.
- The dashboard includes paid and unpaid commitments in their allocated months. An instalment with a verified due date becomes missed after its original due day unless marked paid.
- The balance is income plus loan proceeds, minus commitments and recorded spending. Empty spending cells count as zero, including in the simulator.
- The simulator adds the proposed payment to every month of its term and excludes loan proceeds. It includes each instalment in its allocated month and applies older missed payments still due to the first month of the scenario. It checks the lowest remaining balance against the entered buffer.

## Vercel and Supabase

1. Create a dedicated Supabase project and apply the budget workspace migration in [supabase/migrations](supabase/migrations) using the SQL Editor or Supabase CLI.
2. Create the intended sign-in user in Supabase Authentication and disable public sign-ups. Set the Supabase Auth Site URL to the production app. The app emails sign-in links to pre-created users and supports password sign-in for the installed app. Configure SMTP when the built-in mail service cannot deliver to the intended address.
3. Import this repository into Vercel as a Vite project. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel. Use the project's publishable key or legacy anon key. Keep secret and service-role keys out of the browser bundle.
4. Deploy, sign in, and import the browser backup if migrating an existing budget. Verify the first save and refresh in the signed-in workspace.

The budget migration enables owner-scoped [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and denies anonymous access to the budget table. Cloud saves check a workspace revision to avoid silently overwriting concurrent changes.

## Optional Supabase keep-alive

The **Supabase keep-alive** workflow runs a real read-only Data API query at 04:17, 10:17, 16:17 and 22:17 MYT. GitHub schedules these runs at minute 17 of hours 02, 08, 14 and 20 UTC. It works while the browser is closed. It requests one row from `public.keep_alive_health` and succeeds only if the result is exactly `[{"ready":true}]`. Requests time out after eight seconds. Transient failures allow at most three attempts. A long `Retry-After` causes the run to fail visibly. The workflow does not call a resume API or change quotas.

### Setup

1. In the Supabase SQL Editor, review the hosted project's default table grants and effective budget access before applying the keep-alive migration. Run the following metadata queries as the role that will apply the migration. Review defaults for the migration role and any unexpected entries. Verify that the budget query returns `anon_can_select = false` and `rls_enabled = true`. If there is a mismatch, stop and review it before proceeding. These queries do not read budget rows. See [Supabase's Data API privilege guide](https://supabase.com/docs/guides/api/securing-your-api).

   ```sql
   select defaclrole::regrole as creator,
     case when defaclnamespace = 0 then '(global)'
          else defaclnamespace::regnamespace::text end as scope,
     case when acl.grantee = 0 then 'PUBLIC'
          else acl.grantee::regrole::text end as grantee,
     acl.privilege_type, acl.is_grantable
   from pg_default_acl
   cross join lateral aclexplode(defaclacl) as acl
   where defaclobjtype = 'r'
     and defaclnamespace in (0, 'public'::regnamespace::oid)
   order by 1, 2, 3, 4;

   select has_any_column_privilege('anon', oid, 'SELECT') as anon_can_select,
     relrowsecurity as rls_enabled
   from pg_class
   where oid = 'public.budget_workspaces'::regclass;
   ```

2. Apply [the keep-alive migration](supabase/migrations/20261114000100_keep_alive_health.sql) once, after the budget workspace migration. It removes any default grants on the new table, enables RLS, and grants only `SELECT` to `anon` for the single static row. It checks effective grants inside the same transaction and rolls back if the checks fail. Leave global defaults and budget policies as they are. For a local role test, apply both migrations in a disposable Supabase database, then run `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/keep_alive_permissions.sql` using the local connection from `supabase status`.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions**. Set these two repository values before adding the workflow to the default branch:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `SUPABASE_URL` | The canonical project URL, `https://<project-ref>.supabase.co`, from the Supabase Connect dialog. |
   | Secret | `SUPABASE_KEEP_ALIVE_KEY` | A publishable key from **Supabase Dashboard → Settings → API Keys**, or the legacy `anon` key if needed. |

   Add the key directly in GitHub. Keep it out of commits and frontend configuration for this workflow. The workflow needs no service-role key, database password, or management token. The app's existing `VITE_*` settings are separate. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) and [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).
4. With the workflow on the default branch, open **Actions → Supabase keep-alive → Run workflow**, select the default branch and run it. Open the **check** job and verify that it reports `Supabase health row verified.` This verifies one live read. Review the effective grants on the new table in the hosted database and use a disposable database for write-denial tests.

### Operation and recovery

- For a failed run, open the **check** job under **Actions → Supabase keep-alive**. Configuration, denied access, unexpected data and retry exhaustion fail the job with a short message. In GitHub notification settings, go to **System → Actions**, select email or GitHub notifications, then choose **Only notify for failed workflows**. Scheduled alerts go to the workflow's schedule owner, which can change when someone edits the cron or re-enables it. See [GitHub notification settings](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications) and [scheduled notification recipients](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).
- GitHub can delay or drop scheduled runs. It automatically disables scheduled workflows in a public repo after 60 days without repository activity. Check the run history periodically, even if no failure email arrives. To disable or re-enable the workflow, open its **Actions** page and use the workflow menu. See [GitHub schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) and [workflow controls](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows).
- A normal database query cannot resume a paused project. Open the **Supabase Dashboard**, choose the organization and project, click **Resume project** and confirm. When the project is active, run the workflow manually. See [Supabase Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- This is best-effort. Supabase may still pause a Free project. **Pro** is Supabase's official option to remove inactivity pausing. Keep separate budget backups using **Data → Export backup**. The health check provides no backup or restore capability.

Visual reference: [Finance Pulse](https://github.com/fathur6/loan-budget-app).
