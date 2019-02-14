'use strict';

const {
  dialogflow,
  SignIn,
  UnauthorizedError,
} = require('actions-on-google')
const functions = require('firebase-functions');
const request = require('request');

const config = require('./config.json');

// Dialogflow initialization
const app = dialogflow({
  debug: true,
  clientId: 'nuxeo-google-assistant',
})

// Project configuration
const { serverURL } = config;

// --------------------------------------------------------
// Intents
// --------------------------------------------------------
app.intent('Default Welcome Intent', (conv) => {
  // Sign in if needed
  if (!conv.user.access.token) {
    return signIn(conv, 'Welcome to Nuxeo!');
  }

  // Get user details if needed and welcome user
  if (!conv.data.user) {
    return getUserDetails(conv).then(() => welcome(conv));
  }

  // Welcome user
  return welcome(conv);
});

app.intent('Sign In', (conv, _, signin) => {
  // Sign in failed
  if (signin.status !== 'OK') {
    return signIn(conv, 'Something went wrong during the sign in process.');
  }

  // Signed in
  return getUserDetails(conv)
    .then(() => {
      const firstName = getUserFirstName(conv);
      const userInfo = firstName ? ` as ${firstName}` : '';
      return conv.ask(`You successfully signed in${userInfo}. You can sign out by saying "sign out".`);
    });
});

app.intent('Sign Out', (conv) => {
  // Currently, throwing UnauthorizedError is the only way to sign out.
  // Yet, it crashes the action and doesn't allow to send a simple response.
  // See https://github.com/actions-on-google/actions-on-google-nodejs/issues/289
  // conv.ask('You successfully signed out. You can sign in back by saying "sign in".');
  throw new UnauthorizedError();
});

const signIn = (conv, prefix) => {
  const signInPrefix = prefix ? `${prefix}\n` : '';
  return conv.ask(new SignIn(`${signInPrefix}To access your content`));
}

const welcome = (conv) => {
  const date = new Date().getHours()
  let greetings;
  if (date < 12) {
    greetings = 'Good morning';
  } else if (date < 18) {
    greetings = 'Good afternoon';
  } else {
    greetings = 'Good evening';
  }
  const firstName = getUserFirstName(conv);
  const userInfo = firstName ? ` ${firstName}` : '';
  return conv.ask(`${greetings}${userInfo}! What can I do for you today?`);
};

const getUserFirstName = (conv) => {
  const { user } = conv.data;
  return user && user.properties && user.properties.firstName;
};

// --------------------------------------------------------
// Nuxeo calls
// --------------------------------------------------------
const getUserDetails = (conv) => new Promise((resolve) => {
  request(`${serverURL}/api/v1/me?access_token=${conv.user.access.token}`,
    (error, _, body) => {
      if (error) {
        console.log(error);
      } else {
        try {
          const user = JSON.parse(body);
          // Save user data in conversation
          conv.data.user = {};
          Object.assign(conv.data.user, user);
        } catch (e) {
          console.log(e);
        }
      }
      resolve();
    }
  );
});

exports.dialogflowWebhook = functions.https.onRequest(app)
