"use strict"

var counter;

function start( _duration, _text )
{
    counter = _duration;
    return new Promise( function( resolve, reject )
    {
        var interval = setInterval( function()
        {
            if ( --counter <= 0 )
            {
                clearInterval( interval );
                resolve( 0 );
            }
            else
            {
                process.stdout.write( "\u001b[u" );
                if ( _text )
                    process.stdout.write( _text );
                process.stdout.write( String( counter ) + " " );
            }
        }, 1000);
    } );
}

function stop()
{
    counter = 0;
}

module.exports = {
    start: start,
    stop: stop
};

