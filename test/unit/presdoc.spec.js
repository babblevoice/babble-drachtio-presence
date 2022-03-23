
const expect = require( "chai" ).expect
const presence = require( "../../lib/presencedocument.js" )

describe( "presdoc.spec.js", function() {

  it( "zoiper publish doc", function() {
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
    expect( zoip.status ).to.equal( "open" )
    expect( zoip.note ).to.equal( "Online" )
    expect( zoip.dnd ).to.be.false
    expect( zoip.onthephone ).to.be.false

  } )

  it( "polycom 101 xpidf+xml 1", function() {
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

    let poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )
    expect( poly.onthephone ).to.be.false
    expect ( poly.dnd ).to.be.false
    expect( poly.status ).to.equal( "open" )
    expect( poly.note ).to.equal( "online" )

  } )

  it( "polycom 101 xpidf+xml 2", function() {

    const polycomvvx101 = `<?xml version="1.0"?>
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

    let poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )
    expect( poly.onthephone ).to.be.true
    expect ( poly.dnd ).to.be.false
  } )

  it( "polycom 101 xpidf+xml 3", function() {

    const polycomvvx101 = `<?xml version="1.0"?>
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

    let poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )
    expect( poly.onthephone ).to.be.true
    expect ( poly.dnd ).to.be.true
  } )

  it( "Generate pdif parse and check 1", function() {
    let ourgenerated = presence.parsepidfxml( "application/pidf+xml", presence.genpidfxml( "1000@bling.babblevoice.com", "closed" ) )
    expect( ourgenerated.dnd ).to.be.true
    expect( ourgenerated.onthephone ).to.be.false
    expect( ourgenerated.status ).to.equal( "closed" )
  } )

  it( "Generate pdif parse and check 2", function() {
    let ourgenerated = presence.parsepidfxml( "application/pidf+xml", presence.genpidfxml( "1000@bling.babblevoice.com", "closed", "Talk 077660000111", "on-the-phone" ) )
    expect( ourgenerated.dnd ).to.be.false
    expect( ourgenerated.onthephone ).to.be.true
    expect( ourgenerated.status ).to.equal( "open" )
    expect( ourgenerated.note ).to.equal( "Talk 077660000111" )
  } )
} )