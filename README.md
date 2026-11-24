# DFC Budget Map

Monthly cash-flow planning in MYR with a game-style commitment board. The board shows one prior month and four months ahead of the selected month. Each cell opens a payment editor with a month-specific amount and status. Use a last month for fixed-term instalments, or the same first and last month for a one-off commitment. Due dates and the current month follow Malaysia time.

## Deploy your own copy

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffathur6%2Fdfc-budget-map)

You can set this up in your browser using your own GitHub, Vercel and Supabase accounts.

1. **Deploy the app.** Click **Deploy to Vercel**, sign in, and follow the prompts to create a repository and deploy the app. Copy the production URL from the Vercel project dashboard.
2. **Connect Supabase.** Install [Supabase from the Vercel Marketplace](https://vercel.com/integrations/supabase). Create a Supabase project and connect it to your new Vercel project. The integration supplies the public connection settings automatically. If you prefer a project created directly in Supabase, follow [Vercel and Supabase](#vercel-and-supabase) below.
3. **Initialize the database.** In Supabase, open **SQL Editor → New query**. Copy the full contents of the [budget setup SQL](supabase/migrations/20261113000100_budget_workspaces.sql), paste into the editor, and click **Run** once on the new project.
4. **Set up private sign-in.** In Supabase **Authentication**, disable public sign-ups and set the **Site URL** under **URL Configuration** to the production URL from step 1. Under **Users**, use **Add user** to create your own account. For password sign-in, set a strong password and confirm your own email when creating the account.
5. **Open your app.** In Vercel, go to **Deployments**, redeploy to pick up the synced settings, then open the production URL. Choose **Sign in → Use password** or request an email sign-in link. Save a small test entry and refresh to confirm cloud storage works.

The Vercel button deploys the frontend. Database initialization and the first private account are one-time dashboard steps. Each installation uses its own Supabase project. Supabase service-role keys and database passwords belong in server-side systems only. The [keep-alive](#optional-supabase-keep-alive) is optional.

## Release version

The sidebar displays the version and build number from `package.json`. Update `version` when publishing a new release and increment `buildNumber` for each published build. If the package version changes, update the package lock as well.

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
- Confirm spending from Monthly Summary or Monthly Spending after reviewing a month. The confirmation applies to the saved amounts and active items for that month. The simulator labels scenarios with unconfirmed spending as incomplete and still shows the arithmetic on the entered amounts.
- Open **Monthly Transfer** beside **This month**. From the 21st it opens the next budget month when viewing the current month. Choose **Salary received** to save the take-home income and receipt date for that budget, including paydays before the 21st.
- Payments for the following month's budget count there from the 21st or from an earlier salary receipt, with actual payment dates retained. Older month-only records use an explicitly recorded checklist or carry month when available. Enter the actual date in the payment editor to apply the cutoff precisely. Spending transfers belong to the selected budget month.
- Use **Set opening cash** in Monthly Summary to project closing cash from a balance at the start of a specified month. Each monthly result carries into the next month. An unknown income month stops the running projection until that income is entered or the opening balance is moved.

## Vercel and Supabase

1. Create a dedicated Supabase project and apply the budget workspace migration in [supabase/migrations](supabase/migrations) using the SQL Editor or Supabase CLI.
2. Create the intended sign-in user in Supabase Authentication and disable public sign-ups. Set the Supabase Auth Site URL to the production app. The app emails sign-in links to pre-created users and supports password sign-in for the installed app. Configure SMTP when the built-in mail service cannot deliver to the intended address.
3. Import this repository into Vercel as a Vite project. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel. Use the project's publishable key or legacy anon key. Keep secret and service-role keys out of the browser bundle.
4. Deploy, sign in, and import the browser backup if migrating an existing budget. Verify the first save and refresh in the signed-in workspace.

The budget migration enables owner-scoped [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and denies anonymous access to the budget table. Cloud saves check a workspace revision to avoid silently overwriting concurrent changes.

## Optional DeepSeek insights

Monthly insights show the result before loan proceeds, commitments moved to later months, and upcoming shortfalls based on the entered figures. Budget Map calculates and displays these facts with or without DeepSeek.

1. Open the Vercel project's **Settings → Environment Variables**. Add `DEEPSEEK_API_KEY` as a secret for Production and redeploy. Keep the key server-side.
2. Sign in to Budget Map and open **Overview → Explain this month → Try with demo data** to try the connection with a fictional example.
3. Choose **Explain my month** to let DeepSeek prioritize your selected month's insights. Only predefined patterns are sent to DeepSeek. Exact amounts, dates, item names and notes stay in Budget Map.

The feature uses DeepSeek's usage-billed Flash API. The budget and monthly summary work without an API key.

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
