# Nuxeo extension for the Google Assistant

This project is an attempt to create a voice and text-based conversational interface to find assets and perform actions in a Nuxeo content services platform with the Google Assistant. It can be used on all the surfaces where the Google Assistant is available, such as smart speakers, smart displays, the Android Assistant and the Google Assistant iOS app.

The name chosen for this extension is **Enterprise Content**.

To begin interacting with it, users can say "OK Google, Talk to Enterprise Content" or type "Talk to Enterprise Content".

When released, this extension will be publicly displayed in the [Google Assistant Actions directory](https://assistant.google.com/explore).

## Project Structure

The project relies on 3 main components:

The [Nuxeo](https://console.actions.google.com/u/0/project/nuxeo-1b48c/overview) project in the [Actions on Google](https://developers.google.com/actions/extending-the-assistant) platform.

The [nuxeo-google-assistant](https://console.dialogflow.com/api-client/#/editAgent/1bc3237a-6069-4d1c-9095-34ff106f5f61/) [Dialogflow](https://dialogflow.com/docs/getting-started) agent.

A [function](https://console.firebase.google.com/u/0/project/nuxeo-1b48c/functions/list) in [Google Cloud Functions for Firebase](https://firebase.google.com/docs/functions/).

## Setup

Once you have Node.js and npm installed, install the Firebase CLI via npm:

```
npm install -g firebase-tools
```

For more details, read [Set up Node.js and the Firebase CLI](https://firebase.google.com/docs/functions/get-started#set-up-nodejs-and-the-firebase-cli).

## Development Process

### Update the Dialogflow Agent

Directly edit the [nuxeo-google-assistant](https://console.dialogflow.com/api-client/#/editAgent/1bc3237a-6069-4d1c-9095-34ff106f5f61/) agent.

### Update the Function Used as Dialogflow Fulfillment Webhook

Install the dependencies.

```
yarn --cwd functions
```

Update the `dialogflowWebhook` function in [index.js](functions/index.js).

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

You can also test on your device if it is logged into the same Google account you're using in the Actions console by saying `Talk to enterprise content` to the Google Assistant.
