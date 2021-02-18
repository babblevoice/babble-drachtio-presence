
"use strict"

const assert = require( "assert" )
const presence = require( "../lib/presencedocument.js" )

// Content-Type: application/pidf+xml
const zoiper5publish = `<?xml version="1.0" encoding="UTF-8"?>
<presence xmlns="urn:ietf:params:xml:ns:pidf"
entity="sip:1000@bling.babblevoice.com;transport=UDP">
<tuple id="1000" >
<status><basic>open</basic></status>
<note>Online</note>
</tuple>
</presence>`

let zoip = presence.parsepidfxml( "application/pidf+xml", zoiper5publish )

assert( "open" === zoip.status )
assert( "Online" === zoip.note  )
assert( false === zoip.dnd )
assert( false === zoip.onthephone )

/*
Testing between FS and a Zoiper client.

Zoiper SUBSCRIBED:

SUBSCRIBE sip:1000@bling.babblevoice.com;transport=UDP SIP/2.0
Via: SIP/2.0/UDP 192.168.0.141:43189;branch=z9hG4bK-524287-1---94acbd0d14c7f57d;rport
Max-Forwards: 70
Contact: <sip:1000@82.19.206.102:43189;transport=UDP>
To: <sip:1000@bling.babblevoice.com;transport=UDP>
From: <sip:1000@bling.babblevoice.com;transport=UDP>;tag=b44bdc4f
Call-ID: FdsKGh-UPhTLf3dbjH9ZYg..
CSeq: 1 SUBSCRIBE
Expires: 60
Accept: application/pidf+xml
Allow: INVITE, ACK, CANCEL, BYE, NOTIFY, REFER, MESSAGE, OPTIONS, INFO, SUBSCRIBE
User-Agent: Z 5.3.8 rv2.9.30-mod
Event: presence
Allow-Events: presence, kpml, talk
Content-Length: 0

The first NOTIFY contains an empty dialog structure:
<?xml version="1.0"?>
<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="0" state="full" entity="sip:1000@bling.babblevoice.com">
</dialog-info>

On an outbound call, from Ziper to my moile, this is sent - although it is clipped.
<?xml version="1.0"?>
<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="2" state="full" entity="sip:1000@bling.babblevoice.com">
<dialog id="e367f2db-dd4c-4563-975b-0ea1f1e75693" direction="initiator">
<state>confirmed</state>
<local>
<identity display="1000">sip:1000@bling.babblevoice.com</identity>
<target uri="sip:1000@bling.babblevoice.com">
<param pname="+sip.rendering" pvalue="yes"/>
</target>
</local>
<remote>
<identity display="07766088671">sip:07766088671@bling.babblevoice.com</identity>
<target uri="sip:**1000@bling.babblevoice.com"/>
</remote>
</di

Then making a call to zoiper (from an external source)

On a call:

sends pidf (content-type: application/pidf+xml):
<?xml version="1.0" encoding="ISO-8859-1"?>
<presence xmlns='urn:ietf:params:xml:ns:pidf'
xmlns:dm='urn:ietf:params:xml:ns:pidf:data-model'
xmlns:rpid='urn:ietf:params:xml:ns:pidf:rpid'
xmlns:c='urn:ietf:params:xml:ns:pidf:cipid' entity='sip:1000@bling.babblevoice.com'>
 <tuple id='t6a5ed77e'>
  <status>
   <basic>open</basic>
  </status>
 </tuple>
 <dm:person id='p06360c4a'>
  <rpid:activities>
   <rpid:on-the-phone/>
  </rpid:activities>
  <dm:note>Talk 07766088671</dm:note>
 </dm:person>
</presence>

And dialog (again clipped)
<?xml version="1.0"?>
<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="14" state="full" entity="sip:1000@bling.babblevoice.com">
<dialog id="4445e92c-1e3c-4796-9e3f-755a0906a1f2" direction="recipient">
<state>confirmed</state>
<local>
<identity display="1000">sip:1000@bling.babblevoice.com</identity>
<target uri="sip:1000@bling.babblevoice.com">
<param pname="+sip.rendering" pvalue="yes"/>
</target>
</local>
<remote>
<identity display="07766088671">sip:07766088671@bling.babblevoice.com</identity>
<target uri="sip:**1000@bling.babblevoice.com"/>
</remote>
</d

Terminated:
<?xml version="1.0"?>
<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="15" state="full" entity="sip:1000@bling.babblevoice.com">
<dialog id="4445e92c-1e3c-4796-9e3f-755a0906a1f2" direction="recipient">
<state>terminated</state>
</dialog>
</dialog-info>

Freeswitch sent this to Zoiper on subscribe

*/

