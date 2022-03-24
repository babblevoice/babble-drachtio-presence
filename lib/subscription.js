

const { v4: uuidv4 } = require( "uuid" )
const sipauth = require( "babble-drachtio-auth" )
const store = require( "./store.js" )
const doc = require( "./presencedocument.js" )

const parseuri = require( "drachtio-srf" ).parseUri

class subscription {
  /**
  Instantiates the reg class.
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

    store.set( this )

    /* All subscriptions are authed */
    this._auth = new sipauth.auth( options.proxy )
    this._auth.requestauth( req, res )

    if( this._timers.subexpire ) clearTimeout( this._timers.subexpire )
    this._timers.subexpire = setTimeout( this._ontimeout.bind( this ), this.expires * 1000 )
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
    
    if ( typeof expires === "undefined" && undefined !== expiresheader ) {
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

  async _update( req, res ) {
    if( this._timers.subexpire ) clearTimeout( this._timers.subexpire )
    this._timers.subexpire = setTimeout( this._ontimeout.bind( this ), this.expires * 1000 )

    this._authorization = this._auth.parseauthheaders( req, res )
    if( !this._user ) {
      this._user = await this._options.userlookup( this._authorization.username, this._authorization.realm )
      if( !this._user ) {
        this.destroy()
        console.error( "Error looking up user (subscription)" )
        return res.send( 403, "User error" )
      }
      this._user.username = this._authorization.username
      this._user.realm = this._authorization.realm
      this._user.entity = this._authorization.username + "@" + this._authorization.realm
    } else if( this._user.username != this._authorization.username ||
          this._user.realm != this._authorization.realm ) {
        /* username or realm cannot change in the same reg */
        this.destroy()
        return res.send( 403, "Inconsistent" )
    }

    if( this._timers.subauth ) clearTimeout( this._timers.subauth )

    if( !this._user || !this._auth.verifyauth( req, this._authorization, this._user.secret ) ) {

      if( this._auth.stale ) {
        this._timers.subauth = setTimeout( this._ontimeout.bind( this ), this._options.authtimeout )
        return this._auth.requestauth( req, res )
      }

      this.destroy()
      return res.send( 403, "Bad auth" )
    }


    /* We only (currently) support subscription within a domain */
    if( this.uri.host !== this._authorization.realm ) {
      res.send( 403, "Forbidden" )
      return
    }

    this.accept = req.get( "Accept" )

    switch( this.accept ) {
      case "application/dialog-info+xml":
      case "application/xpidf+xml":
      case "application/pidf+xml":
      case "application/simple-message-summary":
        if( !this._state ) {
          this._options.em.emit( "presence.subscribe.in", {
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
        return
    }

    this.dialog = await this._options.srf.createUAS( req, res, {
      headers: {
        "Accept": this.accept
      }
    } )

    this.dialog.on( "subscribe", ( req, res ) => {
      let expires = subscription.getexpires( req )
      if( !expires ) this.destroy()
    } )

    this.dialog.on( "destroy", ( req ) => {
      this.destroy()
    } )

    if( 0 === subscription.getexpires( req ) ) {
      this.destroy()
    }
  }

  /* cleanup */
  destroy() {
    for( const t in this._timers ) {
      if( this._timers[ t ] ) clearTimeout( this._timers[ t ] )
    }
    store.delete( this )

    if( this.dialog && this.dialog.connected ) this.dialog.destroy()
  }


  /* range of notify functions */
  notifyvoicemail( info ) {

    if( this.accept !== "application/simple-message-summary" ) return

    let waiting =  info.newcount>0?"yes":"no"
    let opts = {
      headers: {
        Event: "message-summary"
      },
      body: `Messages-Waiting: ${waiting}
Message-Account: sip:${info.entity}
Voice-Message: ${info.newcount}/${info.oldcount} (${info.newurgent}/${info.oldurgent})
`
    }

    this.dialog.request( opts )
  }

  notifydialog( info ) {

    if( this.accept !== "application/dialog-info+xml" ) return

    let opts = {
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
      for ( let dialog of info.all ) {
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