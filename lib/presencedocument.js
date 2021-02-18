

const xmlparser = require( "fast-xml-parser" )
const he = require( "he" )
const j2x = require( "fast-xml-parser" ).j2xParser


const xmlparseroptions = {
    attributeNamePrefix : "",
    attrNodeName: "attr",
    textNodeName : "#text",
    ignoreAttributes : false,
    ignoreNameSpace : false,
    allowBooleanAttributes : false,
    parseNodeValue : true,
    parseAttributeValue : false,
    trimValues: true,
    cdataTagName: "__cdata",
    cdataPositionChar: "\\c",
    parseTrueNumberOnly: false,
    arrayMode: false, //"strict"
    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
    tagValueProcessor : (val, tagName) => he.decode(val), //default is a=>a
    stopNodes: ["parse-me-as-string"]
}

let j2xparser = new j2x( xmlparseroptions )

function objtoxml( obj ) {
  return j2xparser.parse( obj )
}

function xmltoobj( xml ) {
  return xmlparser.parse( xml, xmlparseroptions )
}

/*
# parsepidfxml

Util function to look at pidf+xml docs and pull out information into
status and note.

contenttype ENUM{ "application/pidf+xml", "application/xpidf+xml" }
Then the xml is parsed for the informating in the relavent place.

"application/xpidf+xml" is specific to Polycom.

Return { status, note, dnd } on success or false on failure.
status and not we pull out of the xml from the most relavent place. dnd we
attempt to get the most relavent place. dnd = true will instruct our
callmanager (or other lib) should not attempt to place a call to this client.

According to RFC 3863 status (in tuple.status) should be used to indicated
if the UA can receive instant message. It is not clear if an INVITE is an instant
message and so far different clients I have seen interprit this differently.

Note, watch out for the difference between on-the-phone and busy. Busy is the same
as DND, and wilst the user may be busy with a phone call we can place further phone
calls to that UA. Althoughe almost will certainly derive on the phone from our own dialog
info.
*/
module.exports.parsepidfxml = ( contenttype, xml ) => {

  let xpidobj
  try {
    xpidobj = xmltoobj( xml )
  } catch( error ) {
    return false
  }

  if( typeof xpidobj === 'object' && xpidobj !== null ) {
    if( "application/pidf+xml" === contenttype ) {
      /* Favur RFC 8440 */
      if( "dm:person" in xpidobj.presence ) {

        let busy = !( "rpid:activities" in xpidobj.presence[ "dm:person" ] ) ||
                    "rpid:permanent-absence" in xpidobj.presence[ "dm:person" ][ "rpid:activities" ] ||
                    "rpid:busy" in xpidobj.presence[ "dm:person" ][ "rpid:activities" ]

        let onthephone = false
        let note = xpidobj.presence.tuple.note===undefined?"":xpidobj.presence.tuple.note

        if( xpidobj.presence[ "dm:person" ][ "rpid:activities" ] !== undefined ) {
          onthephone = "rpid:on-the-phone" in xpidobj.presence[ "dm:person" ][ "rpid:activities" ]

          if( "dm:note" in xpidobj.presence[ "dm:person" ][ "rpid:activities" ] ) {
            note =  xpidobj.presence[ "dm:person" ][ "rpid:activities" ][ "dm:note" ]
          }
        }

        return {
          "status": busy?"closed":"open",
          "note": note,
          "dnd": busy,
          "onthephone": onthephone
        }
      }

      /*
      RFC 3863 states we SHOULD NOT (but not MUST not) use the note to determin status,
      but in some cases this is the only way. Phones which have supported RFC 8440 should
      really think about it!
      */
      let lownote = xpidobj.presence.tuple.note.toLowerCase()
      return {
        "status": xpidobj.presence.tuple.status.basic,
        "note": xpidobj.presence.tuple.note,
        "dnd": "closed" == xpidobj.presence.tuple.status.basic || "dnd" == lownote || "busy" == lownote,
        "onthephone": "away" == lownote || "on the phone" == lownote
      }
    } else if ( "application/xpidf+xml" === contenttype ) {

      return {
        "status": xpidobj.presence.atom.address.status.attr.status,
        "note": xpidobj.presence.atom.address.msnsubstatus.attr.substatus,
        "dnd": "busy" == xpidobj.presence.atom.address.msnsubstatus.attr.substatus.toLowerCase(),
        "onthephone": "inuse" === xpidobj.presence.atom.address.status.attr.status
      }
    }
  }

  return false
}


