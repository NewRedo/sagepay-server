"use strict";

const bodyParser = require("body-parser");
const express = require("express");
const extend = require("extend");
const path = require("path");
const SagepayServerExpress = require("..").SagepayServerExpress;
const url = require("url");
const uuid = require("uuid");
const yargs = require('yargs');

const app = express();

app.set("view engine", "pug");

const argv = yargs.options({
    vendor: {
        type: "string",
        demandOption: true
    },
    port: {
        type: "number",
        demandOption: true
    },
    gatewayUrl: {
        type: "string",
        demandOption: true
    }
}).argv;

var transactionStore = {};

// We create an instance of SagepayServerExpress.
var sagepay = new SagepayServerExpress({
    // This is the Vendor provided to you by Sage Pay, use "test://" for the
    // test mode.
    vendor: argv.vendor,

    // This is the gateway URL provided by Sage Pay. It is usually either their
    // test or live system URLs.
    gatewayUrl: argv.gatewayUrl,

    // We must provide a function that will save transaction information and
    // return a Promise that resolves when that process is complete. This is
    // called when the transaction registration is successful, and when a
    // valid notification is received and found to be valid.
    putTransaction: function(t) {
        // We are doing this synchronously but the function must return a
        // promise because this would normally be done with asynchronous IO.
        console.warn("Putting transaction:", t);
        transactionStore[t.registration.request.VendorTxCode] = extend(true, {}, t);
        return Promise.resolve();
    },

    // We must provide a function that will get transaction information using
    // the VendorTxCode and returns a Promise that resolves to the transaction
    // object that was saved in the call to `putTransaction`. This is called
    // when a notification is received.
    getTransaction: function(vendorTxCode) {
        // We are doing this synchronously but the function must return a
        // promise because this would normally be done with asynchronous IO.
        if (transactionStore[vendorTxCode]) {
            console.warn("Getting transaction:", vendorTxCode);
            return Promise.resolve(extend(true, {}, transactionStore[vendorTxCode]));
        } else {
            console.warn("Transaction not found:", vendorTxCode);
            var err = new Error("Not found");

            // It is essential that this status is added to the error so that
            // sage-pay gets the right response.
            err.code = "ESAGEPAYNOTFOUND";

            return Promise.reject(err);
        }
    },

    // This is called when a notification is received and found to be valid.
    // It must return a promise that resolves to the URL that the user should
    // be redirected to. We should include the transaction code on the URL so
    // that we can look up the information for display without our page.
    getCompletionUrl: function(req, transaction) {
        var vendorTxCode = transaction.registration.request.VendorTxCode;
        if (transaction.notification.request.Status === "OK") {
            return Promise.resolve("http://" + req.get("host") + "/ok?vendorTxCode=" + vendorTxCode);
        } else {
            return Promise.resolve("http://" + req.get("host") + "/not-ok?vendorTxCode=" + vendorTxCode);
        }
    }
});

// In this example, the root URL lets you make a valid transaction. In a real
// application you would build the transaction information by based on the
// customer purchase and their address details.
app.all("/", function(req, res, next) {
    res.locals.title = "Register Transaction";

    // Build the notification URL.
    var notificationUrl = url.parse(req.originalUrl);
    notificationUrl.hostname = req.hostname;
    notificationUrl.protocol = "http";
    notificationUrl.host = req.get("host");
    notificationUrl.pathname = path.join(
        notificationUrl.pathname,
        "notification"
    );
    notificationUrl = url.format(notificationUrl);

    // We've just got the required fields here with no validation whatsoever.
    const testTransaction = {
        VendorTxCode: uuid(),
        Amount: "10.00",
        Currency: "GBP",
        Description: "Some stuff",
        NotificationURL: notificationUrl,
        BillingSurname: "Smith",
        BillingFirstnames: "John",
        BillingAddress1: "1 Portland Place",
        BillingCity: "London",
        BillingPostCode: "W1A 1AA",
        BillingCountry: "GB",
        DeliverySurname: "Smith",
        DeliveryFirstnames: "John",
        DeliveryAddress1: "1 Portland Place",
        DeliveryCity: "London",
        DeliveryPostCode: "W1A 1AA",
        DeliveryCountry: "GB"
    };

    res.locals.form = [{
        name: "transaction",
        type: "textarea",
        required: true,
        rows: 25,
        value: JSON.stringify(testTransaction, null, 4)
    }];

    next();
});

app.post("/", bodyParser.urlencoded());
app.post("/", function(req, res, next) {
    // This is our form where the user confirms their order.
    var valid = parseForm(res.locals.form, req.body);
    if (!valid) return next();

    var transaction;
    try {
        transaction = JSON.parse(req.body.transaction);
    } catch (err) {
        res.locals.form[0].error = "pattern";
        return next();
    }

    // Hand over to SagepayServerExpress class. The user will be redirected to
    // the URL that Sage Pay provides.
    sagepay.register(transaction, req, res, next);
});
app.all("/", function(req, res, next) {
    // This renders the form, it gets called on the GET or an invalid POST.
    res.render(path.join(__dirname, "index"));
});

// The notification must be routed through to the notification function
// without any other processing. Common mistakes are having existing body
// parsing middleware in the way, which prevents SagepayServerExpress from
// parsing the body according to Sage Pay rules.
app.post("/notification", sagepay.notification.bind(sagepay));

// This is our OK landing page for when a transaction is successful.
app.get("/ok", function(req, res, next) {
    res.locals.transaction = transactionStore[req.query.vendorTxCode];
    res.locals.content = "<div class='alert alert-success'>Transction succeeded.</div>";
    res.render(path.join(__dirname, "index"));
});

// This is our NOT OK landing page for when the transaction is not successful.
// You don't need a different route for this, you would normally provide the
// transaction code in the URL so you can look up the status.
app.get("/not-ok", function(req, res, next) {
    res.locals.transaction = transactionStore[req.query.vendorTxCode];
    res.locals.content = "<div class='alert alert-danger'>Transction failed.</div>";
    res.render(path.join(__dirname, "index"));
});

app.listen(argv.port);

// This is just used for the user input.
function parseForm(fields, body) {
    for (var key in body) {
        var field = fields.find(field => field.name === key);
        if (field) {
            var value = body[key];
            if (value !== null && value.length)
                field.value = value;
        }
    }
    fields.forEach(field => {
        if (field.required && field.value == null) field.error = "required";
    });
    return !fields.some(field => field.error);
}