'use strict'


const assert = require( "assert" )
const events = require( "events" )

const parseuri = require( "drachtio-srf" ).parseUri
const digestauth = require( "drachtio-mw-digest-auth" )

const crypto = require( "crypto" )


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


const defaultoptions = {
  /* When a client registers - we subsribe to their status if they support it */
  "subscribeonregister": true
}

/* Only created if we have a subscription to add */
class SubscriptionCollection {
  constructor( dialog ) {
    this.subscriptions = [ dialog ]
  }

  add( dialog ) {
    this.subscriptions.push( dialog )
  }

  remove( dialog ) {
    let index = this.subscriptions.findIndex( ( sub ) => {
      if( sub.id === dialog.id ) {
        return true
      }
      return false
    } )

    if ( -1 !== index ) {
      this.subscriptions.splice( index, 1 )
    }
  }

  get size() {
    return this.subscriptions.size()
  }
}

let PrivatePresence = {}

class Presence {

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
  */
  createdialoginfoxml() {
    let di = {
      "dialog-info": {
        $: {
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
        $: { "id": "123" },
        _: {
          "state": "confirmed",
          "duration": 274,
          "local": {
            "identity": {
              $: {
                "display": ""
              },
              _: ""
            },
            "target": {
            }
          },
          "remote": {
            "identity": {
            },
            "target": {
            }
          }
        }
      }
    }

    let xml = PrivatePresence.builder.buildObject( di )
  }

  sendnotify( user, realm, callinfo ) {

  }

  /*
    As well as options referenced in default options

    srf: the main drachtio srf object
    r: a registrar object to receive registrations from
    cm: call manager object to receive notifs regarding calls from
  */
  constructor( options ) {

    this.options = {
      ...defaultoptions,
      ...options
    }

    if( undefined === this.options.srf ) {
      assert( "You must supply an SRF object" )
      return
    }

    /*
      Indexed by user@domain, each should then contain an array of subscriptions.
      When we remove subscriptions,
    */
    this.subscriptions = new Map()

    /*
      This next section listen for SUBSCRIBE requests which we can auth then accept.
      We then need to maintain a list of targets the request is asking for events for.

      We allow a subscriber to subscribe to anything, but they simply may not get notifies
      about stuff which is unnotifiable.
    */
    this.options.srf.use( "subscribe", ( req, res ) => {
      if ( req.method !== "SUBSCRIBE" ) return next()

      let toparts = parseuri( req.getParsedHeader( "To" ).uri )

      digestauth( {
        proxy: true, /* 407 or 401 */
        passwordLookup: this.options.passwordLookup,
        realm: toparts.host
      } )( req, res, () => {
        /* We have been authed */
        let authedtoparts = parseuri( req.getParsedHeader( "To" ).uri )

        this.options.srf.createUAS( req, res, {
          headers: {
             /* Be explicit - we might want to look at application/simple-message-summary also */
             /* Also look at application/dialog-info+xml - it looks like much more detail. */
            "Accept": "application/dialog-info+xml, application/xpidf+xml, application/pidf+xml"
          }
        } )
          .then( ( dialog ) => {
            let key = authedtoparts.user + "@" + authedtoparts.host
            console.log( "We have accepted the subscribe " )

            if( this.subscriptions.has( key ) ) {
              this.subscriptions.get( key ).add( dialog )
            } else {
              this.subscriptions.set( key, new SubscriptionCollection( dialog ) )
            }

            dialog.on( "destroy", ( dialog ) => {

              let subsc = this.subscriptions.get( key )
              subc.remove( dialog )
              if( 0 === subc.size ) {
                this.subscriptions.delete( key )
              }
            } )
          } )
      } )
    } )

    /*
      This next section is listening to our registrar for registrations then
      creating a subscription to that client to obtain state about the phone.
    */
    if ( this.options.subscribeonregister &&
          undefined !== this.options.registrar ) {

      this.options.registrar.on( "register", ( reg ) => {

        if( !reg.initial ) {
          /* This is a renewal of the reg so can be ignored */
          console.log( "REGISTER refresh - no new SUBSCRIBE needed" )
          return
        }

        if( !reg.allow.includes( "SUBSCRIBE" ) ) {
          console.log( "Client doesn't allow subscribing - so ignoring" )
          return
        }

        this.options.srf.createUAC( reg.contacts[ 0 ], {
          "method": "SUBSCRIBE",
          "headers": {
            "Event": "presence",
            "Expires": reg.expiresin,
            "Accept": "application/dialog-info+xml, application/xpidf+xml, application/pidf+xml"
          }
        } ).then( ( dialog ) => {

          dialog.on( "destroy", () => console.log( "Remote party ended subscribe dialog" ) )

          dialog.on( "notify", ( req, res ) => {

            digestauth( {
              proxy: true, /* 407 or 401 */
              passwordLookup: this.options.passwordLookup,
              realm: reg.authorization.realm
            } )( req, res, () => {
              /* We are now authed */
              let s = this.parsepidfxml( req.get( "Content-Type" ), req.body )
              if( false === s ) {
                res.send( 400 /* Bad request - or at least we don't understand it */ )
              } else {

                this.em.emit( "presence", {
                  ...s,
                  ...{
                    "username": req.authorization.username,
                    "realm": req.authorization.realm,
                    "source": "NOTIFY"
                  }
                } )

                res.send( 200 )
              }
            } )
          } )
        } ).catch( ( err ) => {
          console.log( "Error with creating client subscription" )
          console.error( err )
        } )
      } )

      /* Remove any subscriptions we have on the phone */
      this.options.registrar.on( "unregister", ( reg ) => {

      } )
    }

    this.options.srf.use( "publish", ( req, res, next ) => {

      if ( req.method !== "PUBLISH" ) return next()

      let toparts = parseuri( req.getParsedHeader( "To" ).uri )
      digestauth( {
        proxy: true, /* 407 or 401 */
        passwordLookup: this.options.passwordLookup,
        realm: toparts.host
      } )( req, res, () => {
        let pub = this.parsepidfxml( req.get( "Content-Type" ), req.body )
        if( false === pub ) {
          res.send( 400 /* Bad request - or at least we don't understand it */ )
        } else {
          this.em.emit( "presence", {
            ...pub,
            ...{
              "username": req.authorization.username,
              "realm": req.authorization.realm,
              "source": "PUBLISH"
            }
          } )

          let ifmatch = req.get( "sip-if-match" )
          /* ifmatch references the e-tag we issued in the last 200 */
          res.send( 200, {
            headers: {
              "Expires": Math.min( req.get( "expires" ), 3600 ),
              "SIP-ETag": crypto.randomBytes( 16 ).toString( "hex" )
            }
          } )
        }
      } )
    } )

    this.em = new events.EventEmitter()
  }

  on( ev, cb ) {
    this.em.on( ev, cb )
  }

  /*
    contenttype ENUM{ "application/pidf+xml", "application/xpidf+xml" }
    Then the xml is parsed for the informatin in the relavent place.
  */
  parsepidfxml( contenttype, xml ) {

    let xpidobj = xmlparser.parse( xml, xmlparseroptions )

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
}


module.exports = Presence
