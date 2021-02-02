'use strict'


const assert = require( "assert" )
const events = require( "events" )

const digestauth = require( "drachtio-mw-digest-auth" )
const regparser = require( "drachtio-mw-registration-parser" )

const crypto = require( "crypto" )

var parseString = require( "xml2js" ).parseString


const defaultoptions = {
  /* When a client registers - we subsribe to their status if they support it */
  "subscribeonregister": true
}


class Presence {
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

    this.authdigest = digestauth( {
      proxy: true, /* 407 or 401 */
      passwordLookup: options.passwordLookup
    } )


    if ( this.options.subscribeonregister &&
          undefined !== this.options.registrar &&
          undefined !== this.options.srf ) {

      this.options.registrar.on( "register", ( reg ) => {

        if( !reg.allow.includes( "SUBSCRIBE" ) ) {
          console.log( "Client doesn't allow subscribing - so ignoring" )
          return
        }

        let da = digestauth( {
          proxy: true, /* 407 or 401 */
          passwordLookup: options.passwordLookup,
          realm: reg.authorization.realm
        } )

        this.options.srf.createUAC( reg.contacts[ 0 ], {
          "method": "SUBSCRIBE",
          "headers": {
            "Event": "presence",
            "Expires": reg.expiresin,
            "Accept": "application/dialog-info+xml, application/xpidf+xml"
          }
        } ).then( ( dialog ) => {

          dialog.on( "destroy", () => console.log( "Remote party ended subscribe dialog" ) )

          dialog.on( "notify", ( req, res ) => {


            da( req, res, () => {

              console.log( "notify authed" )
              res.send( 200 )

              console.log( `Received NOTIFY for event ${req.get( 'Event' )}` )
              if (req.body) {
                console.log( `Received content of type ${req.get('Content-Type')}: ${req.body}` )
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

    this.options.srf.use( "subscribe", ( req, res ) => {
      if ( req.method !== "SUBSCRIBE" ) return next()

      let authed = false
      this.authdigest( req, res, () => {
        authed = true
      } )
      if ( !authed ) {
        return
      }

      console.log( "We received a subscribe" )
      this.options.srf.createUAS( req, res, {
        headers: {
           /* Be explicit - we might want to look at application/simple-message-summary also */
           /* Also look at application/dialog-info+xml - it looks like much more detail. */
          "Accept": "application/pidf+xml"
        }
      } )
        .then( ( dialog ) => {
          console.log( "We have accepted the subscribe " )
        } )
    } )

    this.options.srf.use( "publish", ( req, res, next ) => {

      if ( req.method !== "PUBLISH" ) return next()
      return next()


      this.authdigest( req, res, () => {
        if( "application/pidf+xml" === req.get( "Content-Type" ) ) {

          console.log( req.get( "To" ) )
          parseString( req.body, ( err, res ) => {

            console.log( res.presence.tuple[ 0 ].status[ 0 ].basic[ 0 ] )
            console.log( res.presence.tuple[ 0 ].note[ 0 ] )

          } )
        }

        let ifmatch = req.get( "sip-if-match" )
        /* find our existing PUBLISH event */

        //if( undefined === ifmatch ) {
          //ifmatch =
        //}

        res.send( 200, {
          headers: {
            "Expires": Math.min( req.get( "expires" ), 3600 ),
            "SIP-ETag": crypto.randomBytes( 16 ).toString( "hex" )
          }
        } )
      } )
    } )
  }
}


module.exports = Presence
