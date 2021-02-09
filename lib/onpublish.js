/*
Listen for PUBLISH events and answer. We cannot tie PUBLISH to a REGISTRATION
without resorting to network ports and other not great solutions. So we need
to use this carefully.

Have a think about using this in conjunction with multiple and single registrations
to a user account.

We can use this to decide if an account is available or not without creating a dialog.

This is limited to single registration per account.
*/

const parseuri = require( "drachtio-srf" ).parseUri
const digestauth = require( "drachtio-mw-digest-auth" )
const assert = require( "assert" )
const crypto = require( "crypto" )

const doc = require( "./presencedocument.js" )

module.exports.use = ( options ) => {

  assert( options.em !== undefined )

  return ( req, res, next ) => {

    if ( req.method !== "PUBLISH" ) return next()

    let toparts = parseuri( req.getParsedHeader( "To" ).uri )
    digestauth( {
      proxy: true, /* 407 or 401 */
      passwordLookup: options.passwordLookup,
      realm: toparts.host
    } )( req, res, () => {

      let pub = doc.parsepidfxml( req.get( "Content-Type" ), req.body )
      if( false === pub ) {
        res.send( 400 /* Bad request - or at least we don't understand it */ )
      } else {
        options.em.emit( "presence", {
          ...pub,
          ...{
            "username": req.authorization.username,
            "realm": req.authorization.realm,
            "source": "PUBLISH"
          }
        } )

        let ifmatch = req.get( "sip-if-match" )
        /* ifmatch references the e-tag we issued in the last 200 */
        res.send( 200, {
          headers: {
            "Expires": Math.min( req.get( "expires" ), 3600 ),
            "SIP-ETag": crypto.randomBytes( 16 ).toString( "hex" )
          }
        } )
      }
    } )
  }
}
