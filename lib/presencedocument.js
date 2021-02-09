

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
Then the xml is parsed for the informatin in the relavent place.

Return { status, note } on sucsess or false on failure.
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
      return {
        "status": xpidobj.presence.tuple.status.basic,
        "note": xpidobj.presence.tuple.note
      }
    } else if ( "application/xpidf+xml" === contenttype ) {

      return {
        "status": xpidobj.presence.atom.address.status.attr.status,
        "note": xpidobj.presence.atom.address.msnsubstatus.attr.substatus
      }
    }
  }

  return false
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
function createdialoginfoxml() {
  let di = {
    "dialog-info": {
      "attr": {
        "xmlns": "urn:ietf:params:xml:ns:dialog-info",
        "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
        "xsi:schemaLocation": "urn:ietf:params:xml:ns:dialog-info",
        "version": "1",
        "state": "full"
      },
    }
  }

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

  let xml = j2xparser.parse( di )
}
