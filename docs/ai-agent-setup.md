# Set up DFC Budget Map with an AI agent

Use whichever agent you already have, such as ChatGPT Codex, OpenCode, Hermes Agent, DeepSeek Harness or Claude Code. Open a project the agent can access and paste the first prompt below. An agent with access to your files and terminal can install and test the app. For dashboard steps that need your account, sign in and enter your credentials directly with the provider.

## Copy this first

This prompt covers both a local install and a hosted copy. Use the follow-up prompts if you want help with just one service.

```text
Help me set up DFC Budget Map from https://github.com/fathur6/dfc-budget-map.

Ask whether I want a local copy on this computer or a private budget hosted at
my own web address with sync across devices. Start locally if I am unsure.

Use an existing checkout if I have one. Otherwise clone the repo into a new
folder, keeping existing files and changes intact. Read README.md,
docs/getting-started.md, package.json and any repository instructions first.

For local setup, use the Node.js version in package.json, run npm ci and
npm test, then start npm run dev. Open the local URL if you can and check that
the fictional demo opens. Give me the URL and the command to start it again.
Local setup needs no Vercel, Supabase or DeepSeek account. Show me Start fresh
when I am ready to use a clean browser budget and Data → Export backup to save it.

For a hosted copy, follow Deploy your own copy in docs/getting-started.md using
my own GitHub, Vercel and Supabase accounts. Deploy the app, prepare the budget
database, and guide me through private sign-in. Confirm the production URL and
verify that a fictional entry in a new test workspace persists after reload.
Leave DeepSeek off unless I choose to enable it.

Carry out the steps you can verify. For steps that need my browser access,
show me the exact page, buttons and fields, then resume from there. Keep
secrets out of the chat, logs and GitHub. Ask before replacing existing data,
changing an existing production app, or enabling anything that costs money.
Finish with the app URL, what you verified and any remaining steps.
```

## Set up Vercel hosting

Vercel gives your copy of the app a web address. Use this prompt to deploy it and connect it to your Supabase project. [Vercel environment variables](https://vercel.com/docs/environment-variables) · [Supabase on the Vercel Marketplace](https://supabase.com/docs/guides/integrations/vercel-marketplace)

```text
Help me deploy my own copy of DFC Budget Map to Vercel. Read README.md and
docs/getting-started.md. Use the Deploy with Vercel button or import my GitHub
copy into my Vercel account. Verify the target before changing an existing
project. Avoid paid resources unless I approve them.

Connect my dedicated Supabase project. Check whether the integration already
provides a matching pair of settings supported by this app. For manual setup,
add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to Production in Vercel
using my Supabase Project URL and publishable key. Keep database passwords
and service-role or secret keys out of browser settings, chat and GitHub.

Redeploy after changing environment variables. Give me the verified production
URL and the name of the connected Supabase project. Explain which sign-in or
database steps still need to be completed. If you lack dashboard access, guide
me through the exact clicks so I can complete them in my account.
```

## Set up Supabase database and sign-in

Supabase stores each signed-in user's budget. Use the same project you connected to Vercel. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys) · [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

```text
Help me prepare the Supabase project connected to my DFC Budget Map deployment.
Follow the database and private sign-in steps in docs/getting-started.md.
Verify the project and check whether the budget migration has already run.

If the budget table is absent, apply the repository's budget setup SQL once
from supabase/migrations/20261113000100_budget_workspaces.sql. If it already
exists, verify the setup before making changes. Confirm row-level security
is enabled, signed-in users can access only their own budget, and anonymous
users have no budget table access. Preserve existing data and other tables.

Set the Supabase Auth Site URL to my Vercel production URL and disable public
sign-ups for this dedicated project. Guide me through creating an email-confirmed
user in Supabase and entering the credentials directly in the provider and app.
Do not ask me to paste the password here. Use Sign in → Use password in the app.
Verify the Supabase indicator and save and reload a fictional entry in a new
test workspace. Tell me which checks passed and which still need my action.
```

## Enable DeepSeek insights (optional)

You can use any supported coding agent to set up the app. DeepSeek insights are a separate choice and use your own usage-billed API account. The app's regular budget calculations work without it. [DeepSeek API keys](https://platform.deepseek.com/api_keys) · [DeepSeek API pricing](https://api-docs.deepseek.com/quick_start/pricing/)

```text
Help me enable optional DeepSeek insights on my own DFC Budget Map deployment.
Follow Enable DeepSeek insights in docs/getting-started.md. Check that my
production app and Supabase sign-in are working first.

Guide me to create my own DeepSeek API key and enter it directly in my Vercel
project as the server-side DEEPSEEK_API_KEY secret for Production. Keep the
value out of chat, logs, GitHub and all browser variables, including VITE_
and NEXT_PUBLIC_ variables. Once saved, redeploy to apply the setting.

Confirm I want to make a billed demo request, then sign in to my production
app and use Overview → Explain this month → Try with demo data. Check for
Prioritized by DeepSeek and report whether the test worked. Use fictional data
for verification. If the test fails, help me check the environment selection,
redeployment and DeepSeek account status without revealing the key.
```
