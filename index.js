
const assert = require( "assert" )
const events = require( "events" )


const onsubscribe = require( "./lib/onsubscribe" )
const publishgetuse = require( "./lib/onpublish" )
const dosubscribe = require( "./lib/dosubscribe" )


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
      this.options.em.on( "subscribe", ( s ) => {
        if( "application/simple-message-summary" === s.contenttype ) {
          this.options.em.emit( "voicemail", {
            "ref": s.id,
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
    this.options.srf.use( "subscribe", onsubscribe.use( this.options ) )

    /*
      This next section is listening to our registrar for registrations then
      creating a subscription to that client to obtain state about the phone.
    */
    if ( this.options.subscribeonregister &&
          undefined !== this.options.registrar ) {

      this.options.registrar.on( "register", dosubscribe.reg( this.options ) )

      /* Remove any subscriptions we have on the phone */
      this.options.registrar.on( "unregister", dosubscribe.unreg( this.options ) )
    }
  }

  on( ev, cb ) {
    this.options.em.on( ev, cb )
  }

  /* Notify SUBSCRIBERs of this mailbox of Voicemail, actual
  stats will come from options.voicemailLookup callback.  */
  voicemail( entity ) {
    onsubscribe.voicemail( entity )
  }
}


module.exports = Presence
