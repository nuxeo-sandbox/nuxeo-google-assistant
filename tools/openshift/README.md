# OpenShift Demo for the Nuxeo Google Assistant

The [demo](demo) folder contains some applications to be deployed to  the [int-google-assistant-demo](https://openshift.prod.nuxeo.io/console/project/int-google-assistant-demo/overview) project in OpenShift.

We will use the `oc` command line interface. Start by logging in:

    $ oc login https://openshift.prod.nuxeo.io --token=<TOKEN>

First, switch to the right project:

    $ oc project int-google-assistant-demo

Then, you need to create a `nuxeo-connect` secret from a `connect.properties` file containing the following properties:

    USERNAME=<CONNECT_USERNAME>
    PASSWORD=<CONNECT_TOKEN>
    STUDIO_PROJECT=<STUDIO_PROJECT>

by running:

    $ oc create secret generic nuxeo-connect --from-file=/path/to/connect.properties


To create from scratch everything needed to have a Google Assistant Demo up and running:

    $ oc create -f demo

The demo is then accessible at: https://google-assistant-demo.apps.prod.nuxeo.io/nuxeo/

If you ever need to recreate or replace only some part of the demo, you can specify which file to use.
For instance, you can change the Nuxeo version in the [nuxeo-deployment.yaml](demo/nuxeo-deployment.yaml) file and then ask OpenShift to replace the existing deployment with the new one:

    $ oc replace -f demo/nuxeo-deployment.yaml

If needed, you can also create a service/deployment/route/..., for instance:

    $ oc create -f demo/nuxeo-route.yaml
