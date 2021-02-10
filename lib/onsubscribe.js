/*
This next section listen for SUBSCRIBE requests which we will auth then accept.
We then need to maintain a list of targets the request is asking for events for.

We allow a subscriber to subscribe to anything, but they simply may not get notifies
about stuff which is unnotifiable.

When we receive a SUBSCRIBE it will request a subscription against a resource.
The resource could be another user (and their REGISTERED state etc) or something like
a parking lot, call queue etc.

The UAC also might be SUBSCRIBing to itself to receive information regarding voicemail.
*/

const parseuri = require( "drachtio-srf" ).parseUri
const digestauth = require( "drachtio-mw-digest-auth" )

/*
TODO - finsh me.
Store Subscriptions from clients (the client is the subscriber).
This means we need to store the dialog against the callid and
entity.
Only created if we have a subscription to add.
*/
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

let subscriptions
let subscriptioncount = 0
function storesubscription( entity, dialog ) {
  if( undefined === subscriptions ) {
    subscriptions = new Map()
  }

  if( subscriptions.has( entity ) ) {
    subscriptions.get( entity ).add( dialog )
  } else {
    subscriptions.set( entity, new SubscriptionCollection( dialog ) )
  }

  subscriptioncount++
  console.log( `${subscriptioncount} subscriptions` )
}

function removesubscription( entity, dialog ) {
  if( subscriptions.has( entity ) ) {
    let sub = subscriptions.get( entity )
    sub.remove( dialog )
    if( 0 === sub.size ) {
      subscriptions.delete( entity )
    }

    subscriptioncount--
    console.log( `${subscriptioncount} subscriptions` )
  }
}

/*Internal use funtion to be used when we receive a SUBSCRIBE request
and are required to send out an initial NOTIFY.
*/
function notifyme( entity, contenttype, expires, options, dialog ) {
  /*
    Subscription-State, can also contain ;expires=60
  */

  let state = 0===expires?"terminated":"active"
  let opts = {
    "method": "NOTIFY",
    "headers": {
      "Subscription-State": state + ";expires=" + expires,
      "Content-Type": contenttype
    }
  }

  if( "application/simple-message-summary" === contenttype ) {

    opts.headers[ "Event" ] = "message-summary"

    options.voicemailLookup( entity, ( newcount, oldcount, newurgent, oldurgent ) => {
      let waiting =  newcount>0?"yes":"no"

      opts.body = `Messages-Waiting: ${waiting}
Message-Account: sip:${entity}
Voice-Message: ${newcount}/${oldcount} (${newurgent}/${oldurgent})
`
      dialog.request( opts )
    } )
  }
}

module.exports.use = ( options ) => {

  return ( req, res ) => {
    if ( req.method !== "SUBSCRIBE" ) return next()

    let toparts = parseuri( req.getParsedHeader( "To" ).uri )

    digestauth( {
      proxy: true, /* 407 or 401 */
      passwordLookup: options.passwordLookup,
      realm: toparts.host
    } )( req, res, () => {
      let authedtoparts = parseuri( req.getParsedHeader( "To" ).uri )

      /* We only (currently) support subscription within a domain */
      if( req.authorization.realm !== authedtoparts.host ) {
        res.send( 403 /* Forbidden */ )
        return
      }

      /* We have been authed */
      let formats = req.get( "Accept" ).split( /[,|\s|;]+/ )
      /* Be explicit - we might want to look at application/simple-message-summary also (voicemail - message waiting etc) */
      /* Also look at application/dialog-info+xml - it looks like much more detail. */
      let acceptedformats = []
      formats.forEach( ( el ) => {
        switch( el ) {
          case "application/dialog-info+xml":
          case "application/xpidf+xml":
          case "application/pidf+xml":
          case "application/simple-message-summary":
            acceptedformats.push( el )
        }
      } )

      if( 0 === acceptedformats.length ) {
        res.send( 406 /* Not Acceptable */ )
        return
      }

      options.srf.createUAS( req, res, {
        headers: {
          "Accept": acceptedformats.join( ", " )
        }
      } )
        .then( ( dialog ) => {

          let entity = authedtoparts.user + "@" + authedtoparts.host
          console.log( `${req.authorization.username}@${req.authorization.realm} subscribing to ${entity} for ${formats}` )

          let expires = parseInt( req.get( "Expires" ) )
          if( NaN === expires ) {
            expires = 0
          }

          if ( 0 === expires ) {
            removesubscription( entity, dialog )
          } else {
            storesubscription( entity, dialog )
          }

          acceptedformats.forEach( ( ct ) => {
            notifyme( entity, ct, expires, options, dialog )
          } )

          dialog.on( "destroy", ( dialog ) => {
            removesubscription( entity, dialog )
          } )
        } )
    } )
  }
}

/*
Function to notify all SUBSCRIBEd users with a document. Messages from other UACs OR
from our own system - for example if we wish to publish information regarding a parking lot.

entity = user@realm, i.e. 1000@bling.babblevoice.com
*/
module.exports.notify = ( entity, contenttype, message ) => {

}

/* TODO */
module.exports.voicemail = ( entity ) => {

}
