
const expect = require( "chai" ).expect
const presence = require( "../../lib/presencedocument.js" )

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
On an outbound call, from Zoiper to my mobile, this is sent - although it is clipped.
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

    const zoip = presence.parsepidfxml( "application/pidf+xml", zoiper5publish )

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

    const poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )

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

    const poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )
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

    const poly = presence.parsepidfxml( "application/xpidf+xml", polycomvvx101 )
    expect( poly.onthephone ).to.be.true
    expect ( poly.dnd ).to.be.true
  } )

  it( "Generate pdif parse and check 1", function() {
    const ourxml = presence.genpidfxml( "1000@bling.babblevoice.com", "closed" )
    const ourgenerated = presence.parsepidfxml( "application/pidf+xml", ourxml )

    expect( ourxml ).to.equal( "<?xml version=\"1.0\" encoding=\"UTF-8\"?><presence xmlns=\"urn:ietf:params:xml:ns:pidf\" xmlns:dm=\"urn:ietf:params:xml:ns:pidf:data-model\" xmlns:rpid=\"urn:ietf:params:xml:ns:pidf:rpid\" xmlns:c=\"urn:ietf:params:xml:ns:pidf:cipid\" entity=\"sip:1000@bling.babblevoice.com\"><tuple id=\"t6a5ed77e\"><status><basic>closed</basic></status></tuple><dm:person id=\"p06360c4a\"></dm:person></presence>" )
    expect( ourgenerated.dnd ).to.be.true
    expect( ourgenerated.onthephone ).to.be.false
    expect( ourgenerated.status ).to.equal( "closed" )
  } )

  it( "Generate pdif parse and check 2", function() {
    const ourgenerated = presence.parsepidfxml( "application/pidf+xml", presence.genpidfxml( "1000@bling.babblevoice.com", "closed", "Talk 077660000111", "on-the-phone" ) )
    expect( ourgenerated.dnd ).to.be.false
    expect( ourgenerated.onthephone ).to.be.true
    expect( ourgenerated.status ).to.equal( "open" )
    expect( ourgenerated.note ).to.equal( "Talk 077660000111" )
  } )
} )