'use strict';

const {
  BasicCard,
  Carousel,
  dialogflow,
  Image,
  List,
  SignIn,
  Suggestions,
  UnauthorizedError,
} = require('actions-on-google')
const functions = require('firebase-functions');
const Nuxeo = require('nuxeo');

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
const CONTEXT_SEARCH = 'context-search';

app.intent('Default Welcome Intent', (conv) => {
  // Sign in if needed
  if (!conv.user.access.token) {
    return signIn(conv, 'Welcome to your Nuxeo assistant!\nYou can search and share any content from your Nuxeo instance.');
  }

  // Get and store user information if needed, then welcome user
  if (!conv.data.user) {
    return getAndStoreUser(conv).then(() => welcome(conv));
  }

  // Welcome user
  return welcome(conv);
});

app.intent('Signed In', (conv, _, signin) => {
  switch (signin.status) {
    // User successfully completed the account linking
    case 'OK':
      return getAndStoreUser(conv)
        .then(() => {
          const userDisplayName = getUserDisplayName(conv);
          const userInfo = userDisplayName ? ` as ${userDisplayName}` : '';
          conv.ask(`You successfully signed in${userInfo}.`);
          conv.ask('For example, you can say "Search for jackets".');
          return conv.ask(new Suggestions(['Search', 'Sign out']));
        });
    // Cancelled or dismissed account linking
    case 'CANCELLED':
      conv.ask('What would you like to do?');
      // Currently, when the signin.status is 'CANCELLED', trying to sign in again results in "Sorry, I did not get any response."
      // See https://github.com/actions-on-google/actions-on-google-nodejs/issues/231#issuecomment-470281010
      // return conv.ask(new Suggestions(['Sign in', 'Quit']));
      return conv.ask(new Suggestions(['Quit']));
    // System/network error or unknown status
    default:
      return signIn(conv, 'Something went wrong during the sign in process.');
  }
});

app.intent('Sign Out', () => {
  throw new UnauthorizedError();
});

app.intent('Sign In', (conv) => {
  return signIn(conv);
});

app.intent('Search', (conv, params) => {
  return search(conv, params);
});

app.intent('Search - Refine by Tag - Get Results', (conv, params) => {
  return search(conv, params);
});

app.intent('Search - Select Document', (conv, _, option) => {
  // TODO handle promise rejection
  return getDocument(option, conv).then((doc) => {
    conv.ask(`OK, let’s have a closer look at ${doc.title}`);
    conv.ask(new BasicCard({
      title: doc.title,
      subtitle: doc.properties['dc:description'],
      text: `👨‍ Contributors: ${doc.properties["dc:contributors"].join(', $')}  \n`
        + `🕘 Last modified: ${doc.lastModified.replace('T', ' ').replace('/..+/', '').replace('Z', '')}  \n`
        + `🕘 Created: ${doc.properties["dc:created"]} by ${doc.properties["dc:creator"]}  \n`
        + `🏳️ Tags: ${doc.contextParameters.tags}`,
      image: new Image({
        url: `${doc.contextParameters.thumbnail.url}?access_token=${conv.user.access.token}`,
        alt: doc.title,
      }),
    }));
    conv.ask(new Suggestions(['Back to search results']));
    return;
  });
});

app.intent('Search - Select Document - Back to Search Results', (conv, params) => {
  return search(conv, params);
});

// --------------------------------------------------------
// Intent Helpers
// --------------------------------------------------------
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
  const firstname = getUserDisplayName(conv);
  const userInfo = firstname ? ` ${firstname}` : '';
  conv.ask(`${greetings}${userInfo}! What can I do for you today?`);
  return conv.ask(new Suggestions(['Search', 'Sign out']));
};

