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
} = require('actions-on-google');
const functions = require('firebase-functions');
const i18n = require('i18n');
const moment = require('moment');
const Nuxeo = require('nuxeo');

const config = require('./config.json');

// Dialogflow initialization
const app = dialogflow({
  debug: true,
  clientId: 'nuxeo-google-assistant',
});

// i18n initialization
i18n.configure({
  locales: ['en-US', 'fr-FR'],
  directory: `${__dirname}/locales`,
  defaultLocale: 'en-US',
});
app.middleware((conv) => {
  i18n.setLocale(conv.user.locale);
  moment.locale(conv.user.locale);
});

// Project configuration
const { serverURL } = config;

// --------------------------------------------------------
// Intents
// --------------------------------------------------------
const CONTEXT_SEARCH = 'context-search';

app.intent('Default Welcome Intent', async (conv) => {
  // Sign in if needed
  if (!isSignedIn(conv)) {
    signIn(conv, i18n.__('welome.signIn'));
    return;
  }
  // Get and store user information if needed
  if (!conv.data.user) {
    await getAndStoreUser(conv);
  }
  // Welcome user
  welcome(conv);
});

app.intent('Signed In', async (conv, _, signin) => {
  switch (signin.status) {
    // User successfully completed the account linking
    case 'OK': {
      // Access token might not be available on a Smart Display if the "Personal results" setting is disabled
      if (!isSignedIn(conv)) {
        smartDisplaySignInOrQuit(conv);
        break;
      }
      await getAndStoreUser(conv);
      const userDisplayName = getUserDisplayName(conv.data.user);
      const userInfo = userDisplayName
        ? `${i18n.__('signedIn.as')}${userDisplayName}`
        : '';
      conv.ask(i18n.__('signedIn.success', { userInfo }));
      conv.ask(i18n.__('signedIn.example'));
      conv.ask(new Suggestions([i18n.__('search'), i18n.__('signOut')]));
      break;
    }
    // Cancelled/dismissed account linking or Smart Display
    case 'CANCELLED': {
      const hasWebBrowser = conv.surface.capabilities.has(
        'actions.capability.WEB_BROWSER',
      );
      if (hasWebBrowser) {
        signInOrQuit(conv, i18n.__('signedIn.signInOrQuit'));
      } else {
        // On a Smart Display, if the "Personal results" setting is disabled, the sign in status is 'CANCELLED'
        // See https://github.com/actions-on-google/actions-on-google-nodejs/issues/231#issuecomment-470281010
        smartDisplaySignInOrQuit(conv);
      }
      break;
    }
    // System/network error or unknown status
    default:
      signIn(conv, i18n.__('signedIn.error'));
  }
});

app.intent('Sign Out', () => {
  throw new UnauthorizedError();
});

app.intent('Sign In', (conv) => {
  signIn(conv);
});

app.intent('Search', async (conv, params) => {
  if (!isSignedIn(conv)) {
    signInOrQuit(conv, i18n('search.requiresSignIn'));
    return;
  }
  // Reset tags
  setTagsContextParameter(conv, []);
  const { term } = params;
  await search(conv, term);
});

app.intent('Search - Refine by Tag', async (conv) => {
  let { term, tag, tags } = getSearchContextParameters(conv);
  // Keep track of tags
  if (!tags) {
    tags = [];
  }
  tags.push(tag);
  setTagsContextParameter(conv, tags);
  await search(conv, term, tags);
});

app.intent('Search - Select Document', async (conv, _, option) => {
  const nuxeo = getNuxeoClient(conv);
  try {
    const document = await fetchDocument(nuxeo, option);
    conv.ask(
      i18n.__('searchSelectDocument.select', {
        documentTitle: document.title,
      }),
    );
    conv.ask(new BasicCard(getDocumentCardProperties(nuxeo, document)));
    conv.ask(
      new Suggestions([i18n.__('searchSelectDocument.backToSearchResults')]),
    );
  } catch (e) {
    conv.ask(i18n.__('searchSelectDocument.error'));
    conv.ask(
      new Suggestions([i18n.__('searchSelectDocument.backToSearchResults')]),
    );
  }
});

