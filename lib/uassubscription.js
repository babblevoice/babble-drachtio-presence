
/*
uassubscription.
A UAC (phone/watcher) subscribes to us.
*/

const { v4: uuidv4 } = require( "uuid" )
const sipauth = require( "@babblevoice/babble-drachtio-auth" )
const uasstore = require( "./uasstore.js" )
const doc = require( "./presencedocument.js" )

// @ts-ignore
const parseuri = require( "drachtio-srf" ).parseUri

/**
 * 
 * @param { object } res 
 * @returns { boolean }
 */
function isgoodresponce( res ) {
  if( !res ) return false
  if( !res.msg ) return false
  if( 200 === res.msg.status ) return true
  if( 202 === res.msg.status ) return true
  if( 204 === res.msg.status ) return true

  return false
}

class subscription {

  #destroyed = false

  /**
   * @param { object } req - the initial request
   * @param { object } res - srf response
   * @param { object } options - our options object
   * @param { object } options.srf - our srf object
   * @param { object } options.em - event emitter
   * @param { function } options.userlookup - async user lookup function - required
   * @param { boolean } [ options.proxy = true ] - true = respond with 407 otherwise 401
   * @param { number } [ options.authtimeout = 100000 ] - timeout in mS
   * @param { object } [ options.registrar ] 
   */
  constructor( req, res, options ) {

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
     * Have we at authed at any point.
     * @private
     */
    this._authed = false

    /**
     * Store any timers we need
     * @private
     */
    this._timers = {}

    /**
     * network details - source.
     * @type { object }
     */
    this.network = {}
    this.network.source_address = req.source_address
    this.network.source_port = req.source_port
    this.network.protocol = req.protocol

    this.callid = req.get( "call-id" )

    /**
     * fq = fully qualified call id (private to this module)
     * @private
     */
    this._fqcallid = subscription.getfqcallid( req )
    uasstore.set( this )

    /* All subscriptions are authed */
    this._auth = sipauth.create( options.proxy )

    if( this._auth.has( req ) ) {
      if( options.registrar ) {
        const auth = options.registrar.getauth( req )
        if( auth ) {
          this._auth = auth
        }
      }

      this.#updateauth( req, res )
      return
    }
    
    this._auth.requestauth( req, res )

    /* a little time to auth */
    this._timers.subexpire = setTimeout( this._ontimeout.bind( this ), 10 * 1000 )
  }

  /**
   * In case a client creates a clash - make it per client.
   * @param { object } req object from drachtio
   */
  static getfqcallid( req ) {
    return req.get( "call-id" ) + "@" + req.source_address + ":" + req.source_port
  }

  /**
   * Check the relevent headers for the expires value
   * @param { object } req 
   * @returns 
   */
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

  /**
   * 
   * @param { object } req 
   * @param { object } res 
   */
  async #createdialog( req, res ) {
    this.dialog = await this._options.srf.createUAS( req, res, {
      headers: {
        "Accept": this.accept
      }
    } )

    this.dialog.on( "subscribe", ( req, res ) => {

      this._authorization = this._auth.parseauthheaders( req )
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
  }

  /**
   * 
   * @param { object } req 
   * @param { object } res 
   * @returns { Promise< boolean > }
   */
  async #updateauth( req, res ) {
    this._authorization = this._auth.parseauthheaders( req )
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
      res.send( 403, "Bad auth verify" )
      return false
    }

    /* We only (currently) support subscription within a domain */
    if( this.uri.host !== this._authorization.realm ) {
      res.send( 403, "Forbidden" )
      return false
    }

