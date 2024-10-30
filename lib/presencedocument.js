
const { XMLParser, XMLBuilder } = require( "fast-xml-parser" )

/**
 * 
 * @param { object } obj 
 * @returns { string | false }
 */
function objtoxml( obj ) {
  try {
    const builder = new XMLBuilder( {
      ignoreAttributes : false,
      attributeNamePrefix: "_"
    } )
    return builder.build( obj )
  } catch( error ) {
    console.error( "Cannot create XML", error )
    return false
  }
}

/**
 * 
 * @param { string } xml 
 * @returns { object | false }
 */
function xmltoobj( xml ) {
  try {
    const xmlparser = new XMLParser( {
      ignoreAttributes : false,
      attributeNamePrefix: "_"
    } )
    return xmlparser.parse( xml )
  } catch( error ) {
    console.error( "Bad XML", error )
    return false
  }
}

/**
 * 
 * @param { object } xpidobj 
 * @returns { object }
 */
function parseperson( xpidobj ) {
  const busy = !( "rpid:activities" in xpidobj.presence[ "dm:person" ] ) ||
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

function parsexmlpdif( xpidobj ) {
  /* Favur RFC 8440 */
  if( "dm:person" in xpidobj.presence ) {
    return parseperson( xpidobj )
  }

  /*
  RFC 3863 states we SHOULD NOT (but not MUST not) use the note to determin status,
  but in some cases this is the only way. Phones which have supported RFC 8440 should
  really think about it!
  */
  const lownote = xpidobj.presence.tuple.note.toLowerCase()
  return {
    "status": xpidobj.presence.tuple.status.basic,
    "note": xpidobj.presence.tuple.note,
    "dnd": "closed" == xpidobj.presence.tuple.status.basic || "dnd" == lownote || "busy" == lownote,
    "onthephone": "away" == lownote || "on the phone" == lownote
  }
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

  const xpidobj = xmltoobj( xml )

  if( "object" === typeof xpidobj && null !== xpidobj ) {
    if( "application/pidf+xml" === contenttype ) {
      return parsexmlpdif( xpidobj )
    } else if ( "application/xpidf+xml" === contenttype ) {
      return {
        "status": xpidobj.presence.atom.address.status._status,
        "note": xpidobj.presence.atom.address.msnsubstatus._substatus,
        "dnd": "busy" == xpidobj.presence.atom.address.msnsubstatus._substatus.toLowerCase(),
        "onthephone": "inuse" === xpidobj.presence.atom.address.status._status
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
/**
 * 
 * @param { string } entity 
 * @param { "open" | "closed" } status 
 * @param { string } note - an extended note, i.e. Talk 077660000111
 * @param { "on-the-phone"|"busy"|"permanent-absence"|string } activity 
 * @returns 
 */
module.exports.genpidfxml = ( entity, status = "open", note = "", activity = "" ) => {

  const presdoc = {
    "presence": {
      "_xmlns": "urn:ietf:params:xml:ns:pidf",
      "_xmlns:dm": "urn:ietf:params:xml:ns:pidf:data-model",
      "_xmlns:rpid": "urn:ietf:params:xml:ns:pidf:rpid",
      "_xmlns:c": "urn:ietf:params:xml:ns:pidf:cipid",
      "_entity": "sip:" + entity,
      "tuple": {
        "_id": "t6a5ed77e",
        "status": {
          "basic": {
            "#text": status
          }
        }
      },
      "dm:person": {
        "_id": "p06360c4a"
      }
    }
  }

  if( 0 < note.length ) {
    presdoc.presence.tuple.status.note = note
  }

  if( 0 < activity.length ) {
    const rpidactivity = {}
    rpidactivity[ "rpid:" + activity ] = null
    presdoc.presence[ "dm:person" ][ "rpid:activities" ] = rpidactivity
    presdoc.presence[ "dm:person" ][ "rpid:activities" ][ "dm:note" ] = note
  }

  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + objtoxml( presdoc )
}

/**
 * 
 * @param { string } entity 
 * @param { "Available" | "Busy" | "Away" | "Offline" | "Do Not Disturb" | "In a Meeting" | "Out of Office" } note 
 * @param { "open" | "closed" } status 
 * @param { "onthephone" | "online" | "busy" | "away" } substatus
 * @returns 
 */
module.exports.genxpidfxml = ( entity, status = "closed" , note = "Offline", substatus = "away" ) => {

  const presdoc = {
    "presence": {
      "status": {
        "note": note
      },
      "presentity": {
        "_uri": "sip:" + entity + ";method=SUBSCRIBE"
      },
      "atom": {
        "_id": entity,
        "address": {
          "_uri": entity + ";user=ip",
          "_priority": "0.800000",
          "status": {
            "_status": status,
          },
          "msnsubstatus": {
            "_substatus": substatus
          }
        }
      }
    }
  }

  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE presence PUBLIC \"-//IETF//DTD RFCxxxx XPIDF 1.0//EN\" \"xpidf.dtd\">" + objtoxml( presdoc ) + "\n"
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
/**
 * 
 * @param { number } version 
 * @param { "full" | "partial" } state 
 * @param { string } entity 
 * @param { string } display 
 * @param { object } [ call ]
 * @param { object } call.sip
 * @param { string } call.sip.callid
 * @param { string } call.direction
 * @param { string } call.state
 * @param { number } call.duration
 * @param { object } call.remote
 * @param { string } call.remote.display
 * @param { string } call.remote.uri
 * @param { boolean } call.hasmedia
 * @returns 
 */
module.exports.createdialoginfoxml = ( version, state, entity, display, call ) => {

  if( undefined === call ) {
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + objtoxml( {
      "dialog-info": {
        "_xmlns": "urn:ietf:params:xml:ns:dialog-info",
        //"_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        //"_xsi:schemaLocation": "urn:ietf:params:xml:ns:dialog-info",
        "_version": ""+version,
        "_state": state,
        "_entity": "sip:" + entity
      }
    } )
  }

  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" + objtoxml( {
    "dialog-info": {
      "_xmlns": "urn:ietf:params:xml:ns:dialog-info",
      //"_xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
      //"_xsi:schemaLocation": "urn:ietf:params:xml:ns:dialog-info",
      "_version": ""+version,
      "_state": state,
      "_entity": "sip:" + entity,
      "dialog": {
        "_id": call.sip.callid,
        "_direction": call.direction,
        "state": call.state,
        "duration": call.duration,
        "local": {
          "identity": {
            "_display": display,
            "#text": "sip:" + entity
          },
          "target": {
            "_uri": "sip:" + entity,
            "param": {
              "pname": "sip.rendering",
              "pval": call.hasmedia?"yes":"no" /* used for hold as well as to inidicate media transmitting */
            }
          }
        },
        "remote": {
          "identity": {
            "_display": call.remote.display,
            "#text": "sip:" + call.remote.uri
          },
          "target": {
            "_uri": "sip:**" + entity
          }
        }
      }
    }
  } )
}
