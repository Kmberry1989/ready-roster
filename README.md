# ReadyRoster

## Firebase deployment

The roster, training, messaging, schedule, and time-clock records use the Firestore rules in `firestore.rules`.

```sh
npx firebase-tools deploy --only firestore:rules --project ready-roster1
```

Employee invitations, server-scored training quizzes, due-date reminders, and protected time-clock actions are implemented as Firebase Cloud Functions in `functions/`. Deploy them with:

```sh
cd functions && npm install
cd .. && npx firebase-tools deploy --only functions,firestore:rules --project ready-roster1
```

Cloud Functions, Cloud Scheduler, and Artifact Registry require Firebase’s Blaze plan. The app deliberately keeps scoring and clock transitions server-side; do not relax the Firestore rules to work around an undeployed Functions backend.

Built-in U.S.-baseline policy and training templates are editable starting points, not legal advice. Organizations should have counsel review policy, leave, employment, safety, privacy, and industry-specific content before assigning it.
