"use strict";

const assert = require("assert");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const extend = require("extend");
const querystring = require("querystring");
const request = require("request-promise-native");

const defaultOptions = {
    gatewayUrl: "https://test.sagepay.com/gateway/service/vspserver-register.vsp"
};

const parser = bodyParser.urlencoded();

// Alternative interface without express integrtion
class SagepayServerUtil {
    /*
    SagepayServerUtil(options)
    @options Optional. Contains connetion options.
    @options.gatewayUrl
        Optional. The URL of the payment gateway, defaults to the Sage Pay
        test system.
    */
    constructor(options) {
        options = extend({}, defaultOptions, options);
        this._options = options;
    }

    register(transaction) {
        var form = extend({
            VPSProtocol: "3.00",
            Vendor: this._options.vendor,
            TxType: "PAYMENT"
        }, transaction);
        return request({
            uri: this._options.gatewayUrl,
            method: "POST",
            form: form
        }).then(data => {
            var resultBuffer = {};
            data.split("\r\n").map(a => a.split("=")).forEach(a => {
                resultBuffer[a[0]] = a[1];
            });

            // Sage Pay provides a value called NextURL, but it is not
            // complete. This fact is not documented by Sage Pay. To save
            // implementers the hassle, we fix it here.
            resultBuffer.NextURL = [
                resultBuffer.NextURL,
                "=",
                resultBuffer.VPSTxId
            ].join("");

            return resultBuffer;
        });
    }

    parseNotification(stream) {
        return new Promise(function(accept, reject) {
            parser(stream, {}, function(err) {
                if (err)
                    reject(err);
                else
                    accept(stream.body);
            });
        });
    }

    calculateNotificationSignature(vpsTxId, securityKey, notification) {
        var message = [
            vpsTxId,
            notification.VendorTxCode,
            notification.Status,
            notification.TxAuthNo,
            this._options.vendor,
            notification.AVSCV2,
            securityKey,
            notification.AddressResult,
            notification.PostCodeResult,
            notification.CV2Result,
            notification.GiftAid,
            notification["3DSecureStatus"],
            notification.CAVV,
            notification.AddressStatus,
            notification.PayerStatus,
            notification.CardType,
            notification.Last4Digits,
            notification.DeclineCode,
            notification.ExpiryDate,
            notification.FraudResponse,
            notification.BankAuthCode
        ].join("");
        var hash = crypto.createHash("md5");
        hash.update(message, "utf8");
        var expectedSignature = hash.digest("hex").toUpperCase();
        return expectedSignature;
    }

    validateNotificationSignature(vpsTxId, securityKey, notification) {
        var expectedSignature = this.calculateNotificationSignature(
            vpsTxId,
            securityKey,
            notification
        );
        var actualSignature = notification.VPSSignature;
        return actualSignature === expectedSignature;
    }

    formatNotificationResponse(response) {
        return Object.keys(response)
            .map(key => [key, response[key]])
            .map(pair => pair.join("="))
            .join("\r\n");
    }

    // This is used for testing purposes only, normally Sage Pay will parse
    // the notification response.
    parseNotificationResponse(response) {
        var ret = {};
        response
            .split("\r\n")
            .forEach(line => {
                var splitIndex = line.indexOf("=");
                var key = line.substr(0, splitIndex);
                var value = line.substr(splitIndex + 1);
                ret[key] = value;
            });
        return ret;
    }
}

module.exports = SagepayServerUtil;