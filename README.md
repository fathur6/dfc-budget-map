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

- Take-home income uses the month-specific value when entered, then the default. Without either, the app leaves the balance blank.
- Monthly commitments include every active instalment, including those already paid. An instalment is scheduled through its due day and becomes missed afterwards unless marked paid. A provisional schedule stays scheduled until confirmed or marked manually.
- Each spending category contributes the greater of its budget and recorded spending to the forecast. The projected balance is income minus commitments and forecast spending.
- The simulator adds the proposed payment to every month of its term. It applies prior missed instalments to the first month and checks the lowest remaining balance against the entered buffer. Earlier missed payments appear separately on the dashboard. Estimates depend on the entered income, commitments and spending.

## Vercel and Supabase

1. Create a dedicated Supabase project and apply the SQL migration in [supabase/migrations](supabase/migrations) using the SQL Editor or Supabase CLI.
2. Create the intended sign-in user in Supabase Authentication and disable public sign-ups. Set the Supabase Auth Site URL to the production app. The app emails sign-in links to pre-created users and supports password sign-in for the installed app. Configure SMTP when the built-in mail service cannot deliver to the intended address.
3. Import this repository into Vercel as a Vite project. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel. Use the project's publishable key or legacy anon key. Keep secret and service-role keys out of the browser bundle.
4. Deploy, sign in, and import the browser backup if migrating an existing budget. Verify the first save and refresh in the signed-in workspace.

The migration enables owner-scoped [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and gives anonymous users no table access. Cloud saves check a workspace revision to avoid silently overwriting concurrent changes.

Visual reference: [Finance Pulse](https://github.com/fathur6/loan-budget-app).
