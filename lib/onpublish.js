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
const assert = require( "assert" )
const crypto = require( "crypto" )

const doc = require( "./presencedocument.js" )

module.exports.use = ( options ) => {

  assert( options.em !== undefined )

  return ( req, res, next ) => {

    if ( req.method !== "PUBLISH" ) return next()

    if( !auth.has( req ) ) {
      auth.requestauth( req, res )
      return
    }

    let authorization = auth.parseauthheaders( req, res )
    if( !user ) {
      user = await this._options.userlookup( authorization.username, authorization.realm )
      if( !user ) {
        dialog.destroy()
        console.error( "Error looking up user (subscription)" )
        return
      }
      user.username = authorization.username
      user.realm = authorization.realm
      user.entity = authorization.username + "@" + authorization.realm
    }  

    let toparts = parseuri( req.getParsedHeader( "To" ).uri )
    digestauth( {
      "proxy": true, /* 407 or 401 */
      "passwordLookup": ( username, realm, cb ) => {
        options.userlookup( username, realm )
          .then( ( u ) => {
            cb( false, u.secret )
          } )
          .catch( () => {
            cb( false, false )
          } )
      },
      "realm": toparts.host
    } )( req, res, () => {

      let pub = doc.parsepidfxml( req.get( "Content-Type" ), req.body )
      if( false === pub ) {
        res.send( 400 /* Bad request - or at least we don't understand it */ )
      } else {
        options.em.emit( "presence.status.in", {
          ...pub,
          ...{
            "entity": req.authorization.username + "@" + req.authorization.realm,
            "source": {
              "event": "PUBLISH",
              "address": req.source_address,
              "port": req.source_port
            }
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
