"use strict"

const fs = require( "fs" );

function format( _amount )
{
       var number = parseInt( _amount / 100 );
       var decimal = ( _amount % 100 )
       if ( decimal < 10 )
               return number + ".0" + decimal;
       else
               return number + "." + decimal;
}

// Read legacy dat file
function readDat( _file, _arrFields )
{
    return fs.readFileSync( _file, 'utf8' )
        .split( /[\r\n]+/ )
        .filter( (e) => e )
        .map( (e) =>
        {
            var r = {};
            // Filter out 'comment' lines
            if ( e.trim()[0] === "#" )
                return null;

            var ef = e.split( ":" );
            _arrFields.forEach( (f,i) =>
            {
                // Convert value into numeric 'cents' field
                if ( f === "value" )
                    r[ f ] = Math.round( parseFloat( ef[i] ) * 100 );
                else
                    r[ f ] = ef[i];
            } )
            return r;
        } ).filter( l => l );
}

function writeDat( _file, _data, _arrFields )
{
    var data = "#" + _arrFields.join( " " ) + "\n";

    _data.forEach( d =>
    {
        let sep = "";
        _arrFields.forEach( f =>
        {
            if ( f === "value" )
                data += sep + format( d[ f ] );
            else
                data += sep + d[ f ];
            sep = ":";
        } );
        data += "\n";
    } );

    fs.writeFileSync( _file, data );
}

function tempExists( _data )
{
    return fs.existsSync( "temp.dat" );
}

function writeTemp( _data )
{
    // Append _data to temp file
    fs.writeFileSync( "temp.dat", _data, { flag: "a" } );
}

function appendTemp( _file )
{
    // Append the temp file contents to _file
    fs.writeFileSync( _file, fs.readFileSync( "temp.dat" ), { flag: "a" } );
}

function deleteTemp( )
{
    fs.unlinkSync( "temp.dat" );
}

module.exports = {
    readDat: readDat,
    writeDat: writeDat,
    tempExists: tempExists,
    writeTemp: writeTemp,
    appendTemp: appendTemp,
    deleteTemp: deleteTemp
};