app.intent(
  'Search - Select Document - Back to Search Results',
  async (conv) => {
    const { term, tags } = getSearchContextParameters(conv);
    await search(conv, term, tags);
  },
);

app.catch((conv, error) => {
  // Don't swallow UnauthorizedError as it is handled by the library to respond with a 401,
  // see the 'Sign Out' intent
  if (error instanceof UnauthorizedError) {
    throw error;
  }
  console.error(error);
  conv.ask(i18n.__('unexpectedError'));
});

// --------------------------------------------------------
// Intent helpers
// --------------------------------------------------------
const isSignedIn = (conv) => Boolean(conv.user.access.token);

const signIn = (conv, prefix) => {
  const signInPrefix = prefix ? `${prefix}\n` : '';
  conv.ask(new SignIn(`${signInPrefix}${i18n.__('signIn.introduction')}`));
};

const signInOrQuit = (conv, message) => {
  conv.ask(message);
  conv.ask(new Suggestions([i18n.__('signIn'), i18n.__('quit')]));
};

const smartDisplaySignInOrQuit = (conv) =>
  signInOrQuit(conv, i18n.__('smartDisplaySignInOrQuit'));

const welcome = (conv) => {
  const date = new Date().getHours();
  let greetings;
  if (date < 12) {
    greetings = i18n.__('welcome.goodMorning');
  } else if (date < 18) {
    greetings = i18n.__('welcome.goodAfternoon');
  } else {
    greetings = i18n.__('welcome.goodEvening');
  }
  const userDisplayName = getUserDisplayName(conv.data.user);
  const userInfo = userDisplayName ? ` ${userDisplayName}` : '';
  conv.ask(`${greetings}${userInfo}. ${i18n.__('welcome.introduction')}`);
  conv.ask(new Suggestions([i18n.__('search'), i18n.__('signOut')]));
};

const getSearchContextParameters = (conv) =>
  conv.contexts.get(CONTEXT_SEARCH).parameters;

const setTagsContextParameter = (conv, tags) => {
  conv.contexts.set(CONTEXT_SEARCH, 1, { tags });
};

const search = async (conv, term, tags) => {
  let tagInfo;
  if (tags && tags.length > 0) {
    const tagList = tags.join(` ${i18n.__('and')} `);
    tagInfo = ` ${i18n.__('search.tagged')} ${tagList}`;
  }
  const criterion = `${term}${tagInfo || ''}`;
  try {
    const nuxeo = getNuxeoClient(conv);
    const results = await searchDocuments(nuxeo, term, tags);
    const count = results.resultsCount;

    // No results
    if (count === 0) {
      conv.ask(i18n.__('search.noResultsFound', { criterion }));
      conv.ask(new Suggestions(i18n.__('tryAnotherSearch')));
      return;
    }
    // Single result
    if (count === 1) {
      conv.ask(i18n.__('search.oneResultFound', { criterion }));
      conv.ask(
        new BasicCard(getDocumentCardProperties(nuxeo, results.entries[0])),
      );
      conv.ask(new Suggestions(i18n.__('tryAnotherSearch')));
      return;
    }
    // Multiple results
    const items = {};
    results.entries.forEach((doc) => {
      items[doc.uid] = getDocumentListItemProperties(nuxeo, doc);
    });
    conv.ask(i18n.__('search.resultsFound', { count, criterion }));
    // Less than 10 items, use a Caoursel, else use a list (we may want to have pagination)
    if (count <= 10) {
      conv.ask(new Carousel({ items }));
      conv.ask(
        new Suggestions([i18n.__('refineByTag'), i18n.__('tryAnotherSearch')]),
      );
    } else {
      conv.ask(new List({ items }));
      conv.ask(
        new Suggestions([i18n.__('refineByTag'), i18n.__('tryAnotherSearch')]),
      );
    }
  } catch (e) {
    conv.ask(`An error occurred while searching for ${criterion}.`);
    conv.ask(
      new Suggestions([i18n.__('tryAgain'), i18n.__('tryAnotherSearch')]),
    );
  }
};

