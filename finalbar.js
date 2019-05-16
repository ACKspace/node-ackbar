const debug = true;
const figlet = require( "figlet" );
const readline = require( "readline" );
const SerialPort = require('serialport');
const dat = require('./dat');
const HID = require('node-hid');

const rl = readline.createInterface( { input: process.stdin, output: process.stdout } );

// Connect to a USB barcode scanner with `xinput disable <id>` so it doesn't send text to stdin
const hid = new HID.HID( 5050, 24 );

function completer_product( line, callback )
{
    const commands = [ "QUIT", "CHECKOUT", "DEPOSIT", "ABORT" ];
    const productlist = [...new Set(products.map( p => p.product ).sort())];

    if ( !line.length )
    {
        callback( null, [ commands.concat( productlist ), line ] );
    }
    else
    {
        const hits = commands.concat( productlist ).filter((c) => c.toLowerCase().startsWith( line.toLowerCase() ) );
        callback( null, [ hits, line ] );
    }
}

function completer_user( line, callback )
{
    const commands = [ "QUIT" ];
    const userlist = users.map( u => u.nick ).sort();

    if ( !line.length )
    {
        if ( debug )
            callback( null, [ commands.concat( userlist ), line ] );
        else
            callback( null, [ commands, line ] );
    }
    else
    {
        const hits = commands.concat( userlist ).filter((c) => c.startsWith( line ) );
        callback( null, [ hits, line ] );
    }
}


var serialPort = null;

/*
serialPort = new SerialPort('/dev/ttyUSB0', {
    baudRate: 9600
});
*/

products = dat.readDat( "./products.dat", [ "barcode", "product", "value" ] );
users = dat.readDat( "./users.dat", [ "barcode", "value", "nick" ] );

var figlist = [ "banner","Big","Block","Bubble","Digital","Ivrit","Lean","Mini","Mnemonic","Script","Shadow","Slant","Small","Smscript","Smshadow","Smslant","Standard","Term"];
var log = [];

var temp = [];

var	total=0;
var	cash=0;
var	depo=0;
var	moniez=0;
var	user="";
var nick="";
var	scan="";
var	depo=0;
var	restart=0;
var	endcash=0;

async function menu()
{
    rl.completer = completer_user; 

	if ( temp.length )
	{
		cleanup();
		logo();
		print( "someone already logged in, please wait" );
	}
	while ( temp.length )
	{
		print( "." );
		await sleep( 1 );
	}

	cleanup();
	logo();

	var ret = await scanuser();
	while ( ret !== 0 )
	{
		print( "!" );
		cleanup();
		logo();

		ret = await scanuser();
	}

	if ( temp.length )
	{
		cleanup();
		logo();
		print( "someone already logged in, please wait.." );
		await sleep( 5 );
		return 0
	}

	/* User logged in, log result (which is also a lock file */
	logg();

	print( "You can now scan products or charge up your account.\n" );
	var ret = await scanproduct();
	while ( ret !== 0 )
	{
		ret = await scanproduct();
	}

	if ( restart !== 1 )
	{
		print( "Checking out..\n" );
		endcash = cash - total;

		if ( endcash < 0 )
		{
			print( "Not enough money!\n" );
		}
		else
		{
			vervang( user, endcash );
			print( "Succes! You now have " + format( endcash ) + " on your account, logging out..\n" );
			//echo "Spent: "$total >> temp.dat
			//cat temp.dat >> log.dat
		}
	}
	temp.length = 0;
	await sleep( 3 );
	return 0;
}

