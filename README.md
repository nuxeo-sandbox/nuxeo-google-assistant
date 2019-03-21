# Nuxeo Action for the Google Assistant

This project is an attempt to create a voice and text-based conversational interface to find assets and perform actions in a Nuxeo content services platform with the Google Assistant. It can be used on all the surfaces where the Google Assistant is available, such as smart speakers, smart displays, the Android Assistant and the Google Assistant iOS app. Yet, the account linking step with OAuth 2 requires a browser.

The name chosen for this action is **Nuxeo Content**.

To invoke this action through the Assistant, users can say "OK Google, Talk to Nuxeo Content" or type "Talk to Nuxeo Content".

When released, this action will be publicly displayed in the [Google Assistant Actions directory](https://assistant.google.com/explore).

## Project Structure

The project relies on 3 main components:

The [Nuxeo Google Assistant](https://console.actions.google.com/u/0/project/nuxeo-1b48c/overview) project in the [Actions on Google](https://developers.google.com/actions/extending-the-assistant) platform.

The [nuxeo-google-assistant](https://console.dialogflow.com/api-client/#/editAgent/1bc3237a-6069-4d1c-9095-34ff106f5f61/) [Dialogflow](https://dialogflow.com/docs/getting-started) agent.

A [function](https://console.firebase.google.com/u/0/project/nuxeo-1b48c/functions/list) in [Google Cloud Functions for Firebase](https://firebase.google.com/docs/functions/).

## Nuxeo Server Configuration

The server configured by default is the [Nuxeo Demo for the Google Assistant](https://google-assistant-demo.apps.prod.nuxeo.io/nuxeo/).

To configure the Nuxeo server, you need to:
- Update the `serverURL` property in the [config.json](functions/config.json) file.
- Update the [Account linking](https://console.actions.google.com/u/0/project/nuxeo-1b48c/accountlinking/) settings with:
    - A client secret.
    - The Authorization URL: `${serverURL}/oauth2/authorize`.
    - The Token URL: `${serverURL}/oauth2/token`.
- Registrate an OAuth 2 client on the Nuxeo server by following this [documentation](https://doc.nuxeo.com/nxdoc/using-oauth2/#client-registration) with these parameters:
    - Name: `Nuxeo Google Assistant`.
    - Client Id: `nuxeo-google-assistant`.
    - Client Secret: the same as for the account linking.
    - Redirect URIs: `https://oauth-redirect.googleusercontent.com/r/nuxeo-1b48c`.

## Setup

Once you have Node.js and npm installed, install the Firebase CLI via npm:

```
npm install -g firebase-tools
```

For more details, read [Set up Node.js and the Firebase CLI](https://firebase.google.com/docs/functions/get-started#set-up-nodejs-and-the-firebase-cli).

## Development Process

### Update the Dialogflow Agent

Directly edit the [nuxeo-google-assistant](https://console.dialogflow.com/api-client/#/editAgent/1bc3237a-6069-4d1c-9095-34ff106f5f61/) agent.

You can create a version in the Environments tab of the project's settings.
Click on PUBLISH A VERSION then select "Create version without publishing".

The Dialogflow agent version matching the current git revision is described in the [dialogflowVersion](dialogflowVersion) file.

### Update the Function Used as Dialogflow Fulfillment Webhook

Install the dependencies.

```
yarn --cwd functions --ignore-engines
```

Update the `app` object in [index.js](functions/index.js).

### Deploy the Function to Firebase

Log in via the browser and authenticate the firebase tool.

```
firebase login
```

Deploy the function:

```
firebase deploy --only functions
```

For more details, read this [section](https://firebase.google.com/docs/functions/get-started#deploy-and-execute-addmessage) in the Firebase Functions documentation and [how to deploy the Dialogflow fulfillment](https://developers.google.com/actions/dialogflow/deploy-fulfillment).

### Test

In Dialogflow, cick on **See how it works in Google Assistant.** This will open the Simulator in Actions on Google.

You can also test on your device if it is logged into the same Google account you're using in the Actions console by saying `Talk to Nuxeo Content` to the Google Assistant.

### Debug

The Firebase function logs can be monitored [here](https://console.firebase.google.com/u/0/project/nuxeo-1b48c/functions/logs?severity=DEBUG).