    uasstore.set( this )
    return true
  }

  /**
   * 
   * @param { object } req 
   * @param { object } res 
   * @returns 
   */
  // eslint-disable-next-line complexity
  async _update( req, res ) {

    if( !( await this.#updateauth( req, res ) ) ) return false

    if( 0 === subscription.getexpires( req ) ) {
      res.send( 200, "Ok" )
      this.destroy()
      return false
    }

    this._authed = true

    let accept = req.get( "Accept" )
    if( !accept ) {
      /* It is not mandatory to require this header - default when one not provided */
      accept = "application/pidf+xml"
    }

    const inaccepts = accept.split( "," )

    let namedevent, info
    for( const ac of inaccepts ) {
      if( -1 !== [ "application/dialog-info+xml",
        "application/xpidf+xml",
        "application/pidf+xml" ].indexOf( ac ) ) {
        if( !this._state ) {
          if( !this.accept ) this.accept = ac
          namedevent = "presence.subscribe.in"
          info = {
            "contenttype": ac,
            "entity": this._user.entity,
            "expires": this.expires,
            "callid": this._fqcallid
          }

          this._state = {}
        }
        break
      }

      if( "application/simple-message-summary" === ac ) {
        if( !this._state ) {
          if( !this.accept ) this.accept = ac
          namedevent = "presence.voicemail.in"
          info = {
            "contenttype": ac,
            "entity": this._user.entity,
            "expires": this.expires,
            "callid": this._fqcallid
          }

          this._state = {}
        }
        break
      }
    }

    if( !this.accept ) {
      this.destroy()
      res.send( 406, "Not Acceptable" )
      return false
    }

    try {
      await this.#createdialog( req, res )
      this._options.em.emit( namedevent, info )
    } catch ( e ) {
      console.error( e )
      this.destroy()
      return false
    }

    return true
  }

  /* cleanup */
  destroy() {

    this.#destroyed = true

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
  async notifychecksync( ) {
    if( !this._authed ) return
    if( !this.dialog ) return
    if( this.#destroyed ) return

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

    try {
      const res = await this.dialog.request( opts )
      if( !isgoodresponce( res ) ) this.destroy()
    } catch( e ) {
      console.error( e )
      this.destroy()
    }
  }


  /* range of notify functions */

  /**
   * 
   * @param { object } info
   * @param { number } info.new
   * @param { number } info.old
   * @param { number } info.newurgent
   * @param { number } info.oldurgent
   * @param { string } info.entity
   * @param { string } info.reason
   * @returns 
   */
  async notifyvoicemail( info ) {

    if( !this._authed ) return
    if( !this.dialog ) return
    if( "init" === info.reason && this._init ) return
    if( this.#destroyed ) return
    if( "application/simple-message-summary" !== this.accept ) return

    this._init = true

    const waiting =  0 < info.new ? "yes":"no"

    const body = [ `Messages-Waiting: ${waiting}`,
      `Message-Account: sip:${info.entity}`,
      `Voice-Message: ${info.new}/${info.old} ${info.newurgent}/${info.oldurgent}` ].join( "\r\n" ) + "\r\n"


    const opts = {
      "method": "NOTIFY",
      "headers": {
        "Content-Type": this.accept,
        "Subscription-State": "active;expire=" + this.expires,
        "Event": "message-summary",
        "Content-Length": Buffer.byteLength( body )
      },
      body
    }

    try {
      const res = await this.dialog.request( opts )
      if( !isgoodresponce( res ) ) this.destroy()
    } catch ( e ) {
      console.error( e )
      this.destroy()
    }
    
  }


  /**
   * @typedef { object } call
   * @property { string } entity
   * @property { object } sip - Object describing basic SIP params
   * @property { string } sip.callid - Call-ID
   * @property { "initiate" | "receive" } direction
   * @property { "initiated" | "early" | "confirmed" | "terminated" } state
   * @property { number } duration
   * @property { boolean } hasmedia
   * @property { object } remote - Object describing remote party
   * @property { string } remote.display - Display name
   * @property { string } remote.uri - URI
   * 
   **/

  /**
   * 
   * @param { object } info
   * @param { string } info.entity
   * @param { string } info.display
   * @param { number } info.callcount
   * @param { Array< call > } [ info.full ] - If no calls should be emopty - or an array with full list of calls
   * @param { call } [ info.partial ] - if present only send this one if we can - i.e. this is the one changed
   * @param { string } [ info.callid ] send only to the subscription with call id - i.e. initial (used in calling function)
   */
  // eslint-disable-next-line complexity
  async notifydialog( info ) {
    if( !this._authed ) return
    if( !this.dialog ) return
    if( this.#destroyed ) return

    /*  For certain document types on the phone is simply transmitted based on call count */
    if( this.lastinfo ) {
      await this.notifyregistration( {
        "entity": this.lastinfo.entity,
        "status": this.lastinfo.status,
        "callcount": info.callcount
      } )
    }

    if( this.#destroyed ) return
    if( "application/dialog-info+xml" !== this.accept ) return

    const opts = {
      "method": "NOTIFY",
      "headers": {
        "Content-Type": this.accept,
        "Subscription-State": "active;expire=" + this.expires,
        "Event": "presence"
      }
    }

    if( !this.version ) this.version = 1

    try {
      if( Array.isArray( info.full ) ) {
        const [ first, ...rest ]  = info.full
  
        opts.body = doc.createdialoginfoxml( this.version, "full", info.entity, info.display, first )
        opts.headers[ "Content-Length" ] = Buffer.byteLength( opts.body )
        const res = await this.dialog.request( opts )
        if( !isgoodresponce( res ) ) {
          this.destroy()
          return
        }
        this.version++
  
        for ( const dialog of rest ) {
          opts.body = doc.createdialoginfoxml( this.version, "partial", info.entity, info.display, dialog )
          opts.headers[ "Content-Length" ] = Buffer.byteLength( opts.body )
          const res = await this.dialog.request( opts )
          if( !isgoodresponce( res ) ) {
            this.destroy()
            return
          }
          this.version++
        }
      } else {
        opts.body = doc.createdialoginfoxml( this.version, "partial", info.entity, info.display, info.partial )
        opts.headers[ "Content-Length" ] = Buffer.byteLength( opts.body )
        const res = await this.dialog.request( opts )
        if( !isgoodresponce( res ) ) {
          this.destroy()
          return
        }
        this.version++
      }
    } catch ( e ) {
      console.error( e )
      this.destroy()
    }
  }

  /**
   * 
   * @param { object } info 
   */
  async #handlepidfxml( info ) {

    const opts = {
      "method": "NOTIFY",
      "headers": {
        "Content-Type": this.accept,
        "Subscription-State": "active;expire=" + this.expires,
        "Event": "presence"
      }
    }

    if( "registered" == info.status ) {
      if( 0 < info.callcount ) {
        /* TODO we can pull out more infoamtion such as who they are taling with */
        opts.body = doc.genpidfxml( info.entity, "closed", "Talking", "on-the-phone" )
      } else {
        opts.body = doc.genpidfxml( info.entity, "open", "Available", "" )
      }
    } else {
      opts.body = doc.genpidfxml( info.entity, "closed", "Unavailable", "" )
    }

    opts.headers[ "Content-Length" ] = Buffer.byteLength( opts.body )
    const res = await this.dialog.request( opts )

    if( !isgoodresponce( res ) ) {
      this.destroy()
    }
  }

  /**
   * polycom
   * @param { object } info
   * @param { string } info.entity
   * @param { "registered"|"unregistered" } info.status
   * @param { number } info.callcount
   */
  async #handlexpidfxml( info ) {

    const opts = {
      "method": "NOTIFY",
      "headers": {
        "Content-Type": this.accept,
        "Subscription-State": "active;expire=" + this.expires,
        "Event": "presence"
      }
    }

    if( "registered" == info.status ) {
      if( 0 < info.callcount ) {
        opts.body = doc.genxpidfxml( info.entity, "closed", "Busy", "busy" )
      } else {
        opts.body = doc.genxpidfxml( info.entity, "open", "Available", "online" )
      }
    } else {
      opts.body = doc.genxpidfxml( info.entity, "closed", "Offline", "away" )
    }

    opts.headers[ "Content-Length" ] = Buffer.byteLength( opts.body )
    const res = await this.dialog.request( opts )
    if( !isgoodresponce( res ) ) this.destroy()
  }

  /**
   * 
   * @param { object } info
   * @param { string } info.entity
   * @param { "registered"|"unregistered" } info.status
   * @param { number } info.callcount
   */
  async notifyregistration( info ) {
    if( !this._authed ) return
    if( !this.dialog ) return
    if( this.#destroyed ) return

    this.lastinfo = info

    try {
      if( "application/pidf+xml" === this.accept ) await this.#handlepidfxml( info )
      else if( "application/xpidf+xml" === this.accept ) await this.#handlexpidfxml( info )
    } catch( e ) {
      console.error( e )
      this.destroy()
    }
  }
}

module.exports = subscription