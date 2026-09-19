# BuildEx Supabase Edge Functions

| Function | Authentication | Purpose |
|---|---|---|
| `delete-account` | user JWT validated in-function | Removes a user's Storage files through the Storage API, then permanently deletes their auth account. |

The payment, payout and ready-build functions were removed with the money layer.
Their database tables are retained deliberately for record-keeping — see
[`supabase/migrations/0095_decommission_payments.sql`](../migrations/0095_decommission_payments.sql).

Deploy account deletion after linking the project:

```powershell
npx supabase functions deploy delete-account
```
