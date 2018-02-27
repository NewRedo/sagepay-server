# Sage Pay Form Server for Node.js

This module provides integration for Node.js applications wishing to utilise Sage Pay Server Integration.

## Overview

Knowledge of the [Server Integration](https://www.sagepay.co.uk/support/find-an-integration-document/server-integration-documents) is essential.

This module provides utility functions for correctly building the hidden form fields and for decoding the response `crypt` field. The user needs to provide the web server, rendering for the hidden fields and routing for the response.

## Running the Example

You need a fixed IP address and the use of port 80. There appears to be no other way to develop against Sage Pay.

To give the process access to low ports use the following command:

```
sudo setcap 'cap_net_bind_service=+ep' /usr/bin/nodejs
```

Then to start the server run:

```
npm install
node example
```

Then access your server using a web browser on port 80. You will be asked for configuration information and redirected to a page where you can enter a transaction registration request.

### Running the example in test mode

To run the example in test mode use the following command:
```
TEST_MODE=1 node example
```
In test mode, the module will bypass the Sage Pay API and return a successful transaction.

## Documentation

### SagepayServerExpress

```
require("sagepay-server").SagepayServerExpress;
```

Provides integration between Sage Pay and an Express JS server.

#### SagepayServerExpress.constructor

```
var foo = new SagepayServerExpress(options);
```

* `options` Required. Settings used by the server.
* `options.vendor` Required. The vendor name.
* `options.gatewayUrl` The gateway URL, defaults to the test gateway (https://test.sagepay.com/gateway/service/vspserver-register.vsp).
* `options.putTransaction` Required. See `SagepayServerExpress.putTransaction`.
* `options.getTransaction` Required. See `SagepayServerExpress.getTransaction`.
* `options.getCompletionUrl` Required. See `SagepayServerExpress.getCompletionUrl`.
* `options.testMode` Optional (default set to false). If true, will bypass the Sage Pay API.

#### SagepayServerExpress.putTransaction

Returns a `Promise` that resolves when `transaction` is saved.

```
function(transaction) { ... }
```

An implementation must be provided when the constructor is called.

* `transaction` Required. An object containing transaction information.
* `transaction.registration` Required. An object containing registration information.
* `transaction.registration.request` Required. The object that was passed to `SagepayServerExpress.register`.
* `transaction.registration.request.VendorTxCode` Required. A `string` that uniquely identifies this transaction. This should be used as the key in the underlyig storage system.
* `transaction.notification` An object containing notification information.
* `transaction.notification.request` An object containing data from the notification.
* `transaction.notification.response` An object containing data from the response that was returned for the notification.
In this context a `transaction` is an object as follows:

This function is only ever called for successful registration options. The status in the registration response will always be `OK`.

`notification` is only saved if the signature and notification are valid, so developers do not need to check the notification response status as it will always be `OK`.

#### SagepayServerExpress.getTransaction

Returns a `Promise` that resolves to the transaction saved by a call to `SagepayServerExpress.putTransaction`.

```
function(vendorTxCode) { ... }
```

If the transaction is not found the `code` property of the error must be set to `ESAGEPAYNOTFOUND` for proper processing to continue.

An implementation must be provided when the constructor is called.

#### SagepayServerExpress.getCompletionUrl

Returns a `Promise` that resolves to the `string` URL that the user should be redirected to following the transaction.

```
function(notification) { ... }
```

* `notification` an object containing values from the notification sent by Sage Pay.

#### SagepayServerExpress.register

Register a transaction and perform the direct.

```
foo.register(transaction, req, res, next);
```

* `transaction` Required. An object with properties and values as defined for transaction registration. See Sage Pay documenation.
* `req`, `res`, `next` Required. Values passed by `Express` to the handler that invoked this function.

### SagepayServerExpress.notification

Handle the notification HTTP request.

```
foo.notification(req, res, next);
```

* `req`, `res`, `next` Required. Values passed by `Express`.

## Licence

MIT