const getDocumentCardProperties = (nuxeo, doc) => {
  return {
    title: doc.title,
    subtitle: doc.properties['dc:description'],
    text:
      `🕘 ${i18n.__('search.lastModified')} ${formatDate(
        doc.lastModified,
      )}  \n` +
      `🕘 ${i18n.__('search.created')} ${formatDate(
        doc.properties['dc:created'],
      )} ${i18n.__('by')} ${getUserDisplayName(
        doc.properties['dc:creator'],
      )}  \n` +
      `👨‍ ${i18n.__('search.contributors')} ${doc.properties['dc:contributors']
        .map(getUserDisplayName)
        .join(', ')}  \n` +
      `🏳️ ${i18n.__('search.tags')} ${doc.contextParameters.tags}`,
    image: new Image({
      url: nuxeo.authenticateURL(doc.contextParameters.thumbnail.url),
      alt: doc.title,
    }),
  };
};

const getDocumentListItemProperties = (nuxeo, doc) => {
  return {
    title: doc.title,
    description: doc.properties['dc:description'],
    image: new Image({
      url: nuxeo.authenticateURL(doc.contextParameters.thumbnail.url),
      alt: doc.title,
    }),
  };
};

const formatDate = (date) => {
  return moment(date).format('LL');
};

// --------------------------------------------------------
// Nuxeo helpers
// --------------------------------------------------------
const DOCUMENT_ENRICHERS = [
  'thumbnail',
  'favorites',
  'documentURL',
  'pendingTasks',
  'runnableWorkflows',
  'runningWorkflows',
  'tags',
];

const getNuxeoClient = (conv) =>
  new Nuxeo({
    baseURL: serverURL,
    auth: {
      token: conv.user.access.token,
      method: 'bearerToken',
    },
    headers: {
      'translate.directoryEntry': 'label',
      'Accept-Language': conv.user.locale,
    },
    schemas: ['dublincore'],
    fetchProperties: {
      document: ['properties', 'versionLabel'],
    },
    enrichers: {
      document: DOCUMENT_ENRICHERS,
    },
  });

const getAndStoreUser = async (conv) => {
  try {
    const user = await getNuxeoClient(conv)
      .request('me')
      .get();
    // Save user data in conversation
    conv.data.user = {};
    Object.assign(conv.data.user, user);
  } catch (e) {
    // Consider that we can live without the user information
    console.error(e);
  }
};

const getUserDisplayName = (user) => {
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
};

const searchDocuments = async (nuxeo, term, tags) => {
  const query = getDocumentSearchQuery(tags ? tags.length : 0);
  const queryParams = [term];
  if (tags) {
    tags.forEach((tag) => {
      queryParams.push(tag);
    });
  }
  const queryOpts = {
    query,
    queryParams,
    pageSize: 10,
  };
  try {
    return await nuxeo.repository().query(queryOpts);
  } catch (e) {
    console.error(e);
    throw e;
  }
};

const getDocumentSearchQuery = (tagCount) => {
  let query = `SELECT * FROM Document
    WHERE ecm:fulltext = ?
    AND ecm:mixinType != 'HiddenInNavigation'
    AND ecm:isVersion = 0
    AND ecm:parentId IS NOT NULL
    AND ecm:isTrashed = 0`;
  for (let i = 0; i < tagCount; i++) {
    query += ' AND ecm:tag/* = ?';
  }
  return query;
};

const fetchDocument = async (nuxeo, id) => {
  try {
    return await nuxeo.repository().fetch(id);
  } catch (e) {
    console.error(e);
    throw e;
  }
};

exports.dialogflowWebhook = functions.https.onRequest(app);
