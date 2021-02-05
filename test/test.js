
"use strict"

const assert = require( "assert" )

const presence = require( "../index.js" )
const p = new presence( {} )

const zoiper5publish = `<?xml version="1.0" encoding="UTF-8"?>
<presence xmlns="urn:ietf:params:xml:ns:pidf"
entity="sip:1000@bling.babblevoice.com;transport=UDP">
<tuple id="1000" >
<status><basic>open</basic></status>
<note>Online</note>
</tuple>
</presence>`

let zoip = p.parsepidfxml( "application/pidf+xml", zoiper5publish )

assert( zoip.status === "open" )
assert( zoip.note === "Online" )


const polycomvvx101 = `<?xml version="1.0"?>
<!DOCTYPE presence
PUBLIC "-//IETF//DTD RFCxxxx XPIDF 1.0//EN" "xpidf.dtd">
<presence>
<presentity uri="sip:192.168.0.141:5060;method=SUBSCRIBE" />
<atom id="1004">
<address uri="sip:192.168.0.86;user=ip" priority="0.800000">
<status status="open" />
<msnsubstatus substatus="online" />
</address>
</atom>
</presence>`


let poly = p.parsepidfxml( "application/xpidf+xml", polycomvvx101 )

assert( poly.status === "open" )
assert( poly.note === "online" )

/*
console.log( xmlparser.parse( `<a id="33">hello</a>`, xmlparseroptions ) )

{ a: { '#text': 'hello', attr: { '@_id': '' } } }

var j2xobj = new j2x(xmlparseroptions)
console.log( j2xobj.parse( { a: { '#text': 'hello', attr: { '@_id': '' } } } ) )
*/
