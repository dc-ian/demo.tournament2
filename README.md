# HeyHoney Tournaments
Static site (index.html, styles.css, script.js) + one Vercel Function (`api/data.js`) backed by Upstash Redis.

## Deploy
1. Push this folder to GitHub (or run `npx vercel` in it) and import it in Vercel. No build command, no framework.
2. In the Vercel project: Storage -> Create/Connect **Upstash Redis**. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Redeploy. Open the site, go to Admin and create the admin passcode (first visit only).

`npm test` runs the logic tests.
