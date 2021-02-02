'use strict'


const assert = require( "assert" )
const events = require( "events" )

const parseuri = require( "drachtio-srf" ).parseUri
const digestauth = require( "drachtio-mw-digest-auth" )

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
            "Accept": "application/dialog-info+xml, application/xpidf+xml, application/pidf+xml"
          }
        } ).then( ( dialog ) => {

          dialog.on( "destroy", () => console.log( "Remote party ended subscribe dialog" ) )

          dialog.on( "notify", ( req, res ) => {

            da( req, res, () => {
              /* We are now authed */
              if( this.parsepidfxml( req, res ) ) {
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

      this.authdigest( req, res, () => {
        if( this.parsepidfxml( req, res ) ) {
          let ifmatch = req.get( "sip-if-match" )

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
    Not all clients set the To field correctly. So we have to use the auth
    credentials instead which we can rely on.

    req.authorization.username, req.authorization.realm
  */
  parsepidfxml( req, res ) {
    let ct = req.get( "Content-Type" )
    let toparts = parseuri( req.getParsedHeader( "To" ).uri )

    let understood = false
    parseString( req.body, ( err, res ) => {
      if( undefined !== res ) {
        if( "application/pidf+xml" === ct ) {

          /*
            Tested with Zoiper5
            Notes, when the mouse leaves Zoiper (on Linux) we get a note of 'Away'
            So, the previous note matters. If you set the status to Busy then we get
            'Busy' followed by 'Away' (in seperate messages) as the mouse leaves
            the application.
          */

          this.em.emit( "presence", {
            "username": req.authorization.username,
            "realm": req.authorization.realm,
            "status": res.presence.tuple[ 0 ].status[ 0 ].basic[ 0 ],
            "note": res.presence.tuple[ 0 ].note[ 0 ]
          } )

          understood = true

        } else if ( "application/xpidf+xml" === ct ) {
          /*
            Tested with Polycom VVX 101 5.9.5.0614
            status = 'open'
            substatus= 'online'

            When DND is enabled
          */
          this.em.emit( "presence", {
            "username": req.authorization.username,
            "realm": req.authorization.realm,
            "status": res.presence.atom[ 0 ].address[ 0 ].status[ 0 ][ "$" ].status,
            "note": res.presence.atom[ 0 ].address[ 0 ].msnsubstatus[ 0 ][ "$" ].substatus
          } )

          understood = true
        }
      }
    } )

    if( !understood ) {
      res.send( 400 /* Bad request - or at least we don't understand it */ )
      return false
    }

    return true
  }
}


module.exports = Presence
