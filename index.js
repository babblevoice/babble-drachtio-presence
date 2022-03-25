
const assert = require( "assert" )
const events = require( "events" )


const uassubscribe = require( "./lib/uassubscribe" )
const publishgetuse = require( "./lib/onpublish" )
const uacsubscribe = require( "./lib/uacsubscribe" )


const defaultoptions = {
  /* When a client registers - we subsribe to their status if they support it */
  "subscribeonregister": true,
  "dummyvoicemail": true
}

class Presence {

  sendnotify( user, realm, callinfo ) {

  }

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

    assert( undefined !== this.options.srf )

    if( undefined === this.options.em ) {
      this.options.em = new events.EventEmitter()
    }

    if( this.options.dummyvoicemail ) {
      this.options.em.on( "presence.subscribe.in", ( s ) => {
        if( "application/simple-message-summary" === s.contenttype ) {
          this.options.em.emit( "presence.voicemail.out", {
            "entity": s.entity,
            "newcount": 0,
            "oldcount": 0,
            "newurgent": 0,
            "oldurgent": 0
          } )
        }
      } )
    }

    this.options.srf.use( "publish", publishgetuse.use( this.options ) )
    this.options.srf.use( "subscribe", uassubscribe.use( this.options ) )

    /*
      This next section is listening to our registrar for registrations then
      creating a subscription to that client to obtain state about the phone.
    */
    if ( this.options.subscribeonregister &&
          undefined !== this.options.registrar ) {

      this.options.em.on( "register", uacsubscribe.reg( this.options ) )

      /* Remove any subscriptions we have on the phone */
      this.options.em.on( "unregister", uacsubscribe.unreg( this.options ) )
    }
  }

  on( ev, cb ) {
    this.options.em.on( ev, cb )
  }
}

module.exports = Presence
