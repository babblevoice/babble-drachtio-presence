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
const doc = require( "./presencedocument.js" )

const subscriptions = new Map()
var options

class Subscription {
  constructor( parent, entity, dialog, expires, subscriber ) {
    this.entity = entity
    this.dialog = dialog
    this.expires = expires
    this.parent = parent
    this.subscriber = subscriber
    this.expiresat = Math.floor( +new Date() / 1000 ) + expires

    // For dialog
    this.version = 0

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

    this.parent.subscriptions.voicemail.delete( this.dialog.id )
    if( 0 === this.parent.size ) {
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
      this.notifymevoicemail( opts, info )
    } else if( "application/dialog-info+xml" === contenttype ) {
      this.notifymedialog( opts, info )
    }
  }

  notifymevoicemail( opts, info ) {
    opts.headers[ "Event" ] = "message-summary"
    let waiting =  info.newcount>0?"yes":"no"

    opts.body = `Messages-Waiting: ${waiting}
Message-Account: sip:${info.entity}
Voice-Message: ${info.newcount}/${info.oldcount} (${info.newurgent}/${info.oldurgent})
`
    this.dialog.request( opts )
  }

  notifymedialog( opts, info ) {
    opts.headers[ "Event" ] = "presence"

    if( undefined === info.all ) {
      opts.body = doc.createdialoginfoxml( this.version, "full", info.entity, info.display )
      this.dialog.request( opts )
      this.version++
      return
    }

    /* This is our inital */
    if( 0 === this.version ) {
      let state = "full"
      for ( let dialog of info.all ) {
        opts.body = doc.createdialoginfoxml( this.version, state, info.entity, info.display, dialog )
        this.dialog.request( opts )
        state = "partial"
        this.version++
      }
    } else {
      opts.body = doc.createdialoginfoxml( this.version, "partial", info.entity, info.display, info.update )
      this.dialog.request( opts )
      this.version++
    }
  }
}

/*
Store Subscriptions from clients (the client is the subscriber).
This means we need to store the dialog against the callid and
entity.
Only created if we have a subscription to add.
*/
class SubscriptionCollection {
  /* We always start with one, so dialog and expires refer to this first one */
  constructor( entity ) {
    this.entity = entity
    this.subscriptions = {}
    this.subscriptions.voicemail = new Map()
    this.subscriptions.dialog = new Map()
    this.state = {}
  }

  add( dialog, expires, ct, subscriber ) {

    switch( ct ) {
      case "application/simple-message-summary": {
        if( !this.subscriptions.voicemail.has( dialog.id ) ) {
          let sub = new Subscription( this, this.entity, dialog, expires, subscriber )
          this.subscriptions.voicemail.set( dialog.id, sub )
          this.voicemail( sub )
        }
        break
      }
      case "application/dialog-info+xml": {
        if( !this.subscriptions.dialog.has( dialog.id ) ) {
          let sub = new Subscription( this, this.entity, dialog, expires, subscriber )
          this.subscriptions.dialog.set( dialog.id, sub )
          this.dialog( sub )
        }
        break
      }
    }
  }

  remove( dialog ) {
    let sub
    if( this.subscriptions.voicemail.has( dialog.id ) ) {
      sub = this.subscriptions.voicemail.get( dialog.id )
    }

    if( undefined !== sub ) sub.cleanup()
  }

  refresh( dialog, expires ) {
    let sub
    if( this.subscriptions.voicemail.has( dialog.id ) ) {
      sub = this.subscriptions.voicemail.get( dialog.id )
      console.log( `${sub.subscriber} refreshing subscription to ${this.entity} for voicemail` )
    } else if ( this.subscriptions.dialog.has( dialog.id ) ) {
      sub = this.subscriptions.dialog.get( dialog.id )
      console.log( `${sub.subscriber} refreshing subscription to ${this.entity} for dialog` )
    }

    if( undefined !== sub ) {
      sub.refresh( expires )
      return true
    }

    return false
  }

  get size() {
    return this.subscriptions.voicemail.size
  }

  /*
  Similar to voicemail, but we need to build a list of dialogs. For normal endpoints
  we can simply send state information as these should be short, however, queues
  could contain a large number of dialogs, so we need to support sending of partial
  */
  dialog( sub ) {

    if( undefined === this.state.dialog ) {
      options.em.emit( "presence.subscribe.in", {
        "contenttype": "application/dialog-info+xml",
        "entity": this.entity,
        "expires": this.expires
      } )
      return
    }

    if( undefined !== sub ) {
      sub.notifyme( "application/dialog-info+xml", this.state.dialog )
    } else {
      for( var [ id,  d ] of this.subscriptions.dialog ) {
        d.notifyme( "application/dialog-info+xml", this.state.dialog )
      }
    }
  }