async function scanuser()
{
	print( "Scan your barcode or KEYBOARD to login manually.\n" );

	if ( hid )
	{
		//scan = await scanner();
        scan = await Promise.race( [ scanner(), keyboard_out() ] );

        // Break the loop
        hid.removeAllListeners("data");
	}
	else
	{
		print( "Scanner not found, use keyboard!\n" );
		scan = await keyboard_out();
	}

	if ( !scan.match( /^[A-Za-z0-9_\-]+$/ ) )
	{
		print( "Illegal character detected!\n" );
		return 1;
	}

	// 	/* Special barcodes */
	switch ( scan.toUpperCase() )
	{
		case "QUIT":
			cleanup();
            rl.close();
			process.exit( 0 );

		case "CHECKOUT":
			print( "Can't check out, not logged in.\n" );
			return 1;

		case "DEPOSIT":
			print( "Login to deposit cash.\n" );
			return 1;

		case "ABORT":
			print( "Nothing to abort.\n" );
			return 1;

		case "KEYBOARD":
			print( "Type in your nickname:\n" );
			nick = await keyboard_out();
			if ( nick === "!" || nick === "ABORT" || nick === "CHECKOUT" || nick === "DEPOSIT" || nick === "KEYBOARD" || nick === "QUIT" )
			{
				print( "Only a-Z, 0-9, - and _ allowed sorry.\n" );
				return 1;
			}

			/* Disallow */
			if ( !nick ) return 1;
			/* [ $(echo $nick | grep :) ] && echo Foei && return 1 */
            if ( products.find( p => { return p.product.toLowerCase().match( nick.toLowerCase() ) } ) ) { print( "Name already exists as product.\n" ); return 1; }

            var data = users.find( u => { return u.nick === nick } ); 
            if ( !data )
			{
				var ret = await registeruser();
				if ( ret === 1 ) return 2;
                data = users.find( u => { return u.nick === nick } ); 
			}

			if ( !data ) return 1;

			code = data.barcode;
			cash = data.value;
			user = data.nick;

			return 0;
	} // end case

	/* Is this barcode in the product database? */
    if ( products.find( p => { return p.barcode === scan } ) )
	{
		print( "Product.. FAAL\n" );
		return 1;
	}

	/* The hack check */
	if ( scan.match( /:/ ) ) { print( "Bad hacker! ':' is an illegal character!" ); return 1; }
	if ( scan.match( /\&/ ) ) { print( "Bad hacker! '&' is an illegal character!" ); return 1; }
	if ( scan.match( /;/ ) ) { print( "Bad hacker! ';' is an illegal character!" ); return 1; }

	/* Is this barcode in the user database? No? goto register */
    var data = users.find( u => { return u.barcode === scan } );

    // NEW: find scan as nick
    if ( !data )
        data = users.find( u => { return u.nick === scan } );

    if ( !data )
	{
		if ( await registeruser() )
			return 1;
	}

    // Update tab completion
    rl.completer = completer_product; 

	/* Take the data out of the userdatabase and split it up */
	if ( !data ) return 1;

	code = data.barcode;
	cash = data.value;
	user = data.nick;

	return 0;
}

function logg( )
{
	temp.push( "" );
	temp.push( "--" + user + "--" );
// 	date >> temp.dat
	print( "Hello " + user + "!\n" );
	print( "You currently have " + format( cash ) + "\n" );
	return 0;
}

async function registeruser()
{
	if ( nick )
	{
		print( "Do you want to register this nick? (y/n)\n" );
		answer = await yesno_out();
	}
	else
	{
		print( "Do you want to register this barcode? (y/n)\n" );
		answer = await yesno_out();
		nick=scan;
	}

	if ( answer !== "y" )
	{
		print( "Canceling registration\n" );
		return 1;
	}

	if ( answer === "y" )
	{
		//echo $scan":0.00:"$nick >> users.dat
		print( "Registered!\n" );
	}

	return 0;
}

