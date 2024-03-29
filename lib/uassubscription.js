
/*
uassubscription.
A UAC (phone/watcher) subscribes to us.
*/

const { v4: uuidv4 } = require( "uuid" )
const sipauth = require( "@babblevoice/babble-drachtio-auth" )
const uasstore = require( "./uasstore.js" )
const doc = require( "./presencedocument.js" )

const parseuri = require( "drachtio-srf" ).parseUri

class subscription {
  /**
  Instantiates the subscription class.
  @constructor
  @param { Request } req - the initial request
  @param { Response } res - srf response
  @param { object } options - our options object
  @param { function } options.userlookup - async user lookup function - required
  @param { boolean } [ options.proxy = true ] - true = respond with 407 otherwise 401
  @param { number } [ options.authtimeout = 100000 ] - timeout in mS
  
  */
  constructor( req, res, options = {} ) {

    /**
    Our uuid for this registration - guaranteed to be unique.
    */
    this.uuid = uuidv4()

    /**
    @private
    */
    this._options = options

    if( !this._options.authtimeout ) this._options.authtimeout = 10000

    /**
    This must be set for the store
    */
    const suburi = parseuri( req.uri )

    if( !suburi ) {
      this.destroy()
      return res.send( 400, "Bad URI" )
    }

    this.uri = {
      "user": suburi.user,
      "host": suburi.host
    }

    this.expires = subscription.getexpires( req )
    if( false === this.expires ) {
      this.destroy()
      return res.send( 400, "No valid expires" )
    }

    /**
    Have we at authed at any point.
    @private
    */
    this._authed = false

    /**
    Store any timers we need
    @private
    */
    this._timers = {}

    /**
    network details - source.
    @type {object}
    */
    this.network = {}
    this.network.source_address = req.source_address
    this.network.source_port = req.source_port
    this.network.protocol = req.protocol

    this.callid = req.get( "call-id" )

    /**
     fq = fully qualified call id (private to this module)
     @private
    */
    this._fqcallid = subscription.getfqcallid( req )
    uasstore.set( this )

    /* All subscriptions are authed */
    this._auth = sipauth.create( options.proxy )
    this._auth.requestauth( req, res )

    //if( this._timers.subexpire ) clearTimeout( this._timers.subexpire )
    //this._timers.subexpire = setTimeout( this._ontimeout.bind( this ), this.expires * 1000 )
  }

  /**
  In case a client creates a clash - make it per client.
  @param { object } - req object from drachtio
  */
  static getfqcallid( req ) {
    return req.get( "call-id" ) + "@" + req.source_address + ":" + req.source_port
  }

  static getexpires( req ) {
    const contact = req.getParsedHeader( "Contact" )
    const expiresheader = req.get( "Expires" )

    let expires
    if( contact[ 0 ].params && contact[ 0 ].params.expires ) {
      return parseInt( contact[ 0 ].params.expires )
    }
    
    if ( "undefined" === typeof expires && undefined !== expiresheader ) {
      return parseInt( expiresheader )
    }

    return false
  }

  static create( req, res, options ) {
    return new subscription( req, res, options )
  }

  _ontimeout() {
    this.destroy()
  }

