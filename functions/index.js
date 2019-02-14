'use strict';

const {
    dialogflow,
    Confirmation,
    SignIn,
} = require('actions-on-google')
const firebase = require('firebase');
const functions = require('firebase-functions');
const request = require('request');

const PROJECT_ID = 'nuxeo-1b48c';
const FIREBASE_AUTH_DOMAIN = `${PROJECT_ID}.firebaseapp.com`;

// Firebase Realtime Database initialization
const appConfig = {
  apiKey: '*****',
  authDomain: FIREBASE_AUTH_DOMAIN,
  databaseURL: `https://${PROJECT_ID}.firebaseio.com`,
};
firebase.initializeApp(appConfig);
const database = firebase.database();

// Dialogflow initialization
const app = dialogflow({
  debug: true,
  clientId: 'nuxeo-google-assistant',
})

// --------------------------------------------------------
// Intents
// --------------------------------------------------------
app.intent('Default Welcome Intent', (conv) => {
  console.log('Default Welcome Intent');
  // Look for account details in conversation data or in local storage and sign in if not found
  let account = conv.data.account;
  if (!account) {
    account = conv.user.storage.account;
    if (!account) {
      return signIn(conv, 'Welcome!');
    }
    conv.data.account = account;
  }
  // Signed in
  const date = new Date().getHours()
  let greetings;
  if (date < 12) {
    greetings = 'Good morning';
  } else if (date < 18) {
    greetings = 'Good afternoon';
  } else {
    greetings = 'Good evening';
  }
  return conv.ask(`${greetings} ${conv.data.account.firstName}! What can I do for you today?`);
});

app.intent('Sign In', (conv, _, signin) => {
  console.log('Sign In');
  // Sign in failed
  if (signin.status !== 'OK') {
    return signIn(conv, 'Something went wrong during the sign in process.');
  }
  // Successfully signed in, get account details and store them in the conversation data
  conv.data.account = {};
  conv.data.account.accessToken = conv.user.access.token;
  return database.ref(`nuxeoHosts/${conv.data.account.accessToken}`).once('value')
    .then((snapshot) => {
      // Should be able to remove the token/host pair if access token could be cleared
      // database.ref(`nuxeoHosts/${conv.data.account.accessToken}`).remove()
      const snapshotVal = snapshot.val();
      const nuxeoHost = snapshotVal && snapshotVal.nuxeoHost;
      if (nuxeoHost) {
        conv.data.account.nuxeoHost = nuxeoHost;
        return nuxeoHost;
      } else {
        throw new Error('Cannot retrieve Nuxeo host from database.');
      }
    })
    .then(() => getAccountDetails(conv))
    .then((user) => {
        conv.data.account.firstName = user.properties.firstName;
        // Obtain consent from the user to save its account details
        return conv.ask(new Confirmation(`You successfully signed in as ${conv.data.account.firstName} to Nuxeo host ${conv.data.account.nuxeoHost}.
          Do you agree to save your account details for future conversations?`
        ));
    }).catch((error) => {
      console.log(error);
      conv.ask('An error occurred while trying to get your account details.');
    });
});

app.intent('Sign In Confirmation', (conv, _, confirmationGranted) => {
  if (confirmationGranted) {
    conv.user.storage.account = {};
    Object.assign(conv.user.storage.account, conv.data.account);
    conv.ask('Your account details were successfully saved for future converstations. You can forget them by saying "sign out".');
  } else {
    conv.ask('No problem! Your account details will be forgotten at the end of the conversation.');
  }
});

app.intent('Sign Out', (conv) => {
  conv.user.storage = {};
  conv.data = {};
  conv.ask('You successfully signed out. You can sign in back by saying "sign in".');
});

const signIn = (conv, prefix) => {
  return conv.ask(new SignIn(`${prefix}\nTo access your content`));
}

