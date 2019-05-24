"use strict"

const express = require('express');
const ejs = require('ejs');
const paypal = require('paypal-rest-sdk');
const qrcode = require('qrcode-terminal');
const crypto = require('crypto');

paypal.configure({
  'mode': 'sandbox', //sandbox or live
  'client_id': '',
  'client_secret': ''
});

const app = express();

app.set('view engine', 'ejs');

app.get('/', (req, res) => res.render('index'));

var transactions = new Map();

app.get('/success', (req, res) =>
{
    const payerId = req.query.PayerID;
    const paymentId = req.query.paymentId;
    const execute_payment_json = {
        "payer_id": payerId,
        "transactions": [{
            "amount": {
                "currency": "EUR",
                "total": transactions.get( req.query.token ).total
            }
        }]
    };

    paypal.payment.execute(paymentId, execute_payment_json, function (error, payment)
    {
        if (error)
        {
            console.log(error.response);
            throw error;
        } else {
            //console.log(JSON.stringify(payment));
            res.send('Success');
            // resolve payment
            transactions.get( req.query.token ).resolve( req.query.token );
        }
    });
});

app.get('/cancel', (req, res) =>
{
    console.log( req.query );
    res.send('Cancelled')
} );

async function qrInvoice( _amount, _user, _url )
{
    return new Promise( function( _resolve, _reject )
    {
        const create_payment_json = {
            "intent": "sale",
            "payer": {
                "payment_method": "paypal"
            },
            "redirect_urls": {
                "return_url": _url+ "success",
                "cancel_url": _url+ "cancel"
            },
            "transactions": [{
                "item_list": {
                    "items": [{
                        "name": "ACKbar payment",
                        "sku": _user,
                        "price": _amount,
                        "currency": "EUR",
                        "quantity": 1
                    }]
                },
                "amount": {
                    "currency": "EUR",
                    "total": _amount
                },
                "description": "payment from " + _user
            }]
        };

        paypal.payment.create(create_payment_json, function (error, payment)
        {
            if (error)
            {
                console.log( error.response.details );
                throw error;
            }
            else
            {
                for(let i = 0;i < payment.links.length;i++)
                {
                    if ( payment.links[i].rel === 'approval_url' )
                    {
                        var href = payment.links[i].href;
                        var token = href.match( /(?:\?|&)token=([^\?|&]+)/ );

                        var resolve;
                        var promise = new Promise( function( _resolve, _reject )
                        {
                            resolve = _resolve;
                        } );

                        transactions.set( token[1],
                        {
                            total: _amount,
                            promise: promise,
                            resolve: resolve
                        } );

                        // TODO: store @token: value, timestamp?

                        qrcode.generate( payment.links[i].href, { small: true }, function( qr )
                        {
                            qr = qr.split( "\n" ).map( qrline =>
                            {
                                return (" ".repeat( ( process.stdout.columns - qrline.length ) / 2 ) + "\u001b[40m\u001b[37m" + qrline + "\u001b[0m\n");
                            } );
                            _resolve( { qr: qr, hash: token[1] } );
                        } );
                    }
                }
            }
        });
    } );
}

async function payment( _hash )
{
    return transactions.get( _hash ).promise;
}

function abort( _hash )
{
    //paypal.abort...
}

function listen()
{
    app.listen(3000);
}

module.exports = {
    qrInvoice: qrInvoice,
    payment: payment,
    abort: abort,
    listen: listen
};

