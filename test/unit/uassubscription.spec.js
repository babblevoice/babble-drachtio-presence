

const expect = require( "chai" ).expect
const sipauth = require( "@babblevoice/babble-drachtio-auth" )
const subscription = require( "../../lib/uassubscription.js" )
const store = require( "../../lib/uasstore.js" )

describe( "subscription.spec.js", function() {

  beforeEach( () => {
    store.clear()
  } )

  it( "create - expires in contact", async function() {

    let code
    const req = {
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
        case "expires": return "60"
        case "contact": return ""
        case "call-id": return "123"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
        case "expires": return true
        case "contact": return true
        case "call-id": return true
        case "from": return true
        }
        return false
      }
    }

    const res = {
      send: async ( c /*, s */ ) => {
        code = c
      }
    }

    const options = {
      userlookup: async ( /* username, realm */ ) => {
      },
      proxy: false
    }

    const oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 60 )

    oursub.destroy()
  } )

  it( "create - expires in header", async function() {

    let code
    const req = {
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
        case "expires": return "30"
        case "contact": return ""
        case "call-id": return "123"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
        case "expires": return true
        case "contact": return true
        case "call-id": return true
        case "from": return true
        }
        return false
      }
    }

    const res = {
      send: async ( c ) => {
        code = c
      }
    }

    const options = {
      userlookup: async ( /* username, realm */ ) => {
      },
      proxy: false
    }

    const oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 30 )

    oursub.destroy()
  } )


  it( "create - callid search", async function() {

    let code
    const req = {
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
        case "expires": return "60"
        case "call-id": return "656565"
        case "contact": return ""
        }
      },
      has: ( hdr )=> {
        switch( hdr.toLowerCase() ) {
        case "expires": return true
        case "contact": return true
        case "call-id": return true
        case "from": return true
        }
        return false
      }
    }

    const res = {
      send: async ( c ) => {
        code = c
      }
    }

    const options = {
      userlookup: async ( /* username, realm */ ) => {
      },
      proxy: false
    }

    const oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 60 )
    // @ts-ignore
    expect( oursub._fqcallid ).to.equal( "656565@192.168.0.2:5444" )

    expect( store.get( "656565@192.168.0.2:5444" ).callid ).to.equal( "656565" )
    expect( store.stats().bycallid ).to.equal( 1 )

    oursub.destroy()

    expect( store.get( "656565@192.168.0.2:5444" ) ).to.be.false
    expect( store.stats().bycallid ).to.equal( 0 )
  } )


  it( "create and fail auth", async function() {

    let code
    const req = {
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
        case "expires": return "30"
        case "contact": return ""
        case "call-id": return "123"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
        case "expires": return true
        case "contact": return true
        case "call-id": return true
        case "from": return true
        }
        return false
      }
    }

    const res = {
      send: async ( c ) => {
        code = c
      }
    }

    const options = {
      userlookup: async ( /* username, realm */ ) => {
      },
      proxy: false
    }

    const oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 30 )

    await oursub._update( req, res )

    expect( code ).to.equal( 403 )
    /* the sub will now be destroyed as auth has failed */
  } )

  it( "create and pass auth", async function() {
    const username = "bob"
    const password = "zanzibar"
    const realm = "biloxi.com"
    const uri = "sip:bob@biloxi.com"
    const cnonce = "0a4f113b"
    const method = "SUBSCRIBE"

    const a = sipauth.create()
    const digest = a.calcauthhash( username, password, realm, uri, method, cnonce, "00000001" )

    const authstr = `Digest username="bob",
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
    let haveauth = false
    const req = {
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
        case "expires": return "90"
        case "authorization": return authstr
        case "accept": return "application/simple-message-summary"
        case "contact": return ""
        case "call-id": return "123"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
        case "authorization": {
          if( !haveauth ) return false
          return true
        }
        case "expires": return true
        case "contact": return true
        case "call-id": return true
        case "accept": return true
        case "from": return true
        default:
          return false
        }
      }
    }

    const res = {
      send: async ( c, /* e */ ) => {
        code = c
      }
    }

    const emited = {}
    const options = {
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

    const oursub = subscription.create( req, res, options )
    haveauth = true

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 90 )

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
    expect( emited.info.expires ).to.equal( 90 )
  } )


  it( "create and pass auth but bad accept", async function() {
    const username = "bob"
    const password = "zanzibar"
    const realm = "biloxi.com"
    const uri = "sip:bob@biloxi.com"
    const cnonce = "0a4f113b"
    const method = "SUBSCRIBE"

    const a = sipauth.create()
    const digest = a.calcauthhash( username, password, realm, uri, method, cnonce, "00000001" )

    const authstr = `Digest username="bob",
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
    let haveauth = false
    const req = {
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
        case "expires": return "90"
        case "authorization": return authstr
        case "accept": return "application/nonsense"
        case "call-id": return "123"
        }
      },
      has: ( hdr ) => {
        switch( hdr.toLowerCase() ) {
        case "authorization": {
          if( !haveauth ) return false
          return true
        }
        case "expires": return true
        case "contact": return true
        case "call-id": return true
        case "accept": return true
        case "from": return true

        default:
          return false
        }
      }
    }

    const res = {
      send: async ( c ) => {
        code = c
      }
    }

    const options = {
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

    const oursub = subscription.create( req, res, options )

    expect( code ).to.equal( 401 )
    expect( oursub.expires ).to.equal( 90 )

    oursub._auth._opaque = a._opaque
    oursub._auth._nonce = a._nonce

    haveauth = true
    await oursub._update( req, res )
    expect( code ).to.equal( 406 )

  } )
} )