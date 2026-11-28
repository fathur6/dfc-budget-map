# Set up feature requests

The **Request a feature** form sends a suggestion and optional contact email to the app maintainer's Google Sheet. It also records the selected interface language, the app version and a receipt ID. Keep the Sheet private to the people who review requests.

| Column | What it stores |
| --- | --- |
| Timestamp | When Google Sheets received the request |
| User Email | An address only when the user enters one |
| Suggested Feature | The user's text, stored as plain text |
| Status | Starts as `New`. Use `Under review`, `Planned`, `Released` or `Closed` when triaging |
| Language | The selected interface language |
| App version | The version and build that received the request |
| Request ID | The same receipt ID shown in the app after submission |

1. Open the destination Google Sheet and choose the tab where requests should appear. Copy the spreadsheet ID between `/d/` and `/edit` in the address bar and the tab ID after `gid=`. For an existing request tab, the first three columns should be **Timestamp**, **User Email** and **Suggested Feature**.
2. Open the Apps Script project for the form and add the [feature request script](../integrations/apps-script/FeatureRequests.gs). If the project already has a POST handler, use a dedicated project or integrate the handlers before deploying.
3. In **Project Settings → Script Properties**, set the following values. Generate a random secret of at least 32 characters and keep it out of GitHub. [Apps Script properties](https://developers.google.com/apps-script/guides/properties)

   | Script property | Value |
   | --- | --- |
   | `FEATURE_REQUESTS_SPREADSHEET_ID` | The spreadsheet ID from step 1 |
   | `FEATURE_REQUESTS_SHEET_ID` | The numeric tab ID from step 1 |
   | `FEATURE_REQUESTS_SECRET` | The shared secret |

4. In the editor, select and run `setupFeatureRequests` once. Authorize the script. Confirm the intended tab has all seven headers. In the Sheet's settings, choose the time zone used to display timestamps, such as Kuala Lumpur.
5. Choose **Deploy → New deployment → Web app**. Use **Execute as me** and **Who has access: Anyone** so Vercel can reach the receiving endpoint. The receiver checks a signature on every request before accessing the Sheet. Copy the deployment URL ending in `/exec`. [Apps Script web app deployment](https://developers.google.com/apps-script/guides/web)
6. In the app's Vercel environment variables, set `FEATURE_REQUESTS_WEB_APP_URL` to the URL from step 5 and `FEATURE_REQUESTS_SECRET` to the same secret from step 3. Select the environment where the form should work and redeploy there. Use Vercel's secret setting for the secret. [Vercel environment variables](https://vercel.com/docs/environment-variables)
7. Submit one test suggestion through the app and check that the matching receipt ID appears once in the intended tab.
