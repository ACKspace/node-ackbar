//shitty lib const util = require( "util" );
var figlet = require( "figlet" );
const readline = require( "readline" );
const SerialPort = require('serialport');
const dat = require('./dat');

const rl = readline.createInterface(
{
  completer: completer_user,
  input: process.stdin,
  output: process.stdout

} );

/*
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  //completer: completer,
  historySize: 1,
  removeHistoryDuplicates: true,
  //prompt: "C:\\WINDOWS\\SYSTEM> "
});
*/

function completer_product( line, callback )
{
    // NOTE: KEYBOARD is ignored
    const commands = [ "QUIT", "CHECKOUT", "DEPOSIT", "ABORT" ];
    const productlist = [...new Set(products.map( p => p.product ).sort())];

    if ( !line.length )
    {
        //callback( null, [ commands, line ] );
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
    // NOTE: KEYBOARD is ignored
    const commands = [ "QUIT" ];
    const userlist = users.map( u => u.nick ).sort();

    if ( !line.length )
    {
        //callback( null, [ commands, line ] );
        callback( null, [ commands.concat( userlist ), line ] );
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

var device;

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

var scandata = "";
if ( false )
{
	device = new SerialPort.parsers.Readline( { delimiter: '\r\n' } );
	serialPort.pipe( device );
	device.on( 'data', d => scandata = d );
}
else
{
	device = null;
}

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
	await sleep( 30 );
	return 0;
}

async function scanuser()
{
	print( "Scan your barcode or KEYBOARD to login manually.\n" );

    var dummy = new Promise(function(resolve, reject)
    {
        setTimeout(resolve, 5000, 'quit');
    });
    scan = await Promise.race( [ dummy, keyboard_out() ] );
    /*
	if ( device )
	{
		scan = await scanner();
	}
	else
	{
		print( "Scanner not found, use keyboard!\n" );
		scan = await keyboard_out();
	}
    */

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
	if ( device )
	{
		scan = await scanner();
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
			process.exit( 0 );
	}

// cat ./products.dat | grep $scan >> /dev/null || return 1

    // TODO / NOTE: spaces are not allowed in keyboard entry
    var data = products.find( p => { return p.barcode === scan } );
    if ( !data )
        data = products.filter( p => { return p.product.toLowerCase() === scan.toLowerCase() } );

    if ( data.length > 1 && new Set(data.map( p => p.value )).size > 1 )
    {
        print( "Multiple prices for the same product name!\n" );
        await sleep( 3 );
        return 1;
    }
    data = data[ 0 ];

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
	/*
	if [[ $input =~ ^[0-9a-zA-Z_-]*$ ]]
	then
		echo -n $input
	else
		echo -n !
	fi
	*/

	while ( !scandata )
		await sleep( 0.1 );
	var data = scandata;
	scandata = "";
	return data;
}

async function keyboard_out( )
{
	/*
	if [[ $input =~ ^[0-9a-zA-Z_-]*$ ]]
	then
		echo -n $input
	else
		echo -n !
	fi
	*/
	return new Promise( (resolve, reject) => rl.question( '.', (answer) => {
		if ( !answer.match( /^[A-Za-z0-9_\-]+$/ ) )
			resolve( "!" );
		else
			resolve( answer );
	} ) );
}


async function keyboard_product_out( )
{
	/*
	if [[ $input =~ ^[0-9a-zA-Z_-]*$ ]]
	then
		echo -n $input
	else
		echo -n !
	fi
	*/
	return new Promise( (resolve, reject) => rl.question( '.', (answer) => {
		if ( !answer.match( /^[A-Za-z0-9_\- ]+$/ ) )
			resolve( "!" );
		else
			resolve( answer );
	} ) );
}

async function yesno_out( )
{
	/*
	if [[ $input =~ ^y.* ]]
	then
		echo -n y
	else
		echo -n n
	fi
	*/
	return new Promise( (resolve, reject) => rl.question( ':', (answer) => {
		if ( answer.match( /^y.*/ ) )
			resolve( "y" );
		else
			resolve( "n" );
	} ) );
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
	read input
	shopt -s nocasematch

	if [[ $input =~ ^([0-9]+|[0-9]+[.,]|[0-9]+[.,][0-9]+)$ ]]
	then
		echo "${input/,/.} + 0.00" | bc
		#echo 9.99
	else
		echo -n 0
	fi
	shopt -u nocasematch
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

// trap '' 2

(async () => {
	while ( true )
		await menu();
})();
