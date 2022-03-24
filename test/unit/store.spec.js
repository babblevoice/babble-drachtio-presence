

const expect = require( "chai" ).expect
const store = require( "../../lib/store.js" )

describe( "store.spec.js", function() {

  beforeEach( () => {
    store.clear()
  } )

  it( "set", function() {
    store.set( {
      "uuid": "123",
      "uri": {
        "user": "user",
        "host": "host"
      }
    } )

    let s = store.stats()
    expect( s.bysubscribed ).to.equal( 1 )
  } )

  it( "set & delete", function() {

    let sub = {
      "uuid": "123",
      "uri": {
        "user": "user",
        "host": "host"
      }
    }

    store.set( sub )

    expect( store.stats().bysubscribed ).to.equal( 1 )

    store.delete( sub )

    expect( store.stats().bysubscribed ).to.equal( 0 )
  } )

  it( "multiple set & delete", function() {

    let subs = [ {
      "uuid": "123",
      "uri": {
        "user": "user",
        "host": "host"
      }
    },{
      "uuid": "1234",
      "uri": {
        "user": "user",
        "host": "host"
      }
    },{
      "uuid": "12345",
      "uri": {
        "user": "user2",
        "host": "host"
      }
    }
   ]

    store.set( subs[ 0 ] )
    expect( store.stats().bysubscribed ).to.equal( 1 )

    store.set( subs[ 1 ] )
    expect( store.stats().bysubscribed ).to.equal( 1 )

    store.set( subs[ 2 ] )
    expect( store.stats().bysubscribed ).to.equal( 2 )

    let ouruser = store.get( "user@host" )
    expect( ouruser.size ).to.equal( 2 )

    ouruser = store.get( "user2@host" )
    expect( ouruser.size ).to.equal( 1 )

    store.delete( subs[ 0 ] )
    expect( store.stats().bysubscribed ).to.equal( 2 )

    ouruser = store.get( "user@host" )
    expect( ouruser.size ).to.equal( 1 )

    store.delete( subs[ 1 ] )
    expect( store.stats().bysubscribed ).to.equal( 1 )

    store.delete( subs[ 2 ] )
    expect( store.stats().bysubscribed ).to.equal( 0 )
  } )
} )