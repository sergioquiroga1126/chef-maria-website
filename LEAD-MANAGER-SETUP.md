# Chef Maria Lead Manager setup

The Lead Manager stores successful website and chatbot inquiries in a private
Cloudflare D1 database. Email delivery remains independent: if D1 is unavailable,
the customer inquiry email can still be delivered to Chef Maria.

## 1. Create the D1 database

1. In Cloudflare, open **Workers & Pages**.
2. Open **D1 SQL database** and select **Create Database**.
3. Name it `chef-maria-leads`.
4. Open the new database and select **Console**.
5. Paste the contents of `migrations/0001_create_leads.sql` into the console.
6. Select **Execute**.

## 2. Bind the database to the Pages project

1. Open **Workers & Pages > chef-maria-website**.
2. Open **Settings > Bindings**.
3. Add a **D1 database binding** to the Production environment.
4. Set the variable name to exactly `DB`.
5. Select the `chef-maria-leads` database.
6. Save the binding.

The code reads the database from `env.DB`, so the binding name must be exactly
`DB`.

## 3. Create the private dashboard key

Generate a strong key on the local Ubuntu computer:

```bash
openssl rand -base64 32
```

Do not paste that key into GitHub, source files, screenshots, or chat messages.

In the Pages project:

1. Open **Settings > Variables and Secrets**.
2. Add `LEAD_MANAGER_KEY` as a **Secret** in Production.
3. Paste the generated key as the secret value and save it.

## 4. Deploy and open the dashboard

After the updated repository is deployed, open:

`https://mariaprivatechef.com/lead-manager.html`

Enter the same private Lead Manager key. The browser keeps it only for the
current tab session. Selecting **Lock dashboard** removes it from the session.

## 5. Test the complete flow

1. Submit one clearly labeled test inquiry from the website or chatbot.
2. Confirm the inquiry email reaches Chef Maria.
3. Refresh the Lead Manager and confirm the lead appears.
4. Change its status to **Contacted**, add a private note, and save it.

The available stages are:

- New
- Contacted
- Proposal Sent
- Booked
- Closed

The manager automatically marks events within seven days as urgent, events
within fourteen days as high priority, and groups over ten as high priority.
