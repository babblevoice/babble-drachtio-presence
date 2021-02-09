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

/*
TODO - finsh me.
Store Subscriptions from clients (the client is the subscriber).
This means we need to store the dialog against the callid and
entity.
Only created if we have a subscription to add.
*/
class SubscriptionCollection {
  constructor( dialog ) {
    this.subscriptions = [ dialog ]
  }

  add( dialog ) {
    this.subscriptions.push( dialog )
  }

  remove( dialog ) {
    let index = this.subscriptions.findIndex( ( sub ) => {
      if( sub.id === dialog.id ) {
        return true
      }
      return false
    } )

    if ( -1 !== index ) {
      this.subscriptions.splice( index, 1 )
    }
  }

  get size() {
    return this.subscriptions.size()
  }
}

let subscriptions

module.exports.use = ( options ) => {

  if( undefined === subscriptions ) {
    subscriptions = new Map()
  }

  return ( req, res ) => {
    if ( req.method !== "SUBSCRIBE" ) return next()

    let toparts = parseuri( req.getParsedHeader( "To" ).uri )

    digestauth( {
      proxy: true, /* 407 or 401 */
      passwordLookup: options.passwordLookup,
      realm: toparts.host
    } )( req, res, () => {
      let authedtoparts = parseuri( req.getParsedHeader( "To" ).uri )

      /* We only (currently) support subscription within a domain */
      if( req.authorization.realm !== authedtoparts.host ) {
        res.send( 403 /* Forbidden */ )
        return
      }

      /* We have been authed */
      let formats = req.get( "Accept" ).split( /[,|\s|;]+/ )
      /* Be explicit - we might want to look at application/simple-message-summary also (voicemail - message waiting etc) */
      /* Also look at application/dialog-info+xml - it looks like much more detail. */
      let acceptedformats = []
      formats.forEach( ( el ) => {
        switch( el ) {
          case "application/dialog-info+xml":
          case "application/xpidf+xml":
          case "application/pidf+xml":
          case "application/simple-message-summary":
            acceptedformats.push( el )
        }
      } )

      if( 0 === acceptedformats.length ) {
        res.send( 406 /* Not Acceptable */ )
        return
      }

      options.srf.createUAS( req, res, {
        headers: {
          "Accept": acceptedformats.join( ", " )
        }
      } )
        .then( ( dialog ) => {
          let key = authedtoparts.user + "@" + authedtoparts.host
          console.log( "We have accepted the subscribe " )

          dialog.on( "destroy", ( dialog ) => {

          } )
        } )
    } )
  }
}