const search = (conv, params) => {
  let { term, tag, reset } = conv.contexts.get(CONTEXT_SEARCH).parameters;
  // TODO: find a better way to fully/partially reset the context
  if (reset) {
    tag = null;
    conv.contexts.set(CONTEXT_SEARCH, 1 , {
      term,
      tag,
    });
  }
  const tagInfo = tag ? ` tagged "${tag}"` : '';
  // TODO handle promise rejection
  return searchDocuments(term, tag, conv).then((value) => {
    const count = value.resultsCount;
    // No results
    if (count === 0) {
      conv.ask(`Uh oh, I didn't find any document when searching for "${term}"${tagInfo}!`);
      conv.ask(new Suggestions('Try another search'));
      return;
    }
    // Handle single result
    // Build result items
    const items = {};
    value.entries.forEach((doc) => {
      items[doc.uid] = {
        title: doc.title,
        description: doc.properties['dc:description'],
        image: new Image({
          url: `${doc.contextParameters.thumbnail.url}?access_token=${conv.user.access.token}`,
          alt: doc.title,
        }),
      };
    });
    conv.ask(`I found ${count} documents when searching for "${term}"${tagInfo}:`);
    // Less than 10 items, use a Caoursel, else use a list (we may want to have pagination)
    if (count <= 10) {
      conv.ask(new Carousel({ items }));
      conv.ask(new Suggestions([tag ? 'Try another tag' : 'Refine by tag', 'Try another search']));
    } else {
      conv.ask(new List({ items }));
      conv.ask(new Suggestions([tag ? 'Try another tag' : 'Refine by tag', 'Try another search']));
    }
    return;
  });
};

// --------------------------------------------------------
// Nuxeo
// --------------------------------------------------------
const DOCUMENT_ENRICHERS  = [
  'thumbnail',
  'favorites',
  'documentURL',
  'pendingTasks',
  'runnableWorkflows',
  'runningWorkflows',
  'tags',
];

const getNuxeoClient = (conv) => new Nuxeo({
  baseURL: serverURL,
  auth: {
    token: conv.user.access.token,
    method:'bearerToken',
  },
  headers: { 'translate.directoryEntry': 'label', 'Accept-Language': conv.user.locale },
  schemas: ['*'],
  fetchProperties: {
    document: ['properties', 'versionLabel'],
  },
  enrichers: {
    document: DOCUMENT_ENRICHERS,
  },
});

const getAndStoreUser = (conv) => {
  return getNuxeoClient(conv).request('me').get().then((user) => {
    // Save user data in conversation
    conv.data.user = {};
    Object.assign(conv.data.user, user);
    return
  }).catch((e) => {
    console.log(e);
  });
};

const getUserDisplayName = (conv) => {
  const { user } = conv.data;
  if (!user) {
    return null;
  }
  const id = user.id;
  if (!user.properties) {
    // system user has no properties
    return id;
  }
  const firstname = user.properties.firstName;
  const lastname = user.properties.lastName;
  if (!firstname) {
    if (!lastname) {
      return id;
    }
    return lastname;
  }
  if (!lastname) {
    return firstname;
  }
  return `${firstname} ${lastname}`;
}

const getDocumentSearchQuery = (includeTag) => {
  let query = `SELECT * FROM Document
    WHERE /*+ES: INDEX(all_field) OPERATOR(match_phrase_prefix) */ ecm:fulltext = ?
    AND ecm:mixinType != 'HiddenInNavigation'
    AND ecm:isVersion = 0
    AND ecm:parentId IS NOT NULL
    AND ecm:isTrashed = 0`;
  if (includeTag) {
    query += ' AND ecm:tag = ?';
  }
  return query;
};
const searchDocuments = (term, tag, conv) => {
  const queryParams = [`${term}*`];
  if (tag) {
    queryParams.push(tag);
  }
  const queryOpts = {
    query: getDocumentSearchQuery(Boolean(tag)),
    queryParams,
    pageSize: 10,
  };
  return getNuxeoClient(conv).repository().query(queryOpts).then((res) => res)
    .catch((e) => {
      console.log(e);
      throw e;
    });
};

const getDocument = (id, conv) => getNuxeoClient(conv).repository().fetch(id).then((res) => res)
  .catch((e) => {
    console.log(e);
    throw e;
  });

exports.dialogflowWebhook = functions.https.onRequest(app);
