

const sipauth = require( "@babblevoice/babble-drachtio-auth" )

const uacstore = require( "./uacstore.js" )
const doc = require( "./presencedocument.js" )

const expiresmatch = /expires=(\d*)/
const activematch = /^(active|init)/

class subscription {
  /**
  Instantiates the subscription class.
  @constructor
  @param { Request } reg - the register object from babble-drachtio-registrar
  @param { Response } options - options
  @param { object } options - our options object
  @param { function } options.userlookup - async user lookup function - required
  @param { boolean } [ options.proxy = true ] - true = respond with 407 otherwise 401
  @param { number } [ options.authtimeout = 100000 ] - timeout in mS
  
  */
  constructor( reg, options ) {

    this.reg = reg
    this.uuid = reg.uuid
    this._options = options

    try {
      this._createdialog()
    } catch( e ) {
      console.error( `Error with creating client subscription for ${reg.auth.username}@${reg.auth.realm}` )
      console.error( e )
    }
  }

  /**
  @private
  */
  async _createdialog() {

    try {
      this.dialog = await this._options.srf.createUAC( this.reg.contacts[ 0 ], {
        "method": "SUBSCRIBE",
        "headers": {
          "To": `<sip:${this.reg.auth.username}@${this.reg.auth.realm}>`,
          "From": `<sip:${this.reg.auth.username}@${this.reg.auth.realm}>`,
          "Event": "presence",
          "Expires": this.reg.expiresin,
          "Accept": "application/pidf+xml"
        }
      } )
    } catch( e ) {
      console.error( "Failed SUBSCRIBE to client." )
      return
    }

    this._auth = sipauth.create( this._options.proxy )
    uacstore.set( this )

    this.dialog.on( "destroy", this._ondestroy.bind( this ) )
    this.dialog.on( "notify", this._onnotify.bind( this ) )
  }

  static create( reg, options ) {
    if( uacstore.has( reg ) ) return
    return new subscription( reg, options )
  }

  static destroy( reg ) {
    uacstore.delete( reg )
  }

  /**
  @private
  */
  async _ondestroy() {
    uacstore.delete( this )
  }

  /**
  @private
  */
  // eslint-disable-next-line complexity
  async _onnotify( req, res ) {

    if( !this._auth.has( req ) ) {
      this._auth.requestauth( req, res )
      return
    }

    const authorization = this._auth.parseauthheaders( req, res )
    if( !this._user ) {
      this._user = await this._options.userlookup( authorization.username, authorization.realm )
      if( !this._user ) {
        this.dialog.destroy()
        return false
      }
      this._user.username = authorization.username
      this._user.realm = authorization.realm
      this._user.entity = authorization.username + "@" + authorization.realm
    }      

    if( !this._auth.verifyauth( req, authorization, this._user.secret ) ) {
      if( this._auth.stale ) return this._auth.requestauth( req, res )
      return res.send( 403, "Bad auth" )
    }

    /*
      Should be active and possibly contain ;expires= where 0 expires the subscription.
    */
    const substate = req.get( "Subscription-State" )
    if( null === substate.match( activematch ) ) {
      res.send( 400, "Wrong subscription state" )
      return
    }

    const expires = substate.match( expiresmatch )
    if( null !== expires && 1 < expires.length ) {
      if( "0" == expires[ 1 ] ) {
        uacstore.delete( this )
        res.send( 200 )
        return
      }
    }

    if( 0 === parseInt( req.get( "Content-Length" ) ) ) {
      res.send( 200 )
      return
    }

    /* We are now authed */
    const s = doc.parsepidfxml( req.get( "Content-Type" ), req.body )
    if( false === s ) {
      res.send( 400, "Bad request - or at least we don't understand it" )
    } else {
      this._options.em.emit( "presence.status.in", {
        ...s,
        ...{
          "entity": this.user.entity,
          "source": {
            "event": "NOTIFY",
            "address": req.source_address,
            "port": req.source_port,
            "related": this.reg.contacts[ 0 ]
          }
        }
      } )
    }
  }
}

module.exports = subscription