  /* Called to send notify to watcher, will also trigger
  obtaining current state */
  voicemail( sub ) {

    if( undefined === this.state.voicemail ) {
      options.em.emit( "presence.subscribe.in", {
        "contenttype": "application/simple-message-summary",
        "entity": this.entity,
        "expires": this.expires
      } )
      return
    }

    if( undefined !== sub ) {
      sub.notifyme( "application/simple-message-summary", this.state.voicemail )
    } else {
      for( var [ id,  d ] of this.subscriptions.voicemail ) {
        d.notifyme( "application/simple-message-summary", this.state.voicemail )
      }
    }
  }

  status( info ) {

  }
}

function storesubscription( entity, dialog, expires, format, subscriber ) {

  if( subscriptions.has( entity ) ) {
    subscriptions.get( entity ).add( dialog, expires, format, subscriber )
  } else {
    let sub = new SubscriptionCollection( entity )
    subscriptions.set( entity, sub )
    sub.add( dialog, expires, format, subscriber )
  }

  console.log( `We have ${subscriptions.size} client subscriptions` )
}

function refreshsubscription( entity, dialog, expires ) {
  if( subscriptions.has( entity ) ) {
    return subscriptions.get( entity ).refresh( dialog, expires )
  }

  return false
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

module.exports.use = ( o ) => {

  options = o

  options.em.on( "presence.voicemail.out", ( v ) => {
    if( subscriptions.has( v.entity ) ) {
      let sub = subscriptions.get( v.entity )
      sub.state.voicemail = v
      sub.voicemail()
    }
  } )

  options.em.on( "presence.status.out", ( v ) => {
    if( subscriptions.has( v.entity ) ) {
      subscriptions.get( v.entity ).status( v )
    }
  } )

  options.em.on( "presence.dialog.out", ( v ) => {
    if( subscriptions.has( v.entity ) ) {
      let sub = subscriptions.get( v.entity )
      sub.state.dialog = v
      sub.dialog()
    }
  } )

  return ( req, res ) => {
    if ( req.method !== "SUBSCRIBE" ) return next()

    let toparts = parseuri( req.getParsedHeader( "To" ).uri )

    digestauth( {
      "proxy": true, /* 407 or 401 */
      "passwordLookup": ( username, realm, cb ) => {
        options.userlookup( username, realm )
          .then( ( u ) => {
            cb( false, u.secret )
          } )
          .catch( () => {
            cb( false, false )
          } )
      },
      "realm": toparts.host
    } )( req, res, () => {
      let authedtoparts = parseuri( req.getParsedHeader( "To" ).uri )

      /* We only (currently) support subscription within a domain */
      if( req.authorization.realm !== authedtoparts.host ) {
        res.send( 403, "Forbidden" )
        return
      }

      /* We have been authed */
      let format = req.get( "Accept" )
      /* Be explicit - we might want to look at application/simple-message-summary also (voicemail - message waiting etc) */
      /* Also look at application/dialog-info+xml - it looks like much more detail. */

      switch( format ) {
        case "application/dialog-info+xml":
        case "application/xpidf+xml":
        case "application/pidf+xml":
        case "application/simple-message-summary":
          break
        default:{
          res.send( 406, "Not Acceptable" )
          return
        }
      }

      options.srf.createUAS( req, res, {
        headers: {
          "Accept": format
        }
      } )
        .then( ( dialog ) => {

          dialog.on( "subscribe", ( req, res ) => {
            let expires = parseInt( req.get( "Expires" ) )
            if( NaN === expires ) expires = 0

            if( !refreshsubscription( entity, dialog, expires ) ) {
              res.send( 481, "Subscription does not exist" )
              return
            }

            res.send( 200 )
          } )

          dialog.on( "destroy", ( req ) => {
            removesubscription( entity, dialog )
          } )

          let entity = authedtoparts.user + "@" + authedtoparts.host
          let subscriber = req.authorization.username + "@" + req.authorization.realm
          console.log( `${subscriber} subscribing to ${entity} for ${format}` )

          let expires = parseInt( req.get( "Expires" ) )
          if( NaN === expires ) expires = 0

          if ( 0 === expires ) {
            removesubscription( entity, dialog )
          } else {
            storesubscription( entity, dialog, expires, format, subscriber )
          }
        } )
    } )
  }
}

module.exports.subscriptions = subscriptions
