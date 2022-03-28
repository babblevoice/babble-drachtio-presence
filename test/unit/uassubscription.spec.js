

const expect = require( "chai" ).expect
const sipauth = require( "babble-drachtio-auth" )
const subscription = require( "../../lib/uassubscription.js" )
const store = require( "../../lib/uasstore.js" )

describe( "subscription.spec.js", function() {

  beforeEach( () => {
    store.clear()
  } )

  it( "create - expires in contact", async function() {

    let code
    let req = {
      uri: "sip:1000@mydomain.com",
      getParsedHeader: ( hdr ) => {

        switch( hdr.toLowerCase() ) {
          case "contact":
            return [
              { 
                params: {
                  expires: 60
                }
              }
            ]

          case "from":
            return {
              uri: "sip:1000@mydomain.com"
            }
        }
      },
      get: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "expires": 
            return "61"
        }
      }
    }

    let res = {
      send: async ( c ) => {
        code = c
      }
    }

    let options = {
      userlookup: async ( username, realm ) => {
        return
      },
      proxy: false
    }

    let oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 60 )

    oursub.destroy()
  } )

  it( "create - expires in header", async function() {

    let code
    let req = {
      uri: "sip:1000@mydomain.com",
      getParsedHeader: ( hdr ) => {

        switch( hdr.toLowerCase() ) {
          case "contact":
            return [
              { 
                params: {
                }
              }
            ]

          case "from":
            return {
              uri: "sip:1000@mydomain.com"
            }
        }
      },
      get: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "expires": 
            return "30"
        }
      }
    }

    let res = {
      send: async ( c ) => {
        code = c
      }
    }

    let options = {
      userlookup: async ( username, realm ) => {
        return
      },
      proxy: false
    }

    let oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 30 )

    oursub.destroy()
  } )


  it( "create - callid search", async function() {

    let code
    let req = {
      uri: "sip:1000@mydomain.com",
      source_address: "192.168.0.2",
      source_port: "5444",
      getParsedHeader: ( hdr ) => {

        switch( hdr.toLowerCase() ) {
          case "contact":
            return [
              { 
                params: {
                  expires: 60
                }
              }
            ]

          case "from":
            return {
              uri: "sip:1000@mydomain.com"
            }
        }
      },
      get: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "expires": 
            return "61"
          case "call-id":
            return "656565"
        }
      }
    }

    let res = {
      send: async ( c ) => {
        code = c
      }
    }

    let options = {
      userlookup: async ( username, realm ) => {
        return
      },
      proxy: false
    }

    let oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 60 )
    expect( oursub._fqcallid ).to.equal( "656565@192.168.0.2:5444" )

    expect( store.get( "656565@192.168.0.2:5444" ).callid ).to.equal( "656565" )
    expect( store.stats().bycallid ).to.equal( 1 )

    oursub.destroy()

    expect( store.get( "656565@192.168.0.2:5444" ) ).to.be.false
    expect( store.stats().bycallid ).to.equal( 0 )
  } )


  it( "create and fail auth", async function() {

    let code
    let req = {
      uri: "sip:1000@mydomain.com",
      getParsedHeader: ( hdr ) => {

        switch( hdr.toLowerCase() ) {
          case "contact":
            return [
              { 
                params: {
                }
              }
            ]

          case "from":
            return {
              uri: "sip:1000@mydomain.com"
            }
        }
      },
      get: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "expires": 
            return "30"
        }
      },
      has: ( hdr ) => {
        return false
      } 
    }

    let res = {
      send: async ( c ) => {
        code = c
      }
    }

    let options = {
      userlookup: async ( username, realm ) => {
        return
      },
      proxy: false
    }

    let oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 30 )

    await oursub._update( req, res )

    expect( code ).to.equal( 403 )
    /* the sub will now be destroyed as auth has failed */
  } )

  it( "create and pass auth", async function() {
    let username = "bob"
    let password = "zanzibar"
    let realm = "biloxi.com"
    let uri = "sip:bob@biloxi.com"
    let cnonce = "0a4f113b"
    let method = "SUBSCRIBE"

    let a = sipauth.create()
    let digest = a.calcauthhash( username, password, realm, uri, method, cnonce, "00000001" )

    let authstr = `Digest username="bob",
realm="${realm}",
nonce="${a._nonce}",
uri="${uri}",
qop=auth,
algorithm=MD5,
nc=00000001,
cnonce="${cnonce}",
response="${digest}",
opaque="${a._opaque}"`

    let code
    let req = {
      uri,
      msg: { uri, method },
      getParsedHeader: ( hdr ) => {

        switch( hdr.toLowerCase() ) {
          case "contact":
            return [
              { 
                params: {
                }
              }
            ]

          case "from":
            return {
              uri
            }
        }
      },
      get: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "expires": 
            return "30"

          case "authorization":
            return authstr

          case "accept":
            return "application/simple-message-summary"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "authorization":
            return true
          default:
            return false
        }
      } 
    }

    let res = {
      send: async ( c ) => {
        code = c
      }
    }

    let emited = {}
    let options = {
      userlookup: async ( username, realm ) => {
        return {
          username,
          secret: password,
          realm
        }
      },
      proxy: false,
      srf: {
        createUAS: () => {
          /* create UAS sends 202 */
          code = 202
          return {
            on: () => {},
            destroy: () => {}

          }
        }
      },
      em: {
        emit: ( e, info ) => {
          emited.e = e
          emited.info = info
        }
      }
    }

    let oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 30 )

    oursub._auth._opaque = a._opaque
    oursub._auth._nonce = a._nonce

    await oursub._update( req, res )
    expect( code ).to.equal( 202 )


    expect( store.get( username + "@" + realm ).size ).to.equal( 1 )

    oursub.destroy()

    expect( store.get( username + "@" + realm ) ).to.be.false

    /* We MUST emit an event */
    expect( emited.e ).to.equal( "presence.voicemail.in" )
    expect( emited.info.contenttype ).to.equal( "application/simple-message-summary" )
    expect( emited.info.entity ).to.equal( "bob@biloxi.com" )
    expect( emited.info.expires ).to.equal( 30 )
  } )


  it( "create and pass auth but bad accept", async function() {
    let username = "bob"
    let password = "zanzibar"
    let realm = "biloxi.com"
    let uri = "sip:bob@biloxi.com"
    let cnonce = "0a4f113b"
    let method = "SUBSCRIBE"

    let a = sipauth.create()
    let digest = a.calcauthhash( username, password, realm, uri, method, cnonce, "00000001" )

    let authstr = `Digest username="bob",
realm="${realm}",
nonce="${a._nonce}",
uri="${uri}",
qop=auth,
algorithm=MD5,
nc=00000001,
cnonce="${cnonce}",
response="${digest}",
opaque="${a._opaque}"`

    let code
    let req = {
      uri,
      msg: { uri, method },
      getParsedHeader: ( hdr ) => {

        switch( hdr.toLowerCase() ) {
          case "contact":
            return [
              { 
                params: {
                }
              }
            ]

          case "from":
            return {
              uri
            }
        }
      },
      get: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "expires": 
            return "30"

          case "authorization":
            return authstr

          case "accept":
            return "application/nonsense"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
          case "authorization":
            return true
          default:
            return false
        }
      }
    }

    let res = {
      send: async ( c ) => {
        code = c
      }
    }

    let options = {
      userlookup: async ( username, realm ) => {
        return {
          username,
          secret: password,
          realm
        }
      },
      proxy: false,
      srf: {
        createUAS: () => {
          /* create UAS sends 202 */
          code = 202
          return {
            on: () => {},
            destroy: () => {}

          }
        }
      },
    }

    let oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 30 )

    oursub._auth._opaque = a._opaque
    oursub._auth._nonce = a._nonce

    await oursub._update( req, res )
    expect( code ).to.equal( 406 )

  } )
} )