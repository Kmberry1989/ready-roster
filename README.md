# ReadyRoster

## Firestore deployment

The app requires the Firestore rules in `firestore.rules`. After signing in with the Firebase CLI, deploy them with:

```sh
npx firebase-tools deploy --only firestore:rules --project ready-roster1
```
