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

class Subscription {
  constructor( parent, entity, dialog, expires ) {
    this.entity = entity
    this.dialog = dialog
    this.expires = expires
    this.parent = parent
    this.expiresat = Math.floor( +new Date() / 1000 ) + expires

    this.timer = setTimeout( () => { this.timer = -1; this.cleanup() }, expires * 1000 )
  }

  refresh( expires ) {
    this.expires = this.expires
    this.expiresat = Math.floor( +new Date() / 1000 ) + expires

    clearTimeout( this.timer )
    this.timer = setTimeout( () => { this.timer = -1; this.cleanup() }, this.expires * 1000 )
  }

  cleanup() {
    if( -1 !== this.timer ) {
      clearTimeout( this.timer )
    }

    this.parent.subscriptions.delete( this.dialog.id )
    if( 0 === this.parent.subscriptions.size ) {
      subscriptions.delete( this.entity )
    }

    if( this.dialog.connected ) {
      this.dialog.destroy().catch( ()=> {} )
    }
  }

  /*Internal use funtion to be used when we receive a SUBSCRIBE request
  and are required to send out an initial NOTIFY.
  */
  notifyme( contenttype, info ) {
    /*
      Subscription-State, may also contain ;expires=60
    */
    let expires = this.expiresat - Math.floor( +new Date() / 1000 )
    if( expires < 0 ) expires = 0

    let state = 0===expires?"terminated":"active"
    if( undefined !== expires ) {
      state += ";expires=" + expires
    }

    let opts = {
      "method": "NOTIFY",
      "headers": {
        "Subscription-State": state,
        "Content-Type": contenttype
      }
    }

    if( "application/simple-message-summary" === contenttype ) {

      opts.headers[ "Event" ] = "message-summary"
      let waiting =  info.newcount>0?"yes":"no"

      opts.body = `Messages-Waiting: ${waiting}
Message-Account: sip:${info.entity}
Voice-Message: ${info.newcount}/${info.oldcount} (${info.newurgent}/${info.oldurgent})
`
      this.dialog.request( opts )
    }
  }
}

/*
TODO - finsh me.
Store Subscriptions from clients (the client is the subscriber).
This means we need to store the dialog against the callid and
entity.
Only created if we have a subscription to add.
*/
class SubscriptionCollection {
  /* We always start with one, so dialog and expires refer to this first one */
  constructor( entity, dialog, expires ) {
    this.entity = entity
    this.subscriptions = new Map()
    this.subscriptions.set( dialog.id, new Subscription( this, entity, dialog, expires ) )
  }

  add( dialog, expires ) {
    if( !this.subscriptions.has( dialog.id ) ) {
      this.subscriptions.set( dialog.id, new Subscription( this, this.entity, dialog, expires ) )
    }
  }

  remove( dialog ) {
    if( this.subscriptions.has( dialog.id ) ) {
      this.subscriptions.get( dialog.id ).cleanup()
    }
  }

  refresh( dialog, expires ) {
    if( this.subscriptions.has( dialog.id ) ) {
      let sub = this.subscriptions.get( dialog.id )
      sub.refresh( expires )
    }
  }

  get size() {
    return this.subscriptions.size()
  }

  voicemail( info ) {
    if( undefined === info.ref ) {
      console.log("no ref sending to all subscribers")
      for( var [ id,  d ] of this.subscriptions ) {
        d.notifyme( "application/simple-message-summary", info )
      }
    } else {
      console.log("ref sending to one subscriber")
      if( this.subscriptions.has( info.ref ) ) {
        console.log("sending")
        this.subscriptions.get( info.ref )
          .notifyme( "application/simple-message-summary", info )
      }
    }
  }
}

let subscriptions
function storesubscription( entity, dialog, expires ) {
  if( undefined === subscriptions ) {
    subscriptions = new Map()
  }

  if( subscriptions.has( entity ) ) {
    subscriptions.get( entity ).add( dialog, expires )
  } else {
    subscriptions.set( entity, new SubscriptionCollection( entity, dialog, expires ) )
  }

  console.log( `We have ${subscriptions.size} client subscriptions` )
}

function refreshsubscription( entity, dialog, expires ) {
  if( subscriptions.has( entity ) ) {
    subscriptions.get( entity ).refresh( dialog, expires )
  }
}

function removesubscription( entity, dialog ) {
  if( subscriptions.has( entity ) ) {
    let sub = subscriptions.get( entity )
    sub.remove( dialog )
    if( 0 === sub.size ) {
      subscriptions.delete( entity )
    }

    console.log( `We have ${subscriptions.size} client subscriptions` )
  }
}

var options
module.exports.use = ( o ) => {

  options = o

  options.em.on( "voicemail", ( v ) => {
    if( subscriptions.has( v.entity ) ) {
      subscriptions.get( v.entity ).voicemail( v )
    }
  } )

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
        res.send( 403, "Forbidden" )
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
        res.send( 406, "Not Acceptable" )
        return
      }

      options.srf.createUAS( req, res, {
        headers: {
          "Accept": acceptedformats.join( ", " )
        }
      } )
        .then( ( dialog ) => {

          dialog.on( "subscribe", ( req, res ) => {

            let expires = parseInt( req.get( "Expires" ) )
            if( NaN === expires ) expires = 0

            refreshsubscription( entity, dialog, expires )
          } )

          dialog.on( "destroy", ( req ) => {
            removesubscription( entity, dialog )
          } )

          let entity = authedtoparts.user + "@" + authedtoparts.host
          console.log( `${req.authorization.username}@${req.authorization.realm} subscribing to ${entity} for ${formats}` )

          let expires = parseInt( req.get( "Expires" ) )
          if( NaN === expires ) expires = 0

          if ( 0 === expires ) {
            removesubscription( entity, dialog )
          } else {
            storesubscription( entity, dialog, expires )
          }

          acceptedformats.forEach( ( ct ) => {
            options.em.emit( "subscribe", {
              "id": dialog.id,
              "contenttype": ct,
              "entity": entity,
              "expires": expires
            } )
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
