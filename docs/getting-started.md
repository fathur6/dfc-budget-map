# Getting started with DFC Budget Map

Open the [demo](https://dfc-budget-map.vercel.app/#overview) to try the app with fictional data. To use it on one browser, choose **Start fresh** and export backups from the **Data** menu. For a private budget you can open on multiple devices, set up your own copy below.

If you prefer help from a coding agent, [copy the AI agent setup prompt](ai-agent-setup.md#copy-this-first) to run the app locally or set up your own hosted copy.

## Run with Docker

With Docker running, open a terminal and run this command. Docker downloads the app from [GitHub Packages](https://github.com/fathur6/dfc-budget-map/pkgs/container/dfc-budget-map) the first time.

```sh
docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/fathur6/dfc-budget-map:latest
```

Open [http://localhost:8080](http://localhost:8080). Try the demo or choose **Start fresh** to create a budget. The image supports Intel and AMD 64-bit computers and ARM64 computers such as Apple silicon Macs.

Your budget is saved in the browser. Press **Ctrl+C** to stop the app, and use the same browser and address when you start it again. Use **Data → Export backup** before switching browsers or ports. To update the app, stop it, run `docker pull ghcr.io/fathur6/dfc-budget-map:latest`, then run the start command again.

This Docker image works in browser-only mode. For Supabase sync and optional DeepSeek insights, follow the hosted setup below.

## Deploy your own copy

You can do all of this in a browser. GitHub keeps your copy of the app, Vercel hosts it at your own web address, and Supabase stores your budget and sign-in.

### 1. Create your app on Vercel

1. Click [**Deploy with Vercel**](../README.md#deploy-with-vercel) in the README. Sign in and select your GitHub account to create a copy of the repository.
2. In the setup flow, create or connect a dedicated **Supabase** database to your new Vercel project. The integration fills in the connection settings. If the Supabase step does not appear, install it from the Vercel Marketplace and connect it to your app, or [enter the two connection settings yourself](#connect-an-existing-supabase-project). [Supabase Marketplace setup](https://supabase.com/docs/guides/integrations/vercel-marketplace)
3. Once the deployment is ready, copy the app's production address from Vercel, such as `https://your-budget-map.vercel.app`. Use this same address on all your devices.

### 2. Prepare your budget database

1. In Vercel, open **Storage → your Supabase project → Open in Supabase**. If you set up Supabase separately, open your connected project directly.
2. Open the [budget setup SQL file](../supabase/migrations/20261113000100_budget_workspaces.sql) in GitHub and choose **Raw**. Copy the entire file.
3. In Supabase, open **SQL Editor → New query**, paste the SQL, and click **Run** once. This creates the budget table and gives signed-in users access to their own records. You can leave the optional keep-alive setup for later.

### 3. Create your private sign-in

1. In Supabase, open **Authentication → URL Configuration** and set **Site URL** to the Vercel production address copied in step 1. [Supabase URL settings](https://supabase.com/docs/guides/auth/redirect-urls)
2. In **Authentication**, turn off **Allow new users to sign up** so only accounts you create can sign in. [Supabase sign-up settings](https://supabase.com/docs/guides/auth/general-configuration)
3. Open **Authentication → Users → Add user → Create new user**. Enter your own email and a password, tick **Auto confirm user?**, then click **Create user**.
4. If you connected Supabase or changed connection settings after deployment, go to **Vercel → Deployments** and **Redeploy** the latest production deployment. [Vercel redeploy steps](https://vercel.com/docs/deployments/managing-deployments#redeploy-a-project)
5. Open your app's production address. Choose **Sign in → Use password**, then enter the email and password just created in Supabase. Look for **Supabase** at the top of the app to confirm that you are in the synced workspace.

## Start your first month

1. On **Overview**, choose the month and click the pencil on **Cash inflow**. Enter your take-home income and save. Refresh the page and check the number is still there.
2. In **Commitment Map → Add commitment**, enter a bill or instalment. Add its amount, first month and due day. For a one-off bill, set the first and last month to the same month.
3. In **Monthly Spending → Add item**, add a spending item and open its cell for the month to enter the amount.
4. Open **Monthly Transfer** to check off commitment payments and spending transfers after completing them.
5. Use **Data → Export backup** to save a copy. If you already have a browser budget, export it while signed out and import it after signing in to your new app. **Import budget** replaces the budget in the workspace currently open.

## Enable DeepSeek insights

DeepSeek is optional. After you set up your sign-in, you can connect your own DeepSeek account to highlight what to review in each month's budget.

1. Sign in to the DeepSeek API platform and create an API key for Budget Map. Usage, including demo requests, is billed to your own DeepSeek account. Check your API balance before testing. [Create a DeepSeek API key](https://platform.deepseek.com/api_keys) · [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing/)
2. Open your Budget Map project in **Vercel → Settings → Environment Variables → Add Environment Variable**. Select **Secret** (or **Sensitive**), enter `DEEPSEEK_API_KEY` in **Key**, paste your own API key in **Value**, select **Production**, and save. Keep the key in Vercel's secret setting. GitHub only needs the setting name, and browser variables prefixed with `VITE_` are public. [Vercel environment variable settings](https://vercel.com/academy/vercel-foundations/vercel-settings#environment-variables)
3. In **Vercel → Deployments**, redeploy your latest production deployment so it picks up the setting. [Vercel redeploy steps](https://vercel.com/docs/deployments/managing-deployments#redeploy-a-project)
4. Open your production app, sign in, and choose **Overview → Explain this month → Try with demo data**. Look for **Prioritized by DeepSeek** above the result. Then use **Back to my month → Explain this month → Explain my month** to review your own month.

Budget Map sends DeepSeek a small set of predefined budget patterns. Exact amounts, dates, names and notes stay in Budget Map.

## Add Budget Map to your phone

Open your production address on your phone. On **iPhone**, use Safari's **Share → Add to Home Screen** and enable **Open as Web App** if shown. On **Android**, open Chrome's menu and select **Install and create shortcut** or **Install app** when available. Open the new icon and use the same account if prompted to sign in. [Apple guide](https://support.apple.com/guide/iphone/iphea86e5236/ios) · [Chrome guide](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid)

## Connect an existing Supabase project

In your dedicated Supabase project, open **Connect** for the **Project URL** and **Settings → API Keys** for the **Publishable key**. These connect the app to Supabase. Your email and password are for signing in to Budget Map. [Supabase API key guide](https://supabase.com/docs/guides/getting-started/api-keys)

If you haven't created the Vercel app, use [**Deploy with my own Supabase settings**](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffathur6%2Fdfc-budget-map&project-name=dfc-budget-map&repository-name=dfc-budget-map&env=VITE_SUPABASE_URL%2CVITE_SUPABASE_PUBLISHABLE_KEY&envDescription=Enter%20the%20Project%20URL%20and%20publishable%20key%20from%20your%20own%20Supabase%20project.&envLink=https%3A%2F%2Fgithub.com%2Ffathur6%2Fdfc-budget-map%2Fblob%2Fmain%2Fdocs%2Fgetting-started.md%23connect-an-existing-supabase-project) and fill in the two fields. If you already deployed, add both in **Vercel → Settings → Environment Variables** for **Production** and redeploy.

| Field in Vercel | Copy from Supabase |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL, typically ending in `.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key or legacy `anon` key |

Keep your database password, secret key and service-role key out of these fields and GitHub. Continue with [preparing the budget database](#2-prepare-your-budget-database).

## If you get stuck

| What you see | What to check |
| --- | --- |
| No **Sign in** button | Confirm the Supabase connection is set in the Vercel project and redeploy. If using manual settings, confirm both fields are present for **Production**. |
| Sign-in fails | Confirm the user exists in the connected Supabase project's **Authentication → Users**, is email-confirmed, and that you selected **Use password**. |
| An email sign-in link never arrives | Use the password from setup. To use email links, configure your project's mail provider. [Supabase email delivery settings](https://supabase.com/docs/guides/auth/auth-smtp) |
| The app can't load or save the budget | Make sure the budget setup SQL ran in the same Supabase project connected to Vercel and that the project is active. |
| The budget is blank after signing in | The browser and cloud budgets are separate. Export the browser budget while signed out, then sign in and import the file. |
| DeepSeek is disabled or unavailable | Check that `DEEPSEEK_API_KEY` is set for **Production**, redeploy if you added or changed it, and check that the DeepSeek key and API balance are active. |