  // eslint-disable-next-line complexity
  async _update( req, res ) {
    //if( this._timers.subexpire ) clearTimeout( this._timers.subexpire )
    //this._timers.subexpire = setTimeout( this._ontimeout.bind( this ), this.expires * 1000 )

    this._authorization = this._auth.parseauthheaders( req, res )
    if( !this._user ) {
      this._user = await this._options.userlookup( this._authorization.username, this._authorization.realm )
      if( !this._user ) {
        this.destroy()
        res.send( 403, "User error" )
        return false
      }
      this._user.username = this._authorization.username
      this._user.realm = this._authorization.realm
      this._user.entity = this._authorization.username + "@" + this._authorization.realm
    } else if( this._user.username != this._authorization.username ||
          this._user.realm != this._authorization.realm ) {
      /* username or realm cannot change in the same reg */
      this.destroy()
      res.send( 403, "Inconsistent" )
      return false
    }

    if( this._timers.subauth ) clearTimeout( this._timers.subauth )

    if( !this._user || !this._auth.verifyauth( req, this._authorization, this._user.secret ) ) {

      if( this._auth.stale ) {
        this._timers.subauth = setTimeout( this._ontimeout.bind( this ), this._options.authtimeout )
        return this._auth.requestauth( req, res )
      }

      this.destroy()
      res.send( 403, "Bad auth" )
      return false
    }


    /* We only (currently) support subscription within a domain */
    if( this.uri.host !== this._authorization.realm ) {
      res.send( 403, "Forbidden" )
      return false
    }

    this._authed = true

    this.accept = req.get( "Accept" )
    this.dialog = await this._options.srf.createUAS( req, res, {
      headers: {
        "Accept": this.accept
      }
    } )

    this.dialog.on( "subscribe", ( req, res ) => {

      this._authorization = this._auth.parseauthheaders( req, res )
      if( !this._user || !this._auth.verifyauth( req, this._authorization, this._user.secret ) ) {

        if( this._auth.stale ) {
          this._timers.subauth = setTimeout( this._ontimeout.bind( this ), this._options.authtimeout )
          return this._auth.requestauth( req, res )
        }
  
        this.destroy()
        return res.send( 403, "Bad auth" )
      }

      res.send( 202 )
    } )

    /* The follow 2 will both be called - but hang off both */
    this.dialog.on( "unsubscribe", () => {
      this.destroy()
    } )

    this.dialog.on( "destroy", () => {
      this.destroy()
    } )

    if( 0 === subscription.getexpires( req ) ) {
      this.destroy()
      return
    }

    switch( this.accept ) {
    case "application/dialog-info+xml":
    case "application/xpidf+xml":
    case "application/pidf+xml":
      if( !this._state ) {
        this._options.em.emit( "presence.subscribe.in", {
          "contenttype": this.accept,
          "entity": this._user.entity,
          "expires": this.expires
        } )
        this._state = {}
      }
      break
    case "application/simple-message-summary":
      if( !this._state ) {
        this._options.em.emit( "presence.voicemail.in", {
          "contenttype": this.accept,
          "entity": this._user.entity,
          "expires": this.expires
        } )
        this._state = {}
      }
      break
    default:
      this.destroy()
      res.send( 406, "Not Acceptable" )
    }
  }

  /* cleanup */
  destroy() {

    for( const t in this._timers ) {
      if( this._timers[ t ] ) clearTimeout( this._timers[ t ] )
    }
    uasstore.delete( this )

    if( this.dialog && this.dialog.connected ) this.dialog.destroy()
  }

  /**
   * Send request to check-sync (reboot) the endpoint.
   * @returns
   */
  notifychecksync( ) {
    if( !this._authed ) return
    if( !this.dialog ) return

    if( "application/simple-message-summary" !== this.accept ) return

    const opts = {
      "method": "NOTIFY",
      "headers": {
        "Content-Type": this.accept,
        "Content-Length": 0,
        "Event": "check-sync",
        "Subscription-State": "terminated;reason=noresource"
      }
    }

    this.dialog.request( opts )
  }


  /* range of notify functions */
  notifyvoicemail( info ) {

    if( !this._authed ) return
    if( !this.dialog ) return
    if( "init" === info.reason && this._init ) return
    if( "application/simple-message-summary" !== this.accept ) return

    this._init = true

    const waiting =  0 < info.new ? "yes":"no"
    const opts = {
      "method": "NOTIFY",
      "headers": {
        "Content-Type": this.accept,
        "Subscription-State": "active;expire=" + this.expires,
        "Event": "message-summary"
      },
      "body": [ `Messages-Waiting: ${waiting}`,
        `Message-Account: sip:${info.entity}`,
        `Voice-Message: ${info.new}/${info.old} (${info.newurgent}/${info.oldurgent})` ].join( "\r\n" )
    }

    this.dialog.request( opts )
  }

  notifydialog( info ) {
    if( !this._authed ) return
    if( !this.dialog ) return
    if( "application/dialog-info+xml" !== this.accept ) return

    const opts = {
      headers: {
        Event: "presence"
      }
    }

    if( !info.all ) {
      opts.body = doc.createdialoginfoxml( this.version, "full", info.entity, info.display )
      this.dialog.request( opts )
      this.version++
      return
    }

    /* This is our initial */
    if( !this.version ) {
      this.version = 1
      let state = "full"
      for ( const dialog of info.all ) {
        opts.body = doc.createdialoginfoxml( this.version, state, info.entity, info.display, dialog )
        this.dialog.request( opts )
        state = "partial"
      }
    } else {
      opts.body = doc.createdialoginfoxml( this.version, "partial", info.entity, info.display, info.update )
      this.dialog.request( opts )
      this.version++
    }
  }
}

module.exports = subscription