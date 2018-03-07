"use strict";

const bodyParser = require("body-parser");
const express = require("express");
const extend = require("extend");
const path = require("path");
const SagepayServerExpress = require("..").SagepayServerExpress;
const uuid = require("uuid");
const yargs = require('yargs');

const app = express();

app.set("view engine", "pug");

const argv = yargs.options({
    vendor: {
        type: "string",
        demandOption: true
    }
}).argv;

var transactionStore = {};

var sagepay = new SagepayServerExpress({
    vendor: argv.vendor,
    gatewayUrl: argv.gatewayUrl,
    putTransaction: function(t) {
        // We are doing this synchronously but the function must return a
        // promise because this would normally be done with asynchronous IO.
        console.warn("Putting transaction:", t);
        transactionStore[t.registration.request.VendorTxCode] = extend(true, {}, t);
        return Promise.resolve();
    },
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
    getCompletionUrl: function(req, transaction) {
        var vendorTxCode = transaction.registration.request.VendorTxCode;
        if (transaction.notification.request.Status === "OK") {
            return Promise.resolve("http://" + req.hostname + "/ok?vendorTxCode=" + vendorTxCode);
        } else {
            return Promise.resolve("http://" + req.hostname + "/not-ok?vendorTxCode=" + vendorTxCode);
        }
    }
});

// In this example, the root URL lets you make a valid transaction. In a real
// application you would build the transaction information by based on the
// customer purchase and their address details.
app.all("/", function(req, res, next) {
    res.locals.title = "Register Transaction";

    // We've just got the required fields here with no validation whatsoever.
    req.body = {
        VendorTxCode: uuid(),
        Amount: "10.00",
        Currency: "GBP",
        Description: "Some stuff",
        NotificationURL: "http://" + req.hostname + "/notification",
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
        value: JSON.stringify(req.body, null, 4)
    }];

    next();
});
app.post("/", function(req, res, next) {
    // This is our form where the user confirms their order.
    var valid = parseForm(res.locals.form, req.body);
    if (!valid) return next();

    // Hand over to SagepayServerExpress class.
    sagepay.register(req.body, req, res, next);
});
app.all("/", function(req, res, next) {
    res.render(path.join(__dirname, "index"));
});

app.post("/notification", sagepay.notification.bind(sagepay));

app.get("/ok", function(req, res, next) {
    res.locals.transaction = transactionStore[req.query.vendorTxCode];
    res.locals.content = "<div class='alert alert-success'>Transction succeeded.</div>";
    res.render(path.join(__dirname, "index"));
});

app.get("/not-ok", function(req, res, next) {
    res.locals.transaction = transactionStore[req.query.vendorTxCode];
    res.locals.content = "<div class='alert alert-danger'>Transction failed.</div>";
    res.render(path.join(__dirname, "index"));
});

app.listen(80);

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
