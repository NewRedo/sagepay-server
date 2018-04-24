"use strict";

const assert = require("assert");
const extend = require("extend");
const SagepayServerUtil = require("./sagepay-server-util");
const testTransaction = require("./test-transaction");

// Alternative interface for express
class SagepayServerExpress {
    /*
    SagepayServerIntegration(options)
    @options Required. Contains connetion options.
    @options.vendor
        Required. The vendor name provided by Sage Pay.
    @options.gatewayUrl
        Required. The URL to the Sage Pay server gateway.
        Use "test://" for the internal test server.
    @options.putTransaction
        Required. See SagepayServerExpress.putTransaction.
    @options.getTransaction
        Required. See SagepayServerExpress.getTransaction.
    @options.getCompletionUrl
        Required. See SagepayServerExpress.getCompletionurl.
    */
    constructor(options) {
        assert(options, "options is required");
        assert(typeof options.putTransaction === "function", "options.saveTransaction is required");
        assert(typeof options.getTransaction === "function", "options.getTransaction is required");
        assert(typeof options.getCompletionUrl === "function", "options.getCompletionUrl is required");
        options = extend({}, options); // Copy to prevent tampering.
        this._options = options;
        this._util = new SagepayServerUtil(options);
    }

    /*
    register(object, object, object, function)

    Completes the Express handling for registering a transaction with Sage Pay.
    If successful the `saveTransaction` function will be called, otherwise the
    error is allowed to propogate through to the Express error handler.
    */
    register(transaction, req, res, next) {
        assert(transaction);

        const validStatusValues = ["OK", "OK REPEATED"];
        var registerResponse;
        if (this._options.gatewayUrl === "test://") {
            testTransaction(transaction, this._options, this._util, req, res, next);
        } else {
            this._util.register(transaction).then(
                (data) => {
                    if (validStatusValues.indexOf(data.Status) < 0) {
                        throw new Error(data.StatusDetail);
                    }
                    registerResponse = data;
                    return;
                }
            ).then(
                () => {
                    return this._options.putTransaction({
                        registration: {
                            request: transaction,
                            response: registerResponse
                        }
                    });
                }
            ).then(
                () => {
                    res.redirect(registerResponse.NextURL);
                }
            ).catch(next);
        }

    }

    /*
    Handles the notification request from Sage Pay.

    If the request parses OK the transaction is requested using `getTransaction`
    and the notification information is saved using `putTransaction`. The
    response to Sage Pay is sent after this and the transaction is always
    aborted if an error occurs.
    */
    notification(req, res, next) {
        var notification, transaction, formattedResponse;
        this._util.parseNotification(req)
            .then(
                (data) => {
                    notification = data;
                    return this._options.getTransaction(notification.VendorTxCode);
                }
            )
            .then(
                (data) => {
                    transaction = data;
                    var signatureValid = this._util.validateNotificationSignature(
                        transaction.registration.response.VPSTxId,
                        transaction.registration.response.SecurityKey,
                        notification
                    );
                    if (!signatureValid) {
                        var err = Error("Signature is not valid.");
                        err.code = "ESAGEPAYINVALID";
                        throw err;
                    }
                    transaction.notification = {
                        request: notification
                    };
                    return this._options.getCompletionUrl(
                        req,
                        transaction
                    );
                }
            )
            .then(
                (redirectUrl) => {
                    var response = {
                        Status: "OK",
                        RedirectUrl: redirectUrl
                    };
                    formattedResponse = this._util.formatNotificationResponse(response);
                    transaction.notification.response = response;
                    return this._options.putTransaction(transaction);
                }
            ).then(() => {
                res.send(formattedResponse).end();
            })
            .catch(err => {
                var response = {},
                    status;
                switch (err.code) {
                    case "ESAGEPAYNOTFOUND":
                        response.Status = "ERROR";
                        status = 200; // Sage Pay requires this
                        break;
                    case "ESAGEPAYINVALID":
                        response.Status = "INVALID";
                        status = 200; // Sage Pay requires this
                        break;
                    default:
                        status = 500;
                        break;
                }
                if (err.redirectUrl) {
                    response.RedirectURL = err.redirectUrl;
                }
                response.StatusDetail = err.toString();
                response = this._util.formatNotificationResponse(response);
                if (status === 200) {
                    console.warn("Sagepay notification error:", response);
                    res.status(status).send(response).end();
                } else {
                    next(err);
                }
            })
            .catch(next); // This runs if the error handler throws an error.
    }
}

module.exports = SagepayServerExpress;