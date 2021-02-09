/*
# dosubscribe.js

This file responds to REGISTER events from our Registrar object. When we have a UAC
register to us, we then SUBSCRIBE to the client to pick up on information

* DND
*/

const digestauth = require( "drachtio-mw-digest-auth" )
const doc = require( "./presencedocument.js" )
const assert = require( "assert" )

const expiresmatch = /expires=(\d*)/
const activematch = /^active/

let subscribeperregister

function addregsub( reg, dialog ) {
  subscribeperregister.set( reg.uuid, new RegSubscription( dialog ) )
}

function hasregsub( reg ) {
  return subscribeperregister.has( reg.uuid )
}

function deleteregsub( reg ) {
  subscribeperregister.delete( reg.uuid )
}

function refreshregsub( reg ) {
  if( subscribeperregister.has( reg.uuid ) ) {
    let sub = subscribeperregister.get( reg.uuid )

    let opts = {
      "method": "SUBSCRIBE",
      "headers": {
        "Event": "presence",
        "Expires": reg.expiresin,
        "Accept": "application/dialog-info+xml, application/xpidf+xml, application/pidf+xml"
      }
    }

    sub.dialog.request( opts )
      .then( () => {
        console.log( "Wahoo - refreshed subscription" )
      } )
      .catch( () => {
        console.log( "Bad things be here" )
      } )
  }

  return false
}

/*
Store dialogs per registeration.
*/
class RegSubscription {
  constructor( dialog ) {
    this.dialog = dialog
  }
}

/* TODO */
module.exports.unreg = ( options ) => {
  assert( options.em !== undefined )
  if( undefined === subscribeperregister ) subscribeperregister = new Map()

  return ( reg ) => {
    deleteregsub( reg )
  }
}

module.exports.reg = ( options ) => {

  assert( options.em !== undefined )
  if( undefined === subscribeperregister ) subscribeperregister = new Map()

  return ( reg ) => {

    if( !reg.allow.includes( "SUBSCRIBE" ) ) {
      console.error( "Client doesn't allow subscribing - so ignoring" )
      return
    }

    if( hasregsub( reg ) ) {
      /* This is a renewal of the reg so can be used to trigger refresh on sub dialog */
      refreshregsub( reg )
      return
    }

    options.srf.createUAC( reg.contacts[ 0 ], {
      "method": "SUBSCRIBE",
      "headers": {
        "To": `<sip:${reg.authorization.username}@${reg.authorization.realm}>`,
        "From": `<sip:${reg.authorization.username}@${reg.authorization.realm}>`,
        "Event": "presence",
        "Expires": reg.expiresin,
        "Accept": "application/dialog-info+xml, application/xpidf+xml, application/pidf+xml"
      }
    } ).then( ( dialog ) => {

      addregsub( reg, dialog )

      dialog.on( "destroy", () => {
        deleteregsub( reg )
        console.log( "Remote party ended subscribe dialog" )
      } )

      dialog.on( "notify", ( req, res ) => {

        digestauth( {
          proxy: true, /* 407 or 401 */
          passwordLookup: options.passwordLookup,
          realm: reg.authorization.realm
        } )( req, res, () => {

          /*
            Should be active and possibly contain ;expires= where 0 expires the subscription.
          */
          let substate = req.get( "Subscription-State" )
          if( null === substate.match( activematch ) ) {
            res.send( 400 )
            return
          }

          let expires = substate.match( expiresmatch )
          if( null !== expires && expires.length > 1 ) {
            if( "0" == expires[ 1 ] ) {
              deleteregsub( reg )
            }
          }

          /* We are now authed */
          let s = doc.parsepidfxml( req.get( "Content-Type" ), req.body )
          if( false === s ) {
            res.send( 400 /* Bad request - or at least we don't understand it */ )
          } else {

            options.em.emit( "presence", {
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
  }
}
