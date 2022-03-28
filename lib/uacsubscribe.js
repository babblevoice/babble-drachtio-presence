/*
uacsubscribe - when a client registers - we subscribe to it for status updates.

This file responds to REGISTER events from our Registrar object. When we have a UAC
register to us, we then SUBSCRIBE to the client to pick up on information

* DND
*/

const uacsubscription = require( "./uacsubscription.js" )

class uacsubscribe {
  constructor( options ) {

    this._options = options

    /*
      This next section is listening to our registrar for registrations then
      creating a subscription to that client to obtain state about the phone.
    */
    if ( this._options.subscribeonregister ) {
      this._options.em.on( "register", this.reg.bind( this ) )
      /* Remove any subscriptions we have on the phone */
      this._options.em.on( "unregister", this.unreg.bind( this ) )
    }
  }

  static create( options ) {
    return new uacsubscribe( options )
  }

  reg( info ) {
    if( !info.allow.includes( "SUBSCRIBE" ) ) return
    uacsubscription.create( info, this._options )
  }

  unreg( info ) {
    uacsubscription.destroy( info )
  }
}

module.exports = uacsubscribe
