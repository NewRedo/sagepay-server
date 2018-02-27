"use strict";

const bodyParser = require("body-parser");
const express = require("express");
const extend = require("extend");
const path = require("path");
const SagepayServerExpress = require("..").SagepayServerExpress;
const uuid = require("uuid");
const nconf = require('nconf');

const app = express();

app.set("view engine", "pug");

nconf.env({
    transform: function(obj) {
        if (obj.key === 'TEST_MODE' && obj.value === '1') {
            obj.value = true;
        } else {
            obj.value = false;
        }
        return obj;
    }
});

var sagepay = null;
var transactionStore = {};

app.use(function(req, res, next) {
    req.app.locals.hostname = req.hostname;
    next();
});

// This is the configuration page, it is the only page accesible before you
// configure the system so we register the handlers first.
app.all("/configure", function(req, res, next) {
    res.locals.title = "Configure";
    res.locals.form = [{
            name: "vendor",
            label: "options.vendor",
            required: true
        },
        {
            name: "gatewayUrl",
            label: "options.gatewayUrl",
            placeholder: "Leave blank for test system"
        }
    ];
    next();
});
app.post("/configure", bodyParser.urlencoded());
app.post("/configure", function(req, res, next) {
    var valid = parseForm(res.locals.form, req.body);
    if (!valid) return next();
    if (!req.body.gatewayUrl) delete req.body.gatewayUrl;
    sagepay = new SagepayServerExpress({
        testMode: nconf.get('TEST_MODE'),
        vendor: req.body.vendor,
        gatewayUrl: req.body.gatewayUrl,
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
        getCompletionUrl: function(result) {
            var vendorTxCode = result.VendorTxCode;
            if (result.Status === "OK") {
                return Promise.resolve("http://" + app.locals.hostname + "/ok?vendorTxCode=" + vendorTxCode);
            } else {
                return Promise.resolve("http://" + app.locals.hostname + "/not-ok?vendorTxCode=" + vendorTxCode);
            }
        }
    });
    res.redirect("/");
});
app.all("/configure", function(req, res, next) {
    res.render(path.join(__dirname, "index"));
});

// The rest of the site requires the configuration to have been done, so
// redirect if we haven't done that.
app.use(function(req, res, next) {
    if (sagepay == null) {
        res.redirect("/configure");
    } else {
        next();
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

app.post("/notification", function(req, res, next) {
    // Hand over to SagepayServerExpress class.
    sagepay.notification(req, res, next);
});

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
