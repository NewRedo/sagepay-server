"use strict";

const uuidv1 = require('uuid/v1');

module.exports = function(transaction, options, util, req, res, next) {
    var notification, updatedTransaction, formattedResponse, registerResponse;
    registerResponse = {
        registration: {
            request: transaction,
            response: {
                VPSProtocol: '3.00',
                Status: 'OK',
                StatusDetail: '2014 : The Transaction was Registered Successfully.',
                VPSTxId: uuidv1(),
                SecurityKey: '3XJFWUY8VY',
                NextURL: 'https://test.sagepay.com/gateway/service/cardselection?vpstxid={C00571FE-1323-7E2A-F077-4A43275A0EB8}'
            }
        }
    };

    options.putTransaction(registerResponse).then(() => {
            var data = {
                VPSProtocol: '3.00',
                TxType: 'PAYMENT',
                VendorTxCode: registerResponse.registration.request.VendorTxCode,
                VPSTxId: "{" + registerResponse.registration.response.VPSTxId + "}",
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
                VPSSignature: 'AEB63DD0F1EE09323EF54ABF3776CD67',
                DeclineCode: '00',
                ExpiryDate: '1019',
                BankAuthCode: '999777'
            };
            return data;
        }).then(
            (data) => {
                notification = data;
                return options.getTransaction(notification.VendorTxCode);
            }
        )
        .then(
            (data) => {
                updatedTransaction = data;
                data.notification = {
                    request: notification
                };
                return options.getCompletionUrl(
                    req,
                    data
                );
            }
        )
        .then(
            (redirectUrl) => {
                var response = {
                    Status: "OK",
                    RedirectUrl: redirectUrl
                };
                formattedResponse = util.formatNotificationResponse(response);
                updatedTransaction.notification.response = response;
                return options.putTransaction(updatedTransaction).then(() => {
                    return redirectUrl;
                });
            }
        ).then((redirectUrl) => {
            res.redirect(redirectUrl);
        })
        .catch(next);
}