/*
`<?xml version="1.0" encoding="ISO-8859-1"?>
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

With pottential:
<rpid:activities>
<rpid:%s/>
</rpid:activities>

activity is one of (taken from RFC 4480)
on-the-phone
busy
permanent-absence

(Not there are other activities - but these appear the most appropriate and suitable for us.)
*/
module.exports.genpidfxml = ( entity,
                              open = "open" /* open|closed */,
                              note = "", /* Note and extended note, i.e. Talk 077660000111 */
                              activity = "", /* on-the-phone|busy|permanent-absence*/ ) => {

  let presdoc = {
    "presence": {
      "attr": {
        "xmlns": "urn:ietf:params:xml:ns:pidf",
        "xmlns:dm": "urn:ietf:params:xml:ns:pidf:data-model",
        "xmlns:rpid": "urn:ietf:params:xml:ns:pidf:rpid",
        "xmlns:c": "urn:ietf:params:xml:ns:pidf:cipid",
        "entity": "sip:" + entity
      },
      "tuple": {
        "attr": { "id": "t6a5ed77e" },
        "status": {
          "basic": {
            "#text": open
          }
        }
      },
      "dm:person": {
        "attr": {
          "id": "p06360c4a"
        }
      }
    }
  }

  if( note.length > 0 ) {
    presdoc.presence.tuple.status.note = note
  }

  if( activity.length > 0 ) {
    let rpidactivity = {}
    rpidactivity[ "rpid:" + activity ] = null
    presdoc.presence[ "dm:person" ][ "rpid:activities" ] = rpidactivity
    presdoc.presence[ "dm:person" ][ "rpid:activities" ][ "dm:note" ] = note
  }


  return j2xparser.parse( presdoc )

}


/*
  This function is our creator function from RFC 4235.

  <dialog-info xmlns="urn:ietf:params:xml:ns:dialog-info"
   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
   xsi:schemaLocation="urn:ietf:params:xml:ns:dialog-info"
   version="1" state="full">
  </dialog-info>

  A dialog element is
  <dialog id="123456">
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
   </dialog>

   <dialog id="123">
    <state>confirmed</state>
    <duration>274</duration>
    <local>
      <identity display="Alice">sip:alice@example.com</identity>
      <target uri="sip:bobster@phone21.example.org"></target>
    </local>
    <remote>
      <identity display="Bob">sip:bob@example.org</identity>
      <target uri="ip:bobster@phone21.example.org"></target>
    </remote>
  </dialog>
*/
module.exports.createdialoginfoxml = ( version, state /*full|partial*/, entity, display, call ) => {

  if( undefined === call ) {
    return j2xparser.parse( {
      "dialog-info": {
        "attr": {
          "xmlns": "urn:ietf:params:xml:ns:dialog-info",
          "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
          "xsi:schemaLocation": "urn:ietf:params:xml:ns:dialog-info",
          "version": ""+version,
          "state": state
        }
      }
    } )
  }

  return j2xparser.parse( {
    "dialog-info": {
      "attr": {
        "xmlns": "urn:ietf:params:xml:ns:dialog-info",
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xsi:schemaLocation": "urn:ietf:params:xml:ns:dialog-info",
        "version": ""+version,
        "state": state
      },
      "dialog": {
        "attr": {
          "id": call.sip.callid,
          "direction": call.direction
        },
        "state": call.statestr,
        "duration": call.duration,
        "local": {
          "identity": {
            "attr": {
              "display": display
            },
            "#text": "sip:" + entity
          },
          "target": {
            "attr": {
              "uri": "sip:" + entity
            },
            "param": {
              "pname": "sip.rendering",
              "pval": call.hasmedia?"yes":"no" /* used for hold as well as to inidicate media transmitting */
            }
          }
        },
        "remote": {
          "identity": {
            "attr": {
                "display": call.remote.display
              },
            "#text": "sip:" + call.remote.uri
          },
          "target": {
            "attr": {
              "uri": "sip:**" + entity
            }
          }
        }
      }
    }
  } )
}
