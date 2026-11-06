# Deploy notes (owner runs these)

Project: `migwith-mumbai`. Functions region: `asia-south1`.

## Latest changes that need a deploy

Deploy only the functions that changed:

```bash
firebase deploy --only functions:manageFounder,functions:changeManagementRole,functions:getLudoContest,functions:ceoLudoContest,functions:onCoinTransactionCreated --project migwith-mumbai
```

- `manageFounder`: founder and staff/admin permissions, permission mails.
- `changeManagementRole`: role Alerts and role Mails (Mentor, Merchant, Country Representative, Executive Board, Elite).
- `getLudoContest` / `ceoLudoContest`: Game Contests (start, stop, reset, edit, delete, prize).
- `onCoinTransactionCreated`: counts wins for every game contest.

## Firestore rules

```bash
firebase deploy --only firestore:rules --project migwith-mumbai
```

(`firestore.rules` in the repo root.)

## After deploy

- In the app: Clean → Rebuild.
- If a button says `internal [0]`, the function was not deployed yet.
