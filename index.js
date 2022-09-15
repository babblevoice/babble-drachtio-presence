
const assert = require( "assert" )
const events = require( "events" )

const uassubscribe = require( "./lib/uassubscribe" )
const uacsubscribe = require( "./lib/uacsubscribe" )


const defaultoptions = {
  /* When a client registers - we subscribe to their status if they support it */
  "subscribeonregister": true
}

class Presence {

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

    this.options.srf.use( "subscribe", uassubscribe.use( this.options ) )

    this.uacsub = uacsubscribe.create( this.options )
  }

  static uacstore = require( "./lib/uacstore" )
  static uasstore = require( "./lib/uasstore" )
}

module.exports = Presence
