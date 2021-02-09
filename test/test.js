
"use strict"

const assert = require( "assert" )
const presence = require( "../lib/presencedocument.js" )

const zoiper5publish = `<?xml version="1.0" encoding="UTF-8"?>
<presence xmlns="urn:ietf:params:xml:ns:pidf"
entity="sip:1000@bling.babblevoice.com;transport=UDP">
<tuple id="1000" >
<status><basic>open</basic></status>
<note>Online</note>
</tuple>
</presence>`

let zoip = presence.parsepidfxml( "application/pidf+xml", zoiper5publish )

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