async function scanproduct()
{
	if ( hid )
	{
        scan = await Promise.race( [ scanner(), keyboard_product_out() ] );

        // Break the loop
        hid.removeAllListeners("data");
	}
	else
	{
		print( "Scanner not found, use keyboard!\n" );
		scan = await keyboard_product_out();
	}

	switch ( scan.toUpperCase() )
	{
		case "DEPOSIT":
			await deposit();
			return 1;

		case "CHECKOUT":
		if ( depo != 0 )
		{
			//echo "Deposited: "$depo >> temp.dat
			print( "Deposited: " + format( depo ) + " Total:" + format( depo + cash ) + "\n" );
			cash = cash + depo;
			vervang( user, cash );
		}
		return 0;

		case "ABORT":
			print( "ABORTED\n" );
			await sleep( 2 );
			restart = 1;
			return 0;

		case "QUIT":
			print( "QUIT\n" );
			cleanup();
			temp.length = 0;
            rl.close();
			process.exit( 0 );
	}

    // TODO / NOTE: spaces are not allowed in keyboard entry
    var data = products.find( p => { return p.barcode === scan } );

    if ( !data )
    {
        data = products.filter( p => { return p.product.toLowerCase() === scan.toLowerCase() } );

        if ( data.length > 1 && new Set(data.map( p => p.value )).size > 1 )
        {
            print( "Multiple prices for the same product name!\n" );
            await sleep( 3 );
            return 1;
        }
        data = data[ 0 ];
    }

    if ( !data ) return 1;

	code = data.barcode;
	product = data.product;
	price = data.value;

	//echo $product >> temp.dat
	total = total + price;
//         derp=${total%.*}
	print( format( price ) + " " + product + "\n" );
	print( "The total amounts adds up to " + format( total ) + "\n" );
	return 2; /* NOT FINISHED */
}

async function deposit()
{
	print( "How much money do you want to deposit? (e.g. 1.50)\n" );
	moniez = await deposit_out();
	depo = depo + moniez;
	print( format( depo ) + "\n" );
	return 0;
}

function logo()
{
	console.clear();
	print( "\033[33m" );
	var font = figlist[ ( Math.random() * figlist.length ) | 0 ];

	if ( false )
		print( figlet.textSync('ACKbar', { font: font } ) );
	else
		print( "ACKbar" );
	print( "\n" );
	print( "\033[37m" );
}

function cleanup()
{
	/* echo "" > temp.dat */
	total=0;
	cash=0;
	depo=0;
	moniez=0;
	user="";
	nick="";
	scan="";
	restart=0;
	endcash=0;
}

async function scanner( )
{
    var keys = [];

    hid.setNonBlocking( 1 );
    hid.on( "data", function( d )
    {
        if ( d.length )
        {
            if ( debug )
                console.log( d, parseCharCodes( d[2], parseModifiers( d[ 0 ] ) ) );
            keys.push( parseCharCodes( d[2], parseModifiers( d[ 0 ] ) ) );
        }
    } );

    while ( !keys.length && keys[ keys.length - 1 ] !== "\n" && hid.listenerCount("data") )
        await sleep( 0.1 );

    await sleep( 0.1 );
    return keys.join("").replace( "\n", "" );
}

async function keyboard_out( )
{
    return new Promise( resolve => { rl.once( 'line', function( answer )
    {
		if ( !answer.match( /^[A-Za-z0-9_\-]+$/ ) )
			resolve( "!" );
		else
			resolve( answer );
    } ) } );
}


async function keyboard_product_out( )
{
    // NOTE: difference with this and keyboard_out is allowing a space
    return new Promise( resolve => { rl.once( 'line', function( answer )
    {
		if ( !answer.match( /^[A-Za-z0-9_\- ]+$/ ) )
			resolve( "!" );
		else
			resolve( answer );
    } ) } );

}

async function yesno_out( )
{
    return new Promise( resolve => { rl.once( 'line', function( answer )
    {
		if ( !answer.match( /^y.*/ ) )
			resolve( "y" );
		else
			resolve( "n" );
    } ) } );

}

async function deposit_out( )
{
	/*
	# no negative numbers
	# output n.nn or 0 @ error
	# multiple digits behind dot
	# comma+dot allowed (replaced by dot)
	# 1 .1 1.1 1.11 1.111 ,1 1,1 1,11 1,111
	#		endcash=$(bc -e $cash-$total -e quit)
	*/
	return new Promise( (resolve, reject) => rl.question( ':', (answer) => {
		var result = answer.match( /^([0-9]+)?(?:[.,]([0-9]*))?$/ );
		if ( result )
		{
			var euros = ( result[1] | 0 );
			var cents = result[2];

			// Adjust single digit cents, i.e. .2
			if ( cents && cents.length < 2 )
				cents = 10 * cents;
			else
				cents = ( cents | 0 );

			resolve( 100 * euros + cents );
		}
		else
		{
			resolve( 0 );
		}
	} ) );
}

