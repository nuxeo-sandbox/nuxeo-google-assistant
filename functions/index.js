'use strict';

const { dialogflow } = require('actions-on-google')

const functions = require('firebase-functions');

const app = dialogflow({ debug: true })

app.intent('eval', (conv, params) => {
  const expression = params['any'];
  conv.ask(`${expression} = ${eval(expression)}`)
})

exports.dialogflowWebhook = functions.https.onRequest(app)
