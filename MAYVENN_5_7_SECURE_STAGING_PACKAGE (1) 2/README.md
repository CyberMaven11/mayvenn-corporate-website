# Mayvenn 5.7 | Independent staging and secure lead delivery

The approved 5.6 site visuals and other pages are unchanged. Only contact.html and script.js under public/ are updated to replace the placeholder form with a secure POST.

## Local test
Node.js 20+: `npm start` then visit http://localhost:3000/contact.html. Without a configured mail provider, submission returns 503 and never falsely claims delivery.

## Independent staging on Render
1. Commit this whole directory to a NEW, separate GitHub repository or an isolated, nonproduction branch. Do not push it to the existing production main branch.
2. Create a **new Web Service** from that repository/branch; build command `npm install`; start command `npm start`. Set STAGING_MODE=true. Do not map mayvennai.com or change DNS.
3. Verify `mayvennai.com` in Resend to allow `inquiries@mayvennai.com` as sender. Configure `RESEND_API_KEY` as a **Render secret environment variable**, `MAYVENN_TO_EMAIL=info@mayvennai.com`, and `MAYVENN_FROM_EMAIL=Mayvenn <inquiries@mayvennai.com>`. Do not put the key in the repository, browser or chat.
4. After staging deploy, use a genuine test inquiry and verify it arrives in the Mayvenn inbox, with Reply-To set to the submitter. Verify error cases, spam resistance and mobile behavior.
5. `/healthz` reveals only configured/not configured, no secrets. Staging includes X-Robots-Tag noindex,nofollow to avoid search indexing.

## Known risks / launch gate
- Email delivery is not operational without a verified sending domain, a configured API credential, and a successful end-to-end test.
- In-memory rate limiting resets on restart and is per instance. For production, use persistent/shared bot protection (e.g., Turnstile + server verification, platform rate limiting).
- A privacy policy and retention/consent review are still required before collecting user information.
- Contact page visual styling, homepage, executive photographs, AI solutions, referral links and all other site assets remain unchanged.
- The existing production Render service, GitHub main and DNS were not changed.
