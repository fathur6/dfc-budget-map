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
- Each spending category contributes the greater of its budget and recorded spending to the forecast. The projected balance is income plus loan proceeds, minus commitments and forecast spending.
- The simulator adds the proposed payment to every month of its term and excludes loan proceeds. It includes each instalment in its allocated month and applies older missed payments still due to the first month of the scenario. It checks the lowest remaining balance against the entered buffer.

## Vercel and Supabase

1. Create a dedicated Supabase project and apply the SQL migration in [supabase/migrations](supabase/migrations) using the SQL Editor or Supabase CLI.
2. Create the intended sign-in user in Supabase Authentication and disable public sign-ups. Set the Supabase Auth Site URL to the production app. The app emails sign-in links to pre-created users and supports password sign-in for the installed app. Configure SMTP when the built-in mail service cannot deliver to the intended address.
3. Import this repository into Vercel as a Vite project. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel. Use the project's publishable key or legacy anon key. Keep secret and service-role keys out of the browser bundle.
4. Deploy, sign in, and import the browser backup if migrating an existing budget. Verify the first save and refresh in the signed-in workspace.

The migration enables owner-scoped [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and gives anonymous users no table access. Cloud saves check a workspace revision to avoid silently overwriting concurrent changes.

Visual reference: [Finance Pulse](https://github.com/fathur6/loan-budget-app).