function vervang( _user, _bedrag )
{
	// find user: set amount
    var user = users.find( u => { return u.nick === _user } );
    if ( !user )
		return false;

	user.value = _bedrag;
    dat.writeDat( "./users.dat", users, [ "barcode", "value", "nick" ] );
	return true;
}

async function sleep( _s )
{
	return new Promise( (resolve, reject) => setTimeout(resolve, _s * 1000 ) );
}

function print( _text )
{
	process.stdout.write( _text );
	return _text;
}

function format( _amount )
{
	var number = parseInt( _amount / 100 );
	var decimal = ( _amount % 100 )
	if ( decimal < 10 )
		return number + ".0" + decimal;
	else
		return number + "." + decimal;
}

function parseModifiers( _bits )
{
    var modifiers = {};
    modifiers.l_control = ((_bits & 1) !== 0);
    modifiers.l_shift = ((_bits & 2) !== 0);
    modifiers.l_alt = ((_bits & 4) !== 0);
    modifiers.l_meta = ((_bits & 8) !== 0);
    modifiers.r_control = ((_bits & 16) !== 0);
    modifiers.r_shift = ((_bits & 32) !== 0);
    modifiers.r_alt = ((_bits & 64) !== 0);
    modifiers.r_meta = ((_bits & 128) !== 0);
    return modifiers;
}