// Generate then parse and check
let ourgenerated = presence.parsepidfxml( "application/pidf+xml", presence.genpidfxml( "1000@bling.babblevoice.com", "closed" ) )
assert( true === ourgenerated.dnd )
assert( false === ourgenerated.onthephone )
assert( "closed" === ourgenerated.status )

ourgenerated = presence.parsepidfxml( "application/pidf+xml", presence.genpidfxml( "1000@bling.babblevoice.com", "closed", "Talk 077660000111", "on-the-phone" ) )
assert( false === ourgenerated.dnd )
assert( true === ourgenerated.onthephone )
assert( "open" === ourgenerated.status )
assert( "Talk 077660000111" === ourgenerated.note )



const fspidfgen = `<?xml version="1.0" encoding="ISO-8859-1"?>
<presence xmlns='urn:ietf:params:xml:ns:pidf'
xmlns:dm='urn:ietf:params:xml:ns:pidf:data-model'
xmlns:rpid='urn:ietf:params:xml:ns:pidf:rpid'
xmlns:c='urn:ietf:params:xml:ns:pidf:cipid' entity='sip:1000@bling.babblevoice.com'>
 <tuple id='t6a5ed77e'>
  <status>
   <basic>open</basic>
  </status>
 </tuple>
 <dm:person id='p06360c4a'>
  <dm:note>Available</dm:note>
 </dm:person>
</presence>`

// Content-Type: application/xpidf+xml - from a polycom
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

const polycomvvx101_2 = `<?xml version="1.0"?>
<!DOCTYPE presence
PUBLIC "-//IETF//DTD RFCxxxx XPIDF 1.0//EN" "xpidf.dtd">
<presence>
<presentity uri="sip:1002@bling.babblevoice.com;method=SUBSCRIBE" />
<atom id="1385">
<address uri="sip:192.168.0.86;user=ip" priority="0.800000">
<status status="inuse" />
<msnsubstatus substatus="onthephone" />
</address>
</atom>
</presence>`

/* This is what we are sent when we hit the DND button */
const polycomvvx101_3 = `<?xml version="1.0"?>
<!DOCTYPE presence
PUBLIC "-//IETF//DTD RFCxxxx XPIDF 1.0//EN" "xpidf.dtd">
<presence>
<presentity uri="sip:1002@bling.babblevoice.com;method=SUBSCRIBE" />
<atom id="1008">
<address uri="sip:192.168.0.86;user=ip" priority="0.800000">
<status status="inuse" />
<msnsubstatus substatus="busy" />
</address>
</atom>
</presence>`

let poly1 = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )
assert( false === poly1.onthephone )
assert( false === poly1.dnd )

let poly2 = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101_2 )
assert( false === poly2.dnd )
assert( true === poly2.onthephone )

let poly3 = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101_3 )
assert( true === poly3.dnd )
assert( true === poly3.onthephone )



/*


Example from FS to VTech
Content-Type: application/dialog-info+xml
Content-Length: 161

<?xml version="1.0"?>
<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="85" state="full" entity="sip:9019@omniis.babblevoice.com">
</dialog-info>

<?xml version="1.0"?>
<dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info" version="430" state="full" entity="sip:9022@omniis.babblevoice.com">
<dialog id="fb67ef49-dfeb-4b1d-8b98-6d332da583be" direction="recipient">
<state>terminated</state>
</dialog>
</dialog-info

*/


let poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )

assert( poly.status === "open" )
assert( poly.note === "online" )


let d = {
  "dialog": {
    "attr": { "id": "123" },
    "state": "confirmed",
    "duration": "274",
    "local": {
      "identity": {
        "attr": {
          "display": "Alice"
        },
        "#text": "sip:alice@example.com"
      },
      "target": {
        "attr": {
          "uri": "sip:bobster@phone21.example.org"
        }
      }
    },
    "remote": {
      "identity": {
        "attr": {
            "display": "Bob"
        },
        "#text": "sip:bob@example.org"
      },
      "target": {
        "attr": {
          "uri": "ip:bobster@phone21.example.org"
        }
      }
    }
  }
}

const xmlexample = `<dialog id="123456">
    <state>confirmed</state>
    <duration>274</duration>
    <local>
      <identity display="Alice">sip:alice@example.com</identity>
      <target uri="sip:alice@pc33.example.com"></target>
    </local>
    <remote>
      <identity display="Bob">sip:bob@example.org</identity>
      <target uri="sip:bobster@phone21.example.org"/>
    </remote>
 </dialog>`

 //console.log( JSON.stringify( p.xmltoobj( xmlexample ) ) )
