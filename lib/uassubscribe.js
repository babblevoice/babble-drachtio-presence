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

const uassubscription = require( "./uassubscription.js" )
const uasstore = require( "./uasstore.js" )


module.exports.use = ( options ) => {

  options.em.on( "presence.voicemail.out", ( v ) => {
    const subs = uasstore.get( v.entity )
    if( subs ) {
      subs.forEach( ( sub ) => {
        sub.notifyvoicemail( v )
      } )
    }
  } )

  options.em.on( "presence.checksync.out", ( v ) => {
    const subs = uasstore.get( v.entity )
    if( subs ) {
      subs.forEach( ( sub ) => {
        sub.notifychecksync()
      } )
    }
  } )

  

  /* Why have I replicated this? */
  options.em.on( "presence.status.out", ( v ) => {
    const subs = uasstore.get( v.entity )
    if( subs ) {
      subs.forEach( ( sub ) => {
        sub.notifyvoicemail( v )
      } )
    }
  } )

  options.em.on( "presence.dialog.out", ( v ) => {
    const subs = uasstore.get( v.entity )
    if( subs ) {
      subs.forEach( ( sub ) => {
        sub.notifydialog( v )
      } )
    }
  } )

  return ( req, res, next ) => {
    if ( "SUBSCRIBE" !== req.method ) return next()

    const fqcallid = uassubscription.getfqcallid( req )
    const s = uasstore.get( fqcallid )
    if( s ) {
      return s._update( req, res )
    }

    uassubscription.create( req, res, options )
  }
}