function parseCharCodes( _charCode, _modifiers )
{
    var shift = ( _modifiers.l_shift || _modifiers.r_shift ) ? 1: 0;
    switch ( _charCode )
    {
        // Note: codes are available here: http://www.usb.org/developers/hidpage/Hut1_12v2.pdf
        //       See page 53
        case 4: return['a', 'A'][shift];
        case 5: return['b', 'B'][shift];
        case 6: return['c', 'C'][shift];
        case 7: return['d', 'D'][shift];
        case 8: return['e', 'E'][shift];
        case 9: return['f', 'F'][shift];
        case 10: return['g', 'G'][shift];
        case 11: return['h', 'H'][shift];
        case 12: return['i', 'I'][shift];
        case 13: return['j', 'J'][shift];
        case 14: return['k', 'K'][shift];
        case 15: return['l', 'L'][shift];
        case 16: return['m', 'M'][shift];
        case 17: return['n', 'N'][shift];
        case 18: return['o', 'O'][shift];
        case 19: return['p', 'P'][shift];
        case 20: return['q', 'Q'][shift];
        case 21: return['r', 'R'][shift];
        case 22: return['s', 'S'][shift];
        case 23: return['t', 'T'][shift];
        case 24: return['u', 'U'][shift];
        case 25: return['v', 'V'][shift];
        case 26: return['w', 'W'][shift];
        case 27: return['x', 'X'][shift];
        case 28: return['y', 'Y'][shift];
        case 29: return['z', 'Z'][shift];

        case 30: return['1', '!'][shift];
        case 31: return['2', '@'][shift];
        case 32: return['3', '#'][shift];
        case 33: return['4', '$'][shift];
        case 34: return['5', '%'][shift];
        case 35: return['6', '^'][shift];
        case 36: return['7', '&'][shift];
        case 37: return['8', '*'][shift];
        case 38: return['9', '('][shift];
        case 39: return['0', ')'][shift];

        case 40: return['\n', '\n'][shift];
        case 41: return['', ''][shift]; // escape
        case 42: return['', ''][shift]; // delete
        case 43: return['\t', '\t'][shift];
        case 44: return[' ', ' '][shift];
        case 45: return['-', '_'][shift];
        case 46: return['=', '+'][shift];
        case 47: return['[', '{'][shift];
        case 48: return[']', '}'][shift];
        case 49: return['\\', '|'][shift];
        case 50: return['#', '~'][shift];
        case 51: return[';', ':'][shift];
        case 52: return['\'', '"'][shift];
        case 53: return['`', '~'][shift];
        case 54: return[',', '<'][shift];
        case 55: return['.', '>'][shift];
        case 56: return['/', '?'][shift];

        case 57: return['', ''][shift]; // caps lock
        case 58: return['', ''][shift]; // F1
        case 59: return['', ''][shift]; // F2
        case 60: return['', ''][shift]; // F3
        case 61: return['', ''][shift]; // F4
        case 62: return['', ''][shift]; // F5
        case 63: return['', ''][shift]; // F6
        case 64: return['', ''][shift]; // F7
        case 65: return['', ''][shift]; // F8
        case 66: return['', ''][shift]; // F9
        case 67: return['', ''][shift]; // F10
        case 68: return['', ''][shift]; // F11
        case 69: return['', ''][shift]; // F12
        case 70: return['', ''][shift]; // Print screen
        case 71: return['', ''][shift]; // Scroll lock
        case 72: return['', ''][shift]; // Pause
        case 73: return['', ''][shift]; // Insert
        case 74: return['', ''][shift]; // Home
        case 75: return['', ''][shift]; // PageUp
        case 76: return['', ''][shift]; // Delete forward
        case 77: return['', ''][shift]; // End
        case 78: return['', ''][shift]; // PageDown
        case 79: return['', ''][shift]; // RightArrow
        case 80: return['', ''][shift]; // LeftArrow
        case 81: return['', ''][shift]; // DownArrow
        case 82: return['', ''][shift]; // UpArrow

        // Keypad
        case 83: return['', ''][shift]; // NumLock / clear
        case 84: return['/', '/'][shift]; //
        case 85: return['*', '*'][shift]; //
        case 86: return['-', '-'][shift]; //
        case 87: return['+', '+'][shift]; //
        case 88: return['\n', '\n'][shift]; //

        // Keypad numbers
        case 89: return['1', '1'][shift]; //
        case 90: return['2', '2'][shift]; //
        case 91: return['3', '3'][shift]; //
        case 92: return['4', '4'][shift]; //
        case 93: return['5', '5'][shift]; //
        case 94: return['6', '6'][shift]; //
        case 95: return['7', '7'][shift]; //
        case 96: return['8', '8'][shift]; //
        case 97: return['9', '9'][shift]; //
        case 98: return['0', '0'][shift]; //
        case 99: return['.', '.'][shift]; //
        case 100: return['\\', '|'][shift]; // Non-US
        case 101: return['', ''][shift]; // Application
        case 102: return['', ''][shift]; // Power
        case 103: return['=', '='][shift]; // Keypad =
        case 104: return['', ''][shift]; // F13
        case 105: return['', ''][shift]; // F14
        case 106: return['', ''][shift]; // F15
        case 107: return['', ''][shift]; // F16
        case 108: return['', ''][shift]; // F17
        case 109: return['', ''][shift]; // F18
        case 110: return['', ''][shift]; // F19
        case 111: return['', ''][shift]; // F20
        case 112: return['', ''][shift]; // F21
        case 113: return['', ''][shift]; // F22
        case 114: return['', ''][shift]; // F23
        case 115: return['', ''][shift]; // F24

        // Misc actions omitted below...

        case 133: return[',', ','][shift]; //
        case 134: return['=', '='][shift]; //

        case 158: return['\n', '\n'][shift]; //

        case 182: return['(', '('][shift]; //
        case 183: return[')', ')'][shift]; //
        case 184: return['{', '{'][shift]; //
        case 185: return['}', '}'][shift]; //
        case 186: return['\t', '\t'][shift]; //
        case 187: return['', ''][shift]; // Backspace
        case 188: return['A', 'A'][shift]; //
        case 189: return['B', 'B'][shift]; //
        case 190: return['C', 'C'][shift]; //
        case 191: return['D', 'D'][shift]; //
        case 192: return['E', 'E'][shift]; //
        case 193: return['F', 'F'][shift]; //

        case 195: return['^', '^'][shift]; //
        case 196: return['%', '%'][shift]; //
        case 197: return['<', '<'][shift]; //
        case 198: return['>', '>'][shift]; //
        case 199: return['&', '&'][shift]; //

        // There are many codes that are not currently handled here.
        default: return ['', ''][shift];
    }
}

/*
rl.on('SIGINT', () => {
  rl.question('Are you sure you want to exit? ', (answer) => {
    if (answer.match(/^y(es)?$/i)) rl.pause();
  });
});
*/

(async () => {
	while ( true )
		await menu();
})();