// --------------------------------------------------------
// OAuth 2 account linking functions
// --------------------------------------------------------
exports.oauth2Authorize = functions.https.onRequest((req, res) => {
  console.log('oauth2Authorize');
  const {
    nuxeoHost,
    state,
   } = req.query;
  database.ref(`nuxeoHosts/${state}`).set({
    nuxeoHost,
  });
  const queryString = Object.keys(req.query)
    .filter((key) => key !== 'redirect_uri')
    .map((key) => `${key}=${req.query[key]}`).join('&');
  const authorizeURL = `https://${nuxeoHost}/nuxeo/oauth2/authorize?${queryString}&redirect_uri=https://${FIREBASE_AUTH_DOMAIN}/oauth2Redirect`;
  res.redirect(authorizeURL);
});

exports.oauth2Redirect = functions.https.onRequest((req, res) => {
  console.log('oauth2Redirect');
  const {
    code,
    state,
   } = req.query;
  database.ref(`nuxeoHosts/${state}`).once('value')
    .then((snapshot) => {
      database.ref(`nuxeoHosts/${state}`).remove()
      const snapshotVal = snapshot.val();
      const nuxeoHost = snapshotVal && snapshotVal.nuxeoHost;
      if (!nuxeoHost) {
        return res.status(500).send('Unknown Nuxeo host.');
      }
      database.ref(`nuxeoHosts/${code}`).set({
        nuxeoHost,
      });
      const queryString = Object.keys(req.query).map((key) => `${key}=${req.query[key]}`).join('&');
      const redirectURI = `https://oauth-redirect.googleusercontent.com/r/${PROJECT_ID}?${queryString}`;
      return res.redirect(redirectURI);
    }).catch((e) => {
      console.error(e);
      res.status(500).send('Unknown error during OAuth2 redirect flow.')
    });
});


exports.oauth2Token = functions.https.onRequest((req, res) => {
  console.log('oauth2Token');
  const { code } = req.body;
  database.ref(`nuxeoHosts/${code}`).once('value')
    .then((snapshot) => {
      database.ref(`nuxeoHosts/${code}`).remove();
      const snapshotVal = snapshot.val();
      const nuxeoHost = snapshotVal && snapshotVal.nuxeoHost;
      if (!nuxeoHost) {
        return res.status(500).send('Unknown Nuxeo host.');
      }
      // Waiting for the nuxeo-1b48c project to be linked to a billing account to allow external requests.
      // return request.post({
      //   url: `${nuxeoHost}/nuxeo/oauth2/token`,
      //   form: req.body,
      // }, (err, _, body) => {
      //   if (err) {
      //     return res.status(500).send('Error during OAuth2 token flow.');
      //   }
      //   return res.status(200).send(body)
      // });
      const accessToken = '*****';
      database.ref(`nuxeoHosts/${accessToken}`).set({
        nuxeoHost,
      });
      return res.status(200).send({
        'access_token': accessToken,
        'expires_in': 3599.0,
        'refresh_token': 'xxx',
        'token_type': 'bearer'
      });
    }).catch((e) => {
      console.error(e);
      res.status(500).send('Unknown error during OAuth2 token flow.')
    });
});

// --------------------------------------------------------
// Nuxeo calls
// --------------------------------------------------------
const getAccountDetails = (conv) =>
  new Promise((resolve, reject) =>
    // Waiting for the nuxeo-1b48c project to be linked to a billing account to allow external requests.
    // request(`https://${conv.data.account.nuxeoHost}/nuxeo/api/v1/me?access_token=${conv.data.account.accessToken}`,
    //   (error, _, body) => {
    //     if (error) {
    //       reject(error);
    //     }
    //     try {
    //         resolve(JSON.parse(body));
    //     } catch (e) {
    //         reject(e);
    //     }
    // })
    resolve(JSON.parse(`{
      "id": "john",
      "properties": {
        "firstName": "John"
      }
    }`))
  );

exports.dialogflowWebhook = functions.https.onRequest(app)
