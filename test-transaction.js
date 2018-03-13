"use strict";

const uuidv1 = require('uuid/v1');
const request = require("request-promise-native");

module.exports = function(transaction, options, util, req, res, next) {
    var transaction = {
        registration: {
            request: transaction,
            response: {
                VPSProtocol: '3.00',
                Status: 'OK',
                StatusDetail: '2014 : The Transaction was Registered Successfully.',
                VPSTxId: "{" + uuidv1() + "}",
                SecurityKey: '3XJFWUY8VY',
                NextURL: 'test://'
            }
        }
    };

    // Store the transaction as normal, but don't follow the NextURL.
    options.putTransaction(transaction).then(() => {
        // Send the notification and let that be processed as normal.
        var notification = {
            VPSProtocol: '3.00',
            TxType: 'PAYMENT',
            VendorTxCode: transaction.registration.request.VendorTxCode,
            Status: 'OK',
            StatusDetail: '0000 : The Authorisation was Successful.',
            TxAuthNo: '17445704',
            AVSCV2: 'SECURITY CODE MATCH ONLY',
            AddressResult: 'NOTMATCHED',
            PostCodeResult: 'NOTMATCHED',
            CV2Result: 'MATCHED',
            GiftAid: '0',
            '3DSecureStatus': 'OK',
            CAVV: 'AAABARR5kwAAAAAAAAAAAAAAAAA=',
            CardType: 'VISA',
            Last4Digits: '0006',
            DeclineCode: '00',
            ExpiryDate: '1019',
            BankAuthCode: '999777'
        };
        notification.VPSSignature = util.calculateNotificationSignature(
            transaction.registration.response.VPSTxId,
            transaction.registration.response.SecurityKey,
            notification
        );
        return request({
            url: transaction.registration.request.NotificationURL,
            method: "POST",
            form: notification
        });
    }).then((result) => {
        // This is the result from the notification URL, it contains the
        // completion URL.
        result = util.parseNotificationResponse(result);
        if (result.Status !== "OK") {
            throw new Error(
                "Error from notification URL: " +
                result.Status +
                " - " +
                result.StatusDetail);
        }
        console.log("Simulation - redirecting to: " + result.RedirectUrl);
        res.redirect(result.RedirectUrl);
    }).catch(next);
}